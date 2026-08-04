import React, { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'

const SETTINGS_KEY = 'mister-sscraper-online-settings'

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

  const [platforms, setPlatforms] = useState({})
  const [systems, setSystems] = useState([])
  const [selectedSystem, setSelectedSystem] =
    useState('')
  const [files, setFiles] = useState([])
  const [loadingDirectory, setLoadingDirectory] =
    useState(false)
  const [romPage, setRomPage] = useState(1)
  const [romPageSize, setRomPageSize] =
    useState(25)
  const [running, setRunning] = useState(false)

  const onlineAbortController = useRef(null)
  const onlineStopRequested = useRef(false)
  const onlineStartedAt = useRef(null)

  const [onlineClock, setOnlineClock] =
    useState(0)
  const [logs, setLogs] = useState([])
  const [progress, setProgress] = useState({
    current: 0,
    total: 0
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
    fetch('/platforms.json')
      .then(response => {
        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          )
        }

        return response.json()
      })
      .then(setPlatforms)
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

  function identifyPlatform(folderName) {
    const target = normalize(folderName)

    for (
      const platform of
      Object.values(platforms)
    ) {
      const candidates = [
        platform.id,
        ...(platform.aliases || [])
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
        relativeDirectory
      })
    }
  }

  async function scanGamesHandle(
    gamesHandle
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
        identifyPlatform(folderName)

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
    setStorageAccess(accessDetails)

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

      const result =
        await scanGamesHandle(
          gamesHandle
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
              : '.'
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
        currentFiles.length
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
            currentFiles.length
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

  return (
    <div className="app">
      <header>
        <div>
          <h1>MiSTer ScreenScraper</h1>
          <p>
            Modo web — leitura do cartão SD,
            gravação direta ou download ZIP
          </p>
        </div>

        <div className="header-controls">
          <span className="execution-mode-badge web-mode">
            WEB
          </span>

          <span
            className={`status ${
              running
                ? 'running'
                : ''
            }`}
          >
            {running
              ? 'PROCESSANDO'
              : 'PRONTO'}
          </span>
        </div>
      </header>

      <main>
        <section className="card web-mode-info">
          <div>
            <h2>Modo web</h2>
            <p>
              No Chrome ou Edge, escolha o cartão SD e
              autorize gravação para criar as pastas media
              diretamente. Em navegadores sem suporte,
              o projeto usa seleção somente leitura e gera ZIP.
            </p>
          </div>
        </section>

        <section className="card settings-card">
          <h2>Credenciais ScreenScraper</h2>

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
            As credenciais ficam apenas no localStorage
            deste navegador.
          </p>
        </section>

        <section className="card sd-card-selector">
          <h2>Cartão SD / pasta games</h2>

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
            disabled={loadingDirectory || running}
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
                    `Selecionado: ${storageAccess.selectedName}` +
                    (
                      storageAccess.gamesName
                        ? ` / ${storageAccess.gamesName}`
                        : ''
                    )
                  )
                  : (
                    supportsDirectWrite
                      ? (
                        'Chrome/Edge: leitura e gravação disponíveis'
                      )
                      : (
                        'Navegador sem gravação direta; será usado ZIP'
                      )
                  )}
              </small>
            </div>
          </div>

          <div className="paths">
            <div>
              <b>Plataformas encontradas:</b>{' '}
              {systems.length}
            </div>

            <div>
              <b>ROMs reconhecidas:</b>{' '}
              {files.length}
            </div>
          </div>
        </section>

        <section className="card">
          <h2>Plataforma</h2>

          <select
            value={selectedSystem}
            onChange={event => {
              setSelectedSystem(
                event.target.value
              )
              setRomPage(1)
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
                  disabled={
                    !currentFiles.length
                  }
                >
                  Baixar ZIP
                </button>
              </>
            )}
          </div>

          {!storageAccess.writeEnabled && (
            <p className="settings-note">
              A gravação direta está indisponível.
              O botão Baixar ZIP continua funcionando.
            </p>
          )}

          {running && (
            <div className="scrape-progress-panel">
              <div className="scrape-progress-header">
                <strong>Processando ROMs</strong>
                <span>
                  {progress.current} / {progress.total}
                </span>
              </div>

              <div className="scrape-progress-track">
                <div
                  className="scrape-progress-fill"
                  style={{
                    width: `${
                      progress.total
                        ? Math.round(
                          (
                            progress.current /
                            progress.total
                          ) * 100
                        )
                        : 0
                    }%`
                  }}
                />
              </div>

              <div className="scrape-progress-metrics">
                <div>
                  <small>Progresso</small>
                  <strong>
                    {progress.total
                      ? Math.round(
                        (
                          progress.current /
                          progress.total
                        ) * 100
                      )
                      : 0}%
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
            </div>
          )}
        </section>

        <section className="card roms-card">
          <h2>ROMs</h2>

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
                subpastas e ROMs...
              </span>
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
              <div
                className="rom"
                key={item.relativePath}
              >
                <div className="rom-main-info">
                  <span className="rom-name">
                    {item.name}
                  </span>

                  <small className="rom-directory">
                    {
                      item.relativeDirectory === '.'
                        ? item.systemFolder
                        : (
                          `${item.systemFolder}/` +
                          item.relativeDirectory
                        )
                    }
                  </small>
                </div>

                <div className="rom-art-status">
                  <span className="art-indicator missing-art">
                    Capa pendente
                  </span>

                  <span className="art-indicator missing-art">
                    Fundo pendente
                  </span>
                </div>
              </div>
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
              disabled={romPage <= 1}
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
                romPage >= romPageCount
              }
            >
              Próxima
            </button>
          </div>
        </section>

        <section className="card">
          <h2>Log técnico</h2>

          <pre className="log">
            {logs.join('\n') || 'Aguardando...'}
          </pre>
        </section>
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
