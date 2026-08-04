import React, { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import CollapsibleCard from '../shared/CollapsibleCard.jsx'

const SETTINGS_KEY = 'mister-sscraper-online-settings'
const PLATFORM_OVERRIDES_KEY =
  'mister-sscraper-web-platform-overrides'

function loadSettings() {
  try {
    return JSON.parse(
      localStorage.getItem(SETTINGS_KEY) || '{}'
    )
  } catch {
    return {}
  }
}

function saveSettings(settings) {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify(settings)
  )
}

function loadPlatformOverrides() {
  try {
    return JSON.parse(
      localStorage.getItem(
        PLATFORM_OVERRIDES_KEY
      ) || '{}'
    )
  } catch {
    return {}
  }
}

function savePlatformOverridesLocal(
  overrides
) {
  localStorage.setItem(
    PLATFORM_OVERRIDES_KEY,
    JSON.stringify(overrides)
  )
}

function mergePlatforms(
  basePlatforms,
  overrides
) {
  const result = {
    ...basePlatforms
  }

  for (
    const [id, override] of
    Object.entries(overrides || {})
  ) {
    const current =
      result[id] || {
        id,
        name:
          override.displayName ||
          override.name ||
          id,
        aliases: [],
        folders: [],
        formats: [],
        systemeid: null
      }

    result[id] = {
      ...current,
      ...override,
      id,
      name:
        override.displayName ||
        override.name ||
        current.name ||
        id,
      aliases:
        override.aliases ??
        current.aliases ??
        [],
      folders:
        override.folders ??
        current.folders ??
        [],
      formats:
        override.formats ??
        current.formats ??
        [],
      systemeid:
        override.systemeid ??
        current.systemeid ??
        null
    }
  }

  return result
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}

function stripExtension(name) {
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(0, index) : name
}

function extension(name) {
  const index = name.lastIndexOf('.')
  return index >= 0
    ? name.slice(index).toLowerCase()
    : ''
}

function detectRegion(name) {
  const value = String(name || '').toLowerCase()

  if (/\((u|us|usa)\)|\[(u|us|usa)\]/i.test(value)) {
    return 'us'
  }

  if (/\((e|eu|europe)\)|\[(e|eu)\]/i.test(value)) {
    return 'eu'
  }

  if (/\((j|jp|japan)\)|\[(j|jp)\]/i.test(value)) {
    return 'jp'
  }

  if (/\((br|brazil|brasil)\)|\[(br)\]/i.test(value)) {
    return 'br'
  }

  if (/\((world|w)\)|\[(world|w)\]/i.test(value)) {
    return 'wor'
  }

  return 'us'
}

function FeedbackModal({ modal, onClose }) {
  if (!modal.open) {
    return null
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className={`feedback-modal modal-${modal.type}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="feedback-modal-icon">
          {modal.type === 'success'
            ? '✓'
            : modal.type === 'error'
              ? '!'
              : 'i'}
        </div>

        <div className="feedback-modal-content">
          <h2>{modal.title}</h2>
          <p>{modal.message}</p>

          {modal.details && (
            <pre className="feedback-modal-details">
              {modal.details}
            </pre>
          )}
        </div>

        <button
          className="modal-close-button"
          onClick={onClose}
        >
          Fechar
        </button>
      </div>
    </div>
  )
}

async function permissionState(handle, mode) {
  if (!handle?.queryPermission) {
    return 'unsupported'
  }

  try {
    return await handle.queryPermission({ mode })
  } catch {
    return 'prompt'
  }
}

async function requestWritePermission(handle) {
  if (!handle?.requestPermission) {
    return false
  }

  const current = await permissionState(
    handle,
    'readwrite'
  )

  if (current === 'granted') {
    return true
  }

  try {
    return (
      await handle.requestPermission({
        mode: 'readwrite'
      })
    ) === 'granted'
  } catch {
    return false
  }
}

async function findGamesHandle(selectedHandle) {
  if (
    normalize(selectedHandle.name) ===
    normalize('games')
  ) {
    return selectedHandle
  }

  try {
    return await selectedHandle.getDirectoryHandle(
      'games'
    )
  } catch {
    throw new Error(
      'A pasta selecionada não é "games" e não contém uma pasta "games".'
    )
  }
}

export default function OnlineApp() {
  const saved = loadSettings()
  const directoryInput = useRef(null)

  const [settings, setSettings] = useState({
    devid: saved.devid || '',
    devpassword: saved.devpassword || '',
    ssid: saved.ssid || '',
    sspassword: saved.sspassword || '',
    softname:
      saved.softname ||
      'MiSTerConsoleModeScraper',
    delayMs: saved.delayMs || 1500
  })

  const [basePlatforms, setBasePlatforms] =
    useState({})
  const [platformOverrides, setPlatformOverrides] =
    useState(() => loadPlatformOverrides())
  const [platforms, setPlatforms] = useState({})
  const [systems, setSystems] = useState([])
  const [unknownFolders, setUnknownFolders] =
    useState([])
  const [showPlatformEditor, setShowPlatformEditor] =
    useState(false)
  const [platformEditor, setPlatformEditor] =
    useState({
      id: '',
      displayName: '',
      folders: '',
      aliases: '',
      formats: '',
      systemeid: ''
    })
  const [selectedSystem, setSelectedSystem] =
    useState('')
  const [files, setFiles] = useState([])
  const [loadingDirectory, setLoadingDirectory] =
    useState(false)
  const [romPage, setRomPage] = useState(1)
  const [romPageSize, setRomPageSize] =
    useState(25)
  const [selectedRom, setSelectedRom] =
    useState(null)
  const [hoveredRom, setHoveredRom] =
    useState(null)
  const [hoverPreview, setHoverPreview] =
    useState({
      relativePath: '',
      boxUrl: '',
      backgroundUrl: ''
    })
  const previewUrls = useRef(new Map())
  const [running, setRunning] = useState(false)

  const onlineAbortController = useRef(null)
  const onlineStopRequested = useRef(false)
  const onlineStartedAt = useRef(null)

  const [onlineClock, setOnlineClock] =
    useState(0)
  const [logs, setLogs] = useState([])
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    rom: '',
    relativeDirectory: '.',
    outputMode: ''
  })

  const [modal, setModal] = useState({
    open: false,
    type: 'info',
    title: '',
    message: '',
    details: ''
  })

  const [storageAccess, setStorageAccess] =
    useState({
      mode: 'none',
      label: 'Nenhuma pasta selecionada',
      selectedName: '',
      gamesName: '',
      writeEnabled: false
    })

  const selectedRootHandle = useRef(null)
  const gamesDirectoryHandle = useRef(null)

  const supportsDirectWrite =
    typeof window !== 'undefined' &&
    typeof window.showDirectoryPicker ===
      'function'

  useEffect(() => {
    return () => {
      for (
        const url of
        previewUrls.current.values()
      ) {
        URL.revokeObjectURL(url)
      }

      previewUrls.current.clear()
    }
  }, [])

  useEffect(() => {
    fetch('/platforms.json')
      .then(response => {
        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          )
        }

        return response.json()
      })
      .then(catalog => {
        setBasePlatforms(catalog)

        setPlatforms(
          mergePlatforms(
            catalog,
            loadPlatformOverrides()
          )
        )
      })
      .catch(error => {
        showError(
          'Catálogo indisponível',
          'Não foi possível carregar o catálogo de plataformas.',
          error.message
        )
      })
  }, [])

  useEffect(() => {
    if (!running) {
      return undefined
    }

    setOnlineClock(Date.now())

    const timer = window.setInterval(() => {
      setOnlineClock(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [running])

  const currentFiles = useMemo(
    () =>
      files.filter(
        file =>
          file.systemId === selectedSystem
      ),
    [files, selectedSystem]
  )

  const romPageCount = Math.max(
    1,
    Math.ceil(
      currentFiles.length / romPageSize
    )
  )

  const paginatedFiles = useMemo(() => {
    const start =
      (romPage - 1) * romPageSize

    return currentFiles.slice(
      start,
      start + romPageSize
    )
  }, [
    currentFiles,
    romPage,
    romPageSize
  ])

  function showModal(
    type,
    title,
    message,
    details = ''
  ) {
    setModal({
      open: true,
      type,
      title,
      message,
      details
    })
  }

  function showError(
    title,
    message,
    details = ''
  ) {
    showModal(
      'error',
      title,
      message,
      details
    )
  }

  function addLog(message) {
    setLogs(current => [
      ...current.slice(-500),
      message
    ])
  }

  function updateSettings(patch) {
    const next = {
      ...settings,
      ...patch
    }

    setSettings(next)
    saveSettings(next)
  }

  function formatDuration(totalSeconds) {
    if (
      totalSeconds === null ||
      totalSeconds === undefined ||
      !Number.isFinite(totalSeconds)
    ) {
      return '--:--'
    }

    const seconds = Math.max(
      0,
      Math.round(totalSeconds)
    )

    const hours =
      Math.floor(seconds / 3600)
    const minutes =
      Math.floor(
        (seconds % 3600) / 60
      )
    const remainder =
      seconds % 60

    if (hours > 0) {
      return (
        `${hours}:` +
        `${String(minutes).padStart(2, '0')}:` +
        String(remainder).padStart(2, '0')
      )
    }

    return (
      `${String(minutes).padStart(2, '0')}:` +
      String(remainder).padStart(2, '0')
    )
  }

  function elapsedSeconds() {
    if (!onlineStartedAt.current) {
      return 0
    }

    return Math.max(
      0,
      (
        onlineClock -
        onlineStartedAt.current
      ) / 1000
    )
  }

  function estimatedSeconds() {
    if (progress.current <= 0) {
      return null
    }

    if (
      progress.current >= progress.total
    ) {
      return 0
    }

    return (
      elapsedSeconds() /
      progress.current
    ) * (
      progress.total -
      progress.current
    )
  }

  function identifyPlatform(
    folderName,
    catalog = platforms
  ) {
    const target = normalize(folderName)

    for (
      const platform of
      Object.values(catalog)
    ) {
      const candidates = [
        platform.id,
        platform.name,
        platform.displayName,
        ...(platform.aliases || []),
        ...(platform.folders || [])
      ]

      if (
        candidates.some(
          candidate =>
            normalize(candidate) === target
        )
      ) {
        return platform
      }
    }

    return null
  }

  function allowedExtension(
    platform,
    fileName
  ) {
    const allowed =
      (platform.formats || [])
        .map(value =>
          value
            .replace(/^\*/, '')
            .toLowerCase()
        )

    return (
      allowed.length === 0 ||
      allowed.includes(
        extension(fileName)
      )
    )
  }

  async function scanHandleDirectory(
    directoryHandle,
    relativeParts,
    systemFolder,
    platform,
    result
  ) {
    for await (
      const [name, entry] of
      directoryHandle.entries()
    ) {
      if (
        entry.kind === 'directory'
      ) {
        if (
          name.toLowerCase() === 'media'
        ) {
          continue
        }

        await scanHandleDirectory(
          entry,
          [...relativeParts, name],
          systemFolder,
          platform,
          result
        )

        continue
      }

      if (
        entry.kind !== 'file' ||
        !allowedExtension(
          platform,
          name
        )
      ) {
        continue
      }

      const file = await entry.getFile()
      const relativeDirectory =
        relativeParts.length
          ? relativeParts.join('/')
          : '.'

      const artwork =
        await readExistingArtwork(
          directoryHandle,
          stripExtension(name)
        )

      result.push({
        file,
        fileHandle: entry,
        directoryHandle,
        name,
        relativePath: [
          'games',
          systemFolder,
          ...relativeParts,
          name
        ].join('/'),
        systemId: platform.id,
        systemFolder,
        relativeDirectory,
        ...artwork
      })
    }
  }

  async function scanGamesHandle(
    gamesHandle,
    catalog = platforms
  ) {
    const mapped = []
    const detected = new Map()
    const unknown = new Set()

    for await (
      const [folderName, entry] of
      gamesHandle.entries()
    ) {
      if (entry.kind !== 'directory') {
        continue
      }

      const platform =
        identifyPlatform(
          folderName,
          catalog
        )

      if (!platform) {
        unknown.add(folderName)
        continue
      }

      detected.set(platform.id, {
        ...platform,
        folder: folderName
      })

      await scanHandleDirectory(
        entry,
        [],
        folderName,
        platform,
        mapped
      )
    }

    return {
      mapped,
      systemList:
        [...detected.values()]
          .sort((a, b) =>
            a.id.localeCompare(b.id)
          ),
      unknown
    }
  }

  async function fileExists(
    directoryHandle,
    fileName
  ) {
    if (!directoryHandle) {
      return false
    }

    try {
      await directoryHandle
        .getFileHandle(fileName)
      return true
    } catch {
      return false
    }
  }

  async function readExistingArtwork(
    directoryHandle,
    base
  ) {
    if (!directoryHandle) {
      return {
        boxExists: false,
        backgroundExists: false
      }
    }

    try {
      const mediaHandle =
        await directoryHandle
          .getDirectoryHandle('media')

      const [
        boxExists,
        backgroundExists
      ] = await Promise.all([
        fileExists(
          mediaHandle,
          `${base}.png`
        ),
        fileExists(
          mediaHandle,
          `${base}-BG.png`
        )
      ])

      return {
        boxExists,
        backgroundExists
      }
    } catch {
      return {
        boxExists: false,
        backgroundExists: false
      }
    }
  }

  async function artworkPreviewUrl(
    item,
    type
  ) {
    if (!item.directoryHandle) {
      return ''
    }

    const key =
      `${item.relativePath}:${type}`

    const cached =
      previewUrls.current.get(key)

    if (cached) {
      return cached
    }

    try {
      const mediaHandle =
        await item.directoryHandle
          .getDirectoryHandle('media')

      const base =
        stripExtension(item.name)

      const fileName =
        type === 'box'
          ? `${base}.png`
          : `${base}-BG.png`

      const handle =
        await mediaHandle
          .getFileHandle(fileName)

      const file = await handle.getFile()
      const url = URL.createObjectURL(file)

      previewUrls.current.set(key, url)
      return url
    } catch {
      return ''
    }
  }

  function clearArtworkPreview(item) {
    for (const type of [
      'box',
      'background'
    ]) {
      const key =
        `${item.relativePath}:${type}`

      const url =
        previewUrls.current.get(key)

      if (url) {
        URL.revokeObjectURL(url)
        previewUrls.current.delete(key)
      }
    }
  }

  async function openArtworkPreview(item) {
    const [boxUrl, backgroundUrl] =
      await Promise.all([
        item.boxExists
          ? artworkPreviewUrl(item, 'box')
          : Promise.resolve(''),
        item.backgroundExists
          ? artworkPreviewUrl(
              item,
              'background'
            )
          : Promise.resolve('')
      ])

    setSelectedRom({
      ...item,
      boxUrl,
      backgroundUrl
    })
  }


  async function openHoverPreview(item) {
    setHoveredRom(item)

    const [boxUrl, backgroundUrl] =
      await Promise.all([
        item.boxExists
          ? artworkPreviewUrl(item, 'box')
          : Promise.resolve(''),
        item.backgroundExists
          ? artworkPreviewUrl(
              item,
              'background'
            )
          : Promise.resolve('')
      ])

    setHoverPreview({
      relativePath:
        item.relativePath,
      boxUrl,
      backgroundUrl
    })
  }

  function closeHoverPreview() {
    setHoveredRom(null)
    setHoverPreview({
      relativePath: '',
      boxUrl: '',
      backgroundUrl: ''
    })
  }

  async function applyScanResult(
    result,
    accessDetails
  ) {
    setFiles(result.mapped)
    setSystems(result.systemList)
    setSelectedSystem(
      result.systemList[0]?.id || ''
    )
    setRomPage(1)
    setSelectedRom(null)
    setHoveredRom(null)
    setStorageAccess(accessDetails)
    setUnknownFolders(
      [...result.unknown]
        .sort((a, b) =>
          a.localeCompare(b)
        )
    )

    showModal(
      'success',
      'Cartão SD carregado',
      (
        `${result.mapped.length} ROMs ` +
        `foram reconhecidas em ` +
        `${result.systemList.length} plataformas.`
      ),
      result.unknown.size
        ? (
          'Pastas não reconhecidas: ' +
          [...result.unknown].join(', ')
        )
        : (
          accessDetails.writeEnabled
            ? (
              'Permissão de gravação concedida. ' +
              'As imagens podem ser salvas diretamente no cartão.'
            )
            : (
              'Acesso somente leitura. ' +
              'Use o botão Baixar ZIP.'
            )
        )
    )
  }

  async function readOverridesFromCard(
    gamesHandle
  ) {
    try {
      const fileHandle =
        await gamesHandle.getFileHandle(
          'peas_local.json'
        )

      const file = await fileHandle.getFile()
      const text = await file.text()
      const parsed = JSON.parse(text)

      return (
        parsed &&
        typeof parsed === 'object'
          ? parsed
          : {}
      )
    } catch {
      return {}
    }
  }

  async function writeOverridesToCard(
    overrides
  ) {
    if (
      !gamesDirectoryHandle.current ||
      !storageAccess.writeEnabled
    ) {
      return false
    }

    const fileHandle =
      await gamesDirectoryHandle.current
        .getFileHandle(
          'peas_local.json',
          { create: true }
        )

    const writable =
      await fileHandle.createWritable()

    await writable.write(
      JSON.stringify(
        overrides,
        null,
        2
      ) + '\\n'
    )

    await writable.close()
    return true
  }

  function splitEditorList(value) {
    return String(value || '')
      .split(/[\\n,]/)
      .map(item => item.trim())
      .filter(Boolean)
  }

  function platformToEditor(platform) {
    return {
      id: platform?.id || '',
      displayName:
        platform?.displayName ||
        platform?.name ||
        '',
      folders:
        (platform?.folders || [])
          .join('\\n'),
      aliases:
        (platform?.aliases || [])
          .join('\\n'),
      formats:
        (platform?.formats || [])
          .join('\\n'),
      systemeid:
        platform?.systemeid ?? ''
    }
  }

  function editSelectedPlatform() {
    const current =
      platforms[selectedSystem]

    if (!current) {
      showError(
        'Nenhuma plataforma selecionada',
        'Selecione uma plataforma primeiro.'
      )
      return
    }

    setPlatformEditor(
      platformToEditor(current)
    )
    setShowPlatformEditor(true)
  }

  function addUnknownPlatform(folder) {
    const suggestedId =
      normalize(folder) ||
      `platform-${Date.now()}`

    setPlatformEditor({
      id: suggestedId,
      displayName: folder,
      folders: folder,
      aliases: folder,
      formats:
        '*.zip\\n*.7z\\n*.bin\\n*.rom',
      systemeid: ''
    })

    setShowPlatformEditor(true)
  }

  async function savePlatformEditor() {
    const id =
      normalize(platformEditor.id)

    if (!id) {
      showError(
        'ID obrigatório',
        'Informe um ID para a plataforma.'
      )
      return
    }

    const override = {
      id,
      displayName:
        platformEditor.displayName ||
        id,
      name:
        platformEditor.displayName ||
        id,
      folders:
        splitEditorList(
          platformEditor.folders
        ),
      aliases:
        splitEditorList(
          platformEditor.aliases
        ),
      formats:
        splitEditorList(
          platformEditor.formats
        ),
      systemeid:
        platformEditor.systemeid === ''
          ? null
          : Number(
              platformEditor.systemeid
            )
    }

    const nextOverrides = {
      ...platformOverrides,
      [id]: override
    }

    setPlatformOverrides(nextOverrides)
    savePlatformOverridesLocal(
      nextOverrides
    )

    const nextCatalog =
      mergePlatforms(
        basePlatforms,
        nextOverrides
      )

    setPlatforms(nextCatalog)
    setShowPlatformEditor(false)

    let cardSaved = false

    if (storageAccess.writeEnabled) {
      try {
        cardSaved =
          await writeOverridesToCard(
            nextOverrides
          )
      } catch (error) {
        showError(
          'Salvo no navegador, mas não no cartão',
          error.message
        )
      }
    }

    showModal(
      'success',
      'Plataforma salva',
      (
        `${override.displayName} foi salva ` +
        'no armazenamento do navegador.'
      ),
      cardSaved
        ? (
          'Também foi gravada em ' +
          'games/peas_local.json no cartão.'
        )
        : (
          'Para salvar no cartão, conceda ' +
          'permissão de gravação.'
        )
    )

    if (gamesDirectoryHandle.current) {
      setLoadingDirectory(true)

      try {
        const result =
          await scanGamesHandle(
            gamesDirectoryHandle.current,
            nextCatalog
          )

        await applyScanResult(
          result,
          storageAccess
        )
      } finally {
        setLoadingDirectory(false)
      }
    }
  }

  async function removePlatformOverride() {
    const id =
      normalize(platformEditor.id)

    if (!id) {
      return
    }

    const nextOverrides = {
      ...platformOverrides
    }

    delete nextOverrides[id]

    setPlatformOverrides(nextOverrides)
    savePlatformOverridesLocal(
      nextOverrides
    )

    const nextCatalog =
      mergePlatforms(
        basePlatforms,
        nextOverrides
      )

    setPlatforms(nextCatalog)
    setShowPlatformEditor(false)

    if (storageAccess.writeEnabled) {
      await writeOverridesToCard(
        nextOverrides
      )
    }

    showModal(
      'success',
      'Sobrescrita removida',
      'A plataforma voltou ao catálogo padrão.'
    )
  }

  async function chooseSdCard() {
    if (!supportsDirectWrite) {
      directoryInput.current?.click()
      return
    }

    showModal(
      'info',
      'Permissão do cartão SD',
      (
        'Selecione a raiz do cartão SD ou a pasta games. ' +
        'O Chrome/Edge solicitará permissão de leitura e gravação.'
      ),
      (
        'As imagens serão criadas dentro das pastas media, ' +
        'ao lado das ROMs. Você pode negar a gravação e continuar via ZIP.'
      )
    )

    try {
      setLoadingDirectory(true)

      const selected =
        await window.showDirectoryPicker({
          id: 'mister-sd-card',
          mode: 'readwrite'
        })

      selectedRootHandle.current =
        selected

      const gamesHandle =
        await findGamesHandle(selected)

      gamesDirectoryHandle.current =
        gamesHandle

      const canWrite =
        await requestWritePermission(
          selected
        )

      const cardOverrides =
        await readOverridesFromCard(
          gamesHandle
        )

      const mergedOverrides = {
        ...loadPlatformOverrides(),
        ...cardOverrides
      }

      setPlatformOverrides(
        mergedOverrides
      )
      savePlatformOverridesLocal(
        mergedOverrides
      )

      const effectiveCatalog =
        mergePlatforms(
          basePlatforms,
          mergedOverrides
        )

      setPlatforms(
        effectiveCatalog
      )

      const result =
        await scanGamesHandle(
          gamesHandle,
          effectiveCatalog
        )

      await applyScanResult(
        result,
        {
          mode:
            canWrite
              ? 'readwrite'
              : 'readonly',
          label:
            canWrite
              ? 'Acesso de gravação'
              : 'Somente leitura',
          selectedName:
            selected.name,
          gamesName:
            gamesHandle.name,
          writeEnabled:
            canWrite
        }
      )
    } catch (error) {
      if (error?.name === 'AbortError') {
        showModal(
          'info',
          'Seleção cancelada',
          'Nenhuma pasta foi selecionada.'
        )
      } else {
        showError(
          'Não foi possível abrir o cartão SD',
          error.message,
          (
            'Selecione a raiz do cartão que contém games, ' +
            'ou selecione diretamente a pasta games.'
          )
        )
      }
    } finally {
      setLoadingDirectory(false)
    }
  }

  async function selectReadOnlyDirectory(
    event
  ) {
    const selected =
      Array.from(
        event.target.files || []
      )

    event.target.value = ''

    if (!selected.length) {
      return
    }

    setLoadingDirectory(true)

    await new Promise(resolve =>
      requestAnimationFrame(resolve)
    )

    try {
      const mapped = []
      const detected = new Map()
      const unknown = new Set()

      const sampleParts =
        selected[0]
          .webkitRelativePath
          .split('/')

      const selectedFolderName =
        sampleParts[0] || 'games'

      const gamesIndex =
        normalize(selectedFolderName) ===
        normalize('games')
          ? 0
          : sampleParts.findIndex(
            part =>
              normalize(part) ===
              normalize('games')
          )

      if (gamesIndex < 0) {
        throw new Error(
          'A pasta selecionada não contém a pasta games.'
        )
      }

      for (const file of selected) {
        const parts =
          file.webkitRelativePath
            .split('/')

        const currentGamesIndex =
          normalize(parts[0]) ===
          normalize('games')
            ? 0
            : parts.findIndex(
              part =>
                normalize(part) ===
                normalize('games')
            )

        if (
          currentGamesIndex < 0 ||
          parts.length <
            currentGamesIndex + 3
        ) {
          continue
        }

        const systemFolder =
          parts[currentGamesIndex + 1]

        const platform =
          identifyPlatform(
            systemFolder
          )

        if (!platform) {
          unknown.add(systemFolder)
          continue
        }

        if (
          !allowedExtension(
            platform,
            file.name
          )
        ) {
          continue
        }

        detected.set(
          platform.id,
          {
            ...platform,
            folder: systemFolder
          }
        )

        const relativeParts =
          parts.slice(
            currentGamesIndex + 2,
            -1
          )

        mapped.push({
          file,
          fileHandle: null,
          directoryHandle: null,
          name: file.name,
          relativePath:
            file.webkitRelativePath,
          systemId: platform.id,
          systemFolder,
          relativeDirectory:
            relativeParts.length
              ? relativeParts.join('/')
              : '.',
          boxExists: false,
          backgroundExists: false
        })
      }

      await applyScanResult(
        {
          mapped,
          systemList:
            [...detected.values()]
              .sort((a, b) =>
                a.id.localeCompare(b.id)
              ),
          unknown
        },
        {
          mode: 'readonly',
          label: 'Somente leitura',
          selectedName:
            selectedFolderName,
          gamesName: 'games',
          writeEnabled: false
        }
      )
    } catch (error) {
      showError(
        'Erro ao analisar o diretório',
        error.message
      )
    } finally {
      setLoadingDirectory(false)
    }
  }

  function validateCredentials() {
    if (
      !settings.devid ||
      !settings.devpassword ||
      !settings.ssid ||
      !settings.sspassword
    ) {
      showError(
        'Credenciais incompletas',
        (
          'Preencha todos os campos do ' +
          'ScreenScraper antes de continuar.'
        )
      )

      return false
    }

    return true
  }

  async function testScreenScraper() {
    if (!validateCredentials()) {
      return
    }

    try {
      const params =
        new URLSearchParams({
          devid: settings.devid,
          devpassword:
            settings.devpassword,
          softname:
            settings.softname,
          ssid: settings.ssid,
          sspassword:
            settings.sspassword,
          output: 'json'
        })

      const response = await fetch(
        (
          'https://api.screenscraper.fr/' +
          `api2/ssuserInfos.php?${params}`
        )
      )

      const text =
        await response.text()

      if (
        !response.ok ||
        /Erreur de login/i.test(text)
      ) {
        throw new Error(
          text.slice(0, 500) ||
          `HTTP ${response.status}`
        )
      }

      showModal(
        'success',
        'ScreenScraper conectado',
        (
          'As credenciais foram ' +
          'validadas com sucesso.'
        )
      )
    } catch (error) {
      showError(
        'Falha no teste do ScreenScraper',
        (
          'A API rejeitou a chamada ' +
          'ou o navegador bloqueou a requisição.'
        ),
        (
          `${error.message}\n\n` +
          'Caso seja CORS, será necessário usar ' +
          'uma função proxy no Worker.'
        )
      )
    }
  }

  function baseParams() {
    return new URLSearchParams({
      devid: settings.devid,
      devpassword:
        settings.devpassword,
      softname: settings.softname,
      ssid: settings.ssid,
      sspassword:
        settings.sspassword,
      output: 'json'
    })
  }

  async function findGame(
    platform,
    item,
    signal
  ) {
    const params = baseParams()

    params.set(
      'systemeid',
      platform.systemeid
    )
    params.set('romtype', 'rom')
    params.set('romnom', item.name)
    params.set(
      'romtaille',
      item.file.size
    )

    const response = await fetch(
      (
        'https://api.screenscraper.fr/' +
        `api2/jeuInfos.php?${params}`
      ),
      { signal }
    )

    const text =
      await response.text()

    if (!response.ok) {
      throw new Error(
        (
          `jeuInfos HTTP ${response.status}: ` +
          text.slice(0, 300)
        )
      )
    }

    if (/Erreur de login/i.test(text)) {
      throw new Error(
        text.slice(0, 300)
      )
    }

    const json = JSON.parse(text)

    return (
      json?.response?.jeu ||
      null
    )
  }

  function gameMediaEntries(game) {
    const medias =
      game?.medias?.media ??
      game?.medias ??
      []

    if (Array.isArray(medias)) {
      return medias
    }

    if (
      medias &&
      typeof medias === 'object'
    ) {
      return Object.values(medias)
        .flat()
        .filter(Boolean)
    }

    return []
  }

  function gameMediaType(entry) {
    return String(
      entry?.type ??
      entry?.["@_type"] ??
      entry?.mediatype ??
      ''
    ).trim()
  }

  function gameMediaRegion(entry) {
    return String(
      entry?.region ??
      entry?.["@_region"] ??
      ''
    ).trim().toLowerCase()
  }

  function mediaCandidates(
    game,
    media,
    preferredRegion
  ) {
    const availableRegions =
      gameMediaEntries(game)
        .filter(entry =>
          gameMediaType(entry)
            .toLowerCase() ===
          String(media).toLowerCase()
        )
        .map(gameMediaRegion)

    const fallbackRegions = [
      preferredRegion,
      'us',
      'wor',
      'eu',
      'br',
      'jp',
      'au',
      'kr',
      'ss'
    ].filter(Boolean)

    const orderedAvailable = [
      ...fallbackRegions.filter(
        region =>
          availableRegions.includes(
            region
          )
      ),
      ...availableRegions.filter(
        region =>
          !fallbackRegions.includes(
            region
          )
      )
    ]

    return [
      ...new Set([
        ...orderedAvailable.map(
          region =>
            `${media}(${region})`
        ),
        ...fallbackRegions.map(
          region =>
            `${media}(${region})`
        ),
        media
      ])
    ]
  }

  async function downloadMedia(
    platform,
    game,
    media,
    region,
    signal
  ) {
    const attempts =
      mediaCandidates(
        game,
        media,
        region
      )

    for (
      const mediaName of attempts
    ) {
      const params = baseParams()

      params.set(
        'systemeid',
        platform.systemeid
      )
      params.set('jeuid', game.id)
      params.set('media', mediaName)
      params.set(
        'outputformat',
        'png'
      )

      const response = await fetch(
        (
          'https://api.screenscraper.fr/' +
          `api2/mediaJeu.php?${params}`
        ),
        { signal }
      )

      if (!response.ok) {
        continue
      }

      const blob =
        await response.blob()

      if (
        blob.size > 8 &&
        blob.type.startsWith('image/')
      ) {
        return blob
      }
    }

    return null
  }

  async function writeBlob(
    directoryHandle,
    fileName,
    blob
  ) {
    const mediaHandle =
      await directoryHandle
        .getDirectoryHandle(
          'media',
          { create: true }
        )

    const fileHandle =
      await mediaHandle
        .getFileHandle(
          fileName,
          { create: true }
        )

    const writable =
      await fileHandle
        .createWritable()

    await writable.write(blob)
    await writable.close()
  }

  function sleep(ms) {
    return new Promise(resolve =>
      setTimeout(resolve, ms)
    )
  }

  async function startScrape(
    outputMode
  ) {
    if (!validateCredentials()) {
      return
    }

    if (
      !selectedSystem ||
      !currentFiles.length
    ) {
      showError(
        'Nenhuma ROM selecionada',
        (
          'Escolha o cartão SD ou ' +
          'a pasta games e selecione uma plataforma.'
        )
      )
      return
    }

    if (
      outputMode === 'direct' &&
      !storageAccess.writeEnabled
    ) {
      showError(
        'Gravação não autorizada',
        (
          'O navegador não possui permissão ' +
          'para gravar no cartão SD.'
        ),
        (
          'Selecione novamente o cartão no Chrome/Edge ' +
          'e permita leitura e gravação, ou use Baixar ZIP.'
        )
      )
      return
    }

    const platform =
      platforms[selectedSystem]

    if (!platform?.systemeid) {
      showError(
        'ScreenScraper ID ausente',
        (
          `A plataforma ${selectedSystem} ` +
          'não possui ScreenScraper ID configurado.'
        )
      )
      return
    }

    const controller =
      new AbortController()

    onlineAbortController.current =
      controller
    onlineStopRequested.current =
      false
    onlineStartedAt.current =
      Date.now()

    setOnlineClock(Date.now())
    setRunning(true)
    setLogs([])
    setProgress({
      current: 0,
      total:
        currentFiles.length,
      rom: '',
      relativeDirectory: '.',
      outputMode
    })

    const zip =
      outputMode === 'zip'
        ? new JSZip()
        : null

    const platformFolder =
      systems.find(
        system =>
          system.id ===
          selectedSystem
      )?.folder || platform.id

    let found = 0
    let missing = 0
    let failed = 0

    try {
      for (
        let index = 0;
        index < currentFiles.length;
        index++
      ) {
        if (
          controller.signal.aborted ||
          onlineStopRequested.current
        ) {
          throw new DOMException(
            'Scraping interrompido',
            'AbortError'
          )
        }

        const item =
          currentFiles[index]

        setProgress({
          current: index + 1,
          total:
            currentFiles.length,
          rom: item.name,
          relativeDirectory:
            item.relativeDirectory,
          outputMode
        })

        addLog(
          (
            `[${index + 1}/` +
            `${currentFiles.length}] ` +
            `${item.name}`
          )
        )

        try {
          const game =
            await findGame(
              platform,
              item,
              controller.signal
            )

          if (!game?.id) {
            missing++
            addLog('  NÃO ENCONTRADO')
            continue
          }

          const base =
            stripExtension(item.name)

          const region =
            detectRegion(item.name)

          await sleep(
            settings.delayMs
          )

          const box =
            await downloadMedia(
              platform,
              game,
              'box-2D',
              region,
              controller.signal
            )

          await sleep(
            settings.delayMs
          )

          const background =
            await downloadMedia(
              platform,
              game,
              'ss',
              region,
              controller.signal
            )

          if (outputMode === 'direct') {
            if (!item.directoryHandle) {
              throw new Error(
                (
                  'Esta seleção está em modo somente leitura. ' +
                  'Use Baixar ZIP.'
                )
              )
            }

            if (box) {
              await writeBlob(
                item.directoryHandle,
                `${base}.png`,
                box
              )
            }

            if (background) {
              await writeBlob(
                item.directoryHandle,
                `${base}-BG.png`,
                background
              )
            }

            clearArtworkPreview(item)

            setFiles(current =>
              current.map(currentItem =>
                currentItem.relativePath ===
                item.relativePath
                  ? {
                      ...currentItem,
                      boxExists:
                        currentItem.boxExists ||
                        Boolean(box),
                      backgroundExists:
                        currentItem.backgroundExists ||
                        Boolean(background)
                    }
                  : currentItem
              )
            )
          } else {
            const directoryPrefix =
              item.relativeDirectory === '.'
                ? platformFolder
                : (
                  `${platformFolder}/` +
                  item.relativeDirectory
                )

            const mediaFolder =
              zip.folder(
                `${directoryPrefix}/media`
              )

            if (box) {
              mediaFolder.file(
                `${base}.png`,
                box
              )
            }

            if (background) {
              mediaFolder.file(
                `${base}-BG.png`,
                background
              )
            }
          }

          if (box || background) {
            found++

            addLog(
              outputMode === 'direct'
                ? '  OK: salvo no cartão'
                : '  OK: adicionado ao ZIP'
            )
          } else {
            missing++
            addLog('  SEM MÍDIA')
          }
        } catch (error) {
          if (
            error.name === 'AbortError'
          ) {
            throw error
          }

          failed++
          addLog(
            `  ERRO: ${error.message}`
          )
        }
      }

      if (!found) {
        throw new Error(
          (
            'Nenhuma imagem foi salva. ' +
            'Verifique credenciais, nomes das ROMs e CORS.'
          )
        )
      }

      if (outputMode === 'zip') {
        const content =
          await zip.generateAsync({
            type: 'blob'
          })

        const url =
          URL.createObjectURL(content)

        const link =
          document.createElement('a')

        link.href = url
        link.download =
          `MiSTer-Artwork-${platform.id}.zip`

        link.click()
        URL.revokeObjectURL(url)
      }

      showModal(
        'success',
        outputMode === 'direct'
          ? 'Cartão SD atualizado'
          : 'ZIP gerado',
        outputMode === 'direct'
          ? (
            `${found} jogos tiveram artwork ` +
            'salvo diretamente no cartão.'
          )
          : (
            `${found} jogos foram adicionados ao ZIP.`
          ),
        (
          `Não encontrados/sem mídia: ${missing}\n` +
          `Erros: ${failed}`
        )
      )
    } catch (error) {
      if (
        error.name === 'AbortError' ||
        onlineStopRequested.current
      ) {
        addLog(
          'PROCESSO INTERROMPIDO PELO USUÁRIO'
        )

        showModal(
          'info',
          'Scraping interrompido',
          'O processo foi parado pelo usuário.',
          (
            `${progress.current} de ` +
            `${progress.total} ROMs haviam sido processadas.`
          )
        )
      } else {
        showError(
          'Falha durante o scraping',
          error.message,
          (
            'Os detalhes completos permanecem ' +
            'no card de log.'
          )
        )
      }
    } finally {
      onlineAbortController.current =
        null
      setRunning(false)
      onlineStartedAt.current = null
    }
  }

  function stopScrape() {
    if (!running) {
      return
    }

    onlineStopRequested.current =
      true

    onlineAbortController.current
      ?.abort()
  }

  const accessClass =
    storageAccess.writeEnabled
      ? 'write-access'
      : storageAccess.mode === 'readonly'
        ? 'read-access'
        : 'no-access'

  const progressPercent =
    progress.total
      ? Math.round(
          (
            progress.current /
            progress.total
          ) * 100
        )
      : 0

  return (
    <div className="app">
      <header>
        <div>
          <h1>MiSTer ScreenScraper</h1>
          <p>
            Modo web — cartão SD, gravação direta
            e download ZIP
          </p>
        </div>

        <div className="header-controls">
          <span className="execution-mode-badge web-mode">
            WEB
          </span>

          <span
            className={`status ${
              running ? 'running' : ''
            }`}
          >
            {running
              ? 'PROCESSANDO'
              : 'PRONTO'}
          </span>
        </div>
      </header>

      <main>
        <CollapsibleCard
          id="web-info"
          title="Modo web"
          className="web-mode-info"
          defaultCollapsed
        >
          <p>
            No Chrome ou Edge, escolha o cartão SD
            e autorize a gravação direta. Em outros
            navegadores, use o download ZIP.
          </p>
        </CollapsibleCard>

        <CollapsibleCard
          id="web-credentials"
          title="Credenciais ScreenScraper"
          className="settings-card"
        >
          <div className="settings-grid online-settings-grid">
            <label className="field">
              Developer ID
              <input
                value={settings.devid}
                onChange={event =>
                  updateSettings({
                    devid:
                      event.target.value
                  })
                }
              />
            </label>

            <label className="field">
              Developer Password
              <input
                type="password"
                value={settings.devpassword}
                onChange={event =>
                  updateSettings({
                    devpassword:
                      event.target.value
                  })
                }
              />
            </label>

            <label className="field">
              Usuário
              <input
                value={settings.ssid}
                onChange={event =>
                  updateSettings({
                    ssid:
                      event.target.value
                  })
                }
              />
            </label>

            <label className="field">
              Senha
              <input
                type="password"
                value={settings.sspassword}
                onChange={event =>
                  updateSettings({
                    sspassword:
                      event.target.value
                  })
                }
              />
            </label>
          </div>

          <button
            className="small"
            onClick={testScreenScraper}
          >
            Testar ScreenScraper
          </button>

          <p className="settings-note">
            As credenciais ficam apenas no
            localStorage deste navegador.
          </p>
        </CollapsibleCard>

        <CollapsibleCard
          id="web-storage"
          title="Cartão SD / pasta games"
          badge={files.length}
          className="sd-card-selector"
        >
          <input
            ref={directoryInput}
            className="directory-input"
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            onChange={selectReadOnlyDirectory}
          />

          <button
            onClick={chooseSdCard}
            disabled={
              loadingDirectory ||
              running
            }
          >
            {loadingDirectory
              ? 'Lendo cartão SD...'
              : 'Escolher cartão SD ou pasta games'}
          </button>

          <div
            className={`storage-access-indicator ${accessClass}`}
          >
            <span className="storage-access-dot" />

            <div>
              <strong>
                {storageAccess.label}
              </strong>

              <small>
                {storageAccess.selectedName
                  ? (
                    `Selecionado: ${
                      storageAccess.selectedName
                    }${
                      storageAccess.gamesName
                        ? ` / ${
                            storageAccess.gamesName
                          }`
                        : ''
                    }`
                  )
                  : (
                    supportsDirectWrite
                      ? (
                        'Chrome/Edge: leitura e gravação disponíveis'
                      )
                      : (
                        'Somente leitura; saída por ZIP'
                      )
                  )}
              </small>
            </div>
          </div>

          <div className="paths">
            <div>
              <b>Plataformas:</b>{' '}
              {systems.length}
            </div>

            <div>
              <b>ROMs:</b>{' '}
              {files.length}
            </div>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          id="web-platform"
          title="Plataforma"
          badge={currentFiles.length}
          actions={
            <button
              className="small"
              onClick={() => {
                if (showPlatformEditor) {
                  setShowPlatformEditor(false)
                } else {
                  editSelectedPlatform()
                }
              }}
              disabled={!selectedSystem}
            >
              {showPlatformEditor
                ? 'Fechar editor'
                : 'Editar plataforma'}
            </button>
          }
        >
          <select
            value={selectedSystem}
            onChange={event => {
              setSelectedSystem(
                event.target.value
              )
              setRomPage(1)
              setSelectedRom(null)
              setHoveredRom(null)
            }}
            disabled={running}
          >
            {!systems.length && (
              <option value="">
                Nenhuma plataforma
              </option>
            )}

            {systems.map(system => (
              <option
                key={system.id}
                value={system.id}
              >
                {system.folder} ({system.id})
              </option>
            ))}
          </select>

          <div className="paths">
            <div>
              <b>ROMs:</b>{' '}
              {currentFiles.length}
            </div>

            <div>
              <b>ScreenScraper ID:</b>{' '}
              {
                platforms[selectedSystem]
                  ?.systemeid ??
                'não configurado'
              }
            </div>
          </div>
        </CollapsibleCard>

        {showPlatformEditor && (
          <CollapsibleCard
            id="web-platform-editor"
            title="Editor de plataforma"
            className="platform-editor web-platform-editor"
          >
            <div className="platform-editor-fields">
              <label className="field">
                ID
                <input
                  value={platformEditor.id}
                  onChange={event =>
                    setPlatformEditor({
                      ...platformEditor,
                      id: event.target.value
                    })
                  }
                />
              </label>

              <label className="field">
                Nome exibido
                <input
                  value={platformEditor.displayName}
                  onChange={event =>
                    setPlatformEditor({
                      ...platformEditor,
                      displayName:
                        event.target.value
                    })
                  }
                />
              </label>

              <label className="field">
                Pastas reconhecidas
                <textarea
                  value={platformEditor.folders}
                  onChange={event =>
                    setPlatformEditor({
                      ...platformEditor,
                      folders:
                        event.target.value
                    })
                  }
                  placeholder="MegaDrive&#10;Genesis"
                />
              </label>

              <label className="field">
                Aliases
                <textarea
                  value={platformEditor.aliases}
                  onChange={event =>
                    setPlatformEditor({
                      ...platformEditor,
                      aliases:
                        event.target.value
                    })
                  }
                />
              </label>

              <label className="field">
                Formatos
                <textarea
                  value={platformEditor.formats}
                  onChange={event =>
                    setPlatformEditor({
                      ...platformEditor,
                      formats:
                        event.target.value
                    })
                  }
                  placeholder="*.zip&#10;*.bin"
                />
              </label>

              <label className="field">
                ScreenScraper ID
                <input
                  type="number"
                  value={platformEditor.systemeid}
                  onChange={event =>
                    setPlatformEditor({
                      ...platformEditor,
                      systemeid:
                        event.target.value
                    })
                  }
                />
              </label>
            </div>

            <div className="editor-actions">
              <button
                onClick={savePlatformEditor}
              >
                Salvar plataforma
              </button>

              <button
                className="small"
                onClick={removePlatformOverride}
              >
                Restaurar padrão
              </button>

              <button
                className="small"
                onClick={() =>
                  setShowPlatformEditor(false)
                }
              >
                Cancelar
              </button>
            </div>
          </CollapsibleCard>
        )}

        <CollapsibleCard
          id="web-platform-editor-tools"
          title="Gerenciar plataformas"
          badge={unknownFolders.length}
          defaultCollapsed={
            unknownFolders.length === 0
          }
          className="web-platform-tools"
        >
          <p className="settings-note platform-manager-note">
            Pastas não reconhecidas podem ser adicionadas
            manualmente ao catálogo. As alterações são salvas
            no navegador e, com permissão, em
            games/peas_local.json.
          </p>

          {unknownFolders.length > 0 && (
            <>
              <h3 className="platform-subtitle">
                Pastas não reconhecidas
              </h3>

              <div className="suggestion-list">
                {unknownFolders.map(folder => (
                  <div
                    className="suggestion-item"
                    key={folder}
                  >
                    <div>
                      <strong>{folder}</strong>
                      <small>
                        Adicione manualmente ao catálogo
                      </small>
                    </div>

                    <button
                      className="small"
                      onClick={() =>
                        addUnknownPlatform(folder)
                      }
                    >
                      Adicionar plataforma
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </CollapsibleCard>

        <CollapsibleCard
          id="web-roms"
          title="ROMs"
          badge={
            loadingDirectory
              ? '...'
              : currentFiles.length
          }
          className="roms-card"
        >
          {loadingDirectory && (
            <div
              className="rom-loading-overlay"
              role="status"
            >
              <div
                className="neon-spinner"
                aria-hidden="true"
              />

              <strong>
                Escaneando cartão SD
              </strong>

              <span>
                Identificando plataformas,
                subpastas, ROMs e mídias...
              </span>
            </div>
          )}

          <div className="rom-options-panel web-rom-options">
            <div className="web-output-mode">
              <span>Saída do artwork</span>
              <small>
                {storageAccess.writeEnabled
                  ? 'Gravação direta ou ZIP'
                  : 'Somente ZIP disponível'}
              </small>
            </div>

            <div className="web-output-actions">
              {running ? (
                <button
                  className="stop-scrape-button"
                  onClick={stopScrape}
                >
                  ■ Parar Scraper
                </button>
              ) : (
                <>
                  <button
                    className="direct-save-button"
                    onClick={() =>
                      startScrape('direct')
                    }
                    disabled={
                      !currentFiles.length ||
                      !storageAccess.writeEnabled
                    }
                  >
                    Salvar diretamente no cartão
                  </button>

                  <button
                    className="zip-download-button"
                    onClick={() =>
                      startScrape('zip')
                    }
                    disabled={!currentFiles.length}
                  >
                    Baixar ZIP
                  </button>
                </>
              )}
            </div>
          </div>

          {running && (
            <div className="scrape-progress-panel scrape-progress-rich">
              <div className="scrape-cover-placeholder">
                <span>ARTWORK</span>
                <small>
                  {progress.outputMode === 'direct'
                    ? 'Salvando no cartão'
                    : 'Adicionando ao ZIP'}
                </small>
              </div>

              <div className="scrape-progress-main">
                <div className="scrape-progress-header">
                  <strong>
                    Processando ROMs
                  </strong>

                  <span>
                    {progress.current} / {progress.total}
                  </span>
                </div>

                <div className="scrape-progress-track">
                  <div
                    className="scrape-progress-fill"
                    style={{
                      width:
                        `${progressPercent}%`
                    }}
                  />
                </div>

                <div className="scrape-progress-metrics">
                  <div>
                    <small>Progresso</small>
                    <strong>
                      {progressPercent}%
                    </strong>
                  </div>

                  <div>
                    <small>Faltam</small>
                    <strong>
                      {Math.max(
                        0,
                        progress.total -
                        progress.current
                      )}
                    </strong>
                  </div>

                  <div>
                    <small>Decorrido</small>
                    <strong>
                      {formatDuration(
                        elapsedSeconds()
                      )}
                    </strong>
                  </div>

                  <div>
                    <small>Estimativa</small>
                    <strong>
                      {formatDuration(
                        estimatedSeconds()
                      )}
                    </strong>
                  </div>
                </div>

                <div className="scrape-current-rom">
                  <span>Atual</span>
                  <strong>
                    {progress.rom ||
                      'Preparando fila...'}
                  </strong>

                  {progress.relativeDirectory !== '.' && (
                    <small>
                      {progress.relativeDirectory}
                    </small>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="rom-toolbar">
            <div className="rom-page-info">
              Página {romPage} de {romPageCount}
            </div>

            <label className="rom-page-size">
              Itens por página

              <select
                value={romPageSize}
                onChange={event => {
                  setRomPageSize(
                    Number(
                      event.target.value
                    )
                  )
                  setRomPage(1)
                }}
                disabled={
                  loadingDirectory ||
                  running
                }
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>

          <div className="rom-list">
            {paginatedFiles.map(item => (
              <button
                type="button"
                className={`rom rom-button rom-with-preview ${
                  selectedRom?.relativePath ===
                  item.relativePath
                    ? 'selected'
                    : ''
                }`}
                key={item.relativePath}
                onClick={() =>
                  openArtworkPreview(item)
                }
                onMouseEnter={() =>
                  openHoverPreview(item)
                }
                onMouseLeave={
                  closeHoverPreview
                }
              >
                <div className="rom-main-info">
                  <span className="rom-name">
                    {item.name}
                  </span>

                  <small className="rom-directory">
                    {item.relativeDirectory === '.'
                      ? item.systemFolder
                      : (
                        `${item.systemFolder}/` +
                        item.relativeDirectory
                      )}
                  </small>
                </div>

                <div className="rom-art-status">
                  <span
                    className={`art-indicator ${
                      item.boxExists
                        ? 'has-art'
                        : 'missing-art'
                    }`}
                  >
                    Capa
                  </span>

                  <span
                    className={`art-indicator ${
                      item.backgroundExists
                        ? 'has-art'
                        : 'missing-art'
                    }`}
                  >
                    Fundo
                  </span>
                </div>

                {hoveredRom?.relativePath ===
                  item.relativePath && (
                  <div className="rom-hover-preview">
                    <div className="preview-panel">
                      <strong>Capa</strong>
                      {item.boxExists &&
                      hoverPreview.relativePath ===
                        item.relativePath &&
                      hoverPreview.boxUrl ? (
                        <img
                          src={hoverPreview.boxUrl}
                          alt={`Capa de ${item.name}`}
                        />
                      ) : (
                        <div className="preview-missing">
                          {item.boxExists
                            ? 'Carregando capa...'
                            : 'Sem capa'}
                        </div>
                      )}
                    </div>

                    <div className="preview-panel">
                      <strong>Fundo</strong>
                      {item.backgroundExists &&
                      hoverPreview.relativePath ===
                        item.relativePath &&
                      hoverPreview.backgroundUrl ? (
                        <img
                          src={hoverPreview.backgroundUrl}
                          alt={`Fundo de ${item.name}`}
                        />
                      ) : (
                        <div className="preview-missing">
                          {item.backgroundExists
                            ? 'Carregando fundo...'
                            : 'Sem fundo'}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </button>
            ))}

            {!paginatedFiles.length && (
              <p className="muted">
                Nenhuma ROM selecionada.
              </p>
            )}
          </div>

          <div className="rom-pagination">
            <button
              className="small"
              onClick={() =>
                setRomPage(page =>
                  Math.max(1, page - 1)
                )
              }
              disabled={
                running ||
                romPage <= 1
              }
            >
              Anterior
            </button>

            <span>
              {romPage} / {romPageCount}
            </span>

            <button
              className="small"
              onClick={() =>
                setRomPage(page =>
                  Math.min(
                    romPageCount,
                    page + 1
                  )
                )
              }
              disabled={
                running ||
                romPage >= romPageCount
              }
            >
              Próxima
            </button>
          </div>
        </CollapsibleCard>

        {selectedRom && (
          <CollapsibleCard
            id="web-preview"
            title={`Preview: ${selectedRom.name}`}
            className="preview-card"
          >
            <div className="artwork-preview-grid">
              <div className="artwork-preview-item">
                <h3>Capa</h3>

                {selectedRom.boxUrl ? (
                  <img
                    src={selectedRom.boxUrl}
                    alt={`Capa de ${selectedRom.name}`}
                  />
                ) : (
                  <div className="preview-missing">
                    Sem capa
                  </div>
                )}
              </div>

              <div className="artwork-preview-item">
                <h3>Fundo</h3>

                {selectedRom.backgroundUrl ? (
                  <img
                    src={selectedRom.backgroundUrl}
                    alt={`Fundo de ${selectedRom.name}`}
                  />
                ) : (
                  <div className="preview-missing">
                    Sem fundo
                  </div>
                )}
              </div>
            </div>
          </CollapsibleCard>
        )}

        <CollapsibleCard
          id="web-log"
          title="Log técnico"
          className="web-log-card"
          defaultCollapsed
        >
          <pre className="log">
            {logs.join('\n') || 'Aguardando...'}
          </pre>
        </CollapsibleCard>
      </main>

      <FeedbackModal
        modal={modal}
        onClose={() =>
          setModal(current => ({
            ...current,
            open: false
          }))
        }
      />
    </div>
  )

}
