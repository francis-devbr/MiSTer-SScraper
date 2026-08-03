import React, { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'

const SETTINGS_KEY = 'mister-sscraper-online-settings'

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
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
  return index >= 0 ? name.slice(index).toLowerCase() : ''
}

function detectRegion(name) {
  const value = String(name || '').toLowerCase()
  if (/\((u|us|usa)\)|\[(u|us|usa)\]/i.test(value)) return 'us'
  if (/\((e|eu|europe)\)|\[(e|eu)\]/i.test(value)) return 'eu'
  if (/\((j|jp|japan)\)|\[(j|jp)\]/i.test(value)) return 'jp'
  if (/\((br|brazil|brasil)\)|\[(br)\]/i.test(value)) return 'br'
  if (/\((world|w)\)|\[(world|w)\]/i.test(value)) return 'wor'
  return 'us'
}

function FeedbackModal({ modal, onClose }) {
  if (!modal.open) return null

  return (
    <div
      className="modal-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={`feedback-modal modal-${modal.type}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="feedback-modal-icon">
          {modal.type === 'success' ? '✓' : modal.type === 'error' ? '!' : 'i'}
        </div>
        <div className="feedback-modal-content">
          <h2>{modal.title}</h2>
          <p>{modal.message}</p>
          {modal.details && (
            <pre className="feedback-modal-details">{modal.details}</pre>
          )}
        </div>
        <button className="modal-close-button" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  )
}

export default function OnlineApp() {
  const saved = loadSettings()
  const directoryInput = useRef(null)

  const [settings, setSettings] = useState({
    devid: saved.devid || '',
    devpassword: saved.devpassword || '',
    ssid: saved.ssid || '',
    sspassword: saved.sspassword || '',
    softname: saved.softname || 'MiSTerConsoleModeScraper',
    delayMs: saved.delayMs || 1500
  })
  const [platforms, setPlatforms] = useState({})
  const [systems, setSystems] = useState([])
  const [selectedSystem, setSelectedSystem] = useState('')
  const [files, setFiles] = useState([])
  const [loadingDirectory, setLoadingDirectory] = useState(false)
  const [romPage, setRomPage] = useState(1)
  const [romPageSize, setRomPageSize] = useState(25)
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState([])
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [modal, setModal] = useState({
    open: false, type: 'info', title: '', message: '', details: ''
  })

  useEffect(() => {
    fetch('/platforms.json')
      .then(response => response.json())
      .then(setPlatforms)
      .catch(error => showError(
        'Catálogo indisponível',
        'Não foi possível carregar o catálogo de plataformas.',
        error.message
      ))
  }, [])

  const currentFiles = useMemo(
    () => files.filter(file => file.systemId === selectedSystem),
    [files, selectedSystem]
  )

  const romPageCount = Math.max(
    1,
    Math.ceil(currentFiles.length / romPageSize)
  )

  const paginatedFiles = useMemo(() => {
    const start = (romPage - 1) * romPageSize
    return currentFiles.slice(start, start + romPageSize)
  }, [currentFiles, romPage, romPageSize])

  function showModal(type, title, message, details = '') {
    setModal({ open: true, type, title, message, details })
  }

  function showError(title, message, details = '') {
    showModal('error', title, message, details)
  }

  function addLog(message) {
    setLogs(current => [...current.slice(-500), message])
  }

  function updateSettings(patch) {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(next)
  }

  function identifyPlatform(folderName) {
    const target = normalize(folderName)

    for (const platform of Object.values(platforms)) {
      const candidates = [
        platform.id,
        ...(platform.aliases || [])
      ]

      if (candidates.some(candidate => normalize(candidate) === target)) {
        return platform
      }
    }

    return null
  }

  async function selectDirectory(event) {
    const selected = Array.from(event.target.files || [])

    if (!selected.length) return

    setLoadingDirectory(true)

    await new Promise(resolve =>
      requestAnimationFrame(() => resolve())
    )

    const mapped = []
    const detected = new Map()
    const unknown = new Set()

    for (const file of selected) {
      const parts = file.webkitRelativePath.split('/')
      if (parts.length < 3) continue

      const systemFolder = parts[1]
      const platform = identifyPlatform(systemFolder)

      if (!platform) {
        unknown.add(systemFolder)
        continue
      }

      const allowed = (platform.formats || [])
        .map(value => value.replace(/^\*/, '').toLowerCase())

      if (
        allowed.length &&
        !allowed.includes(extension(file.name))
      ) {
        continue
      }

      detected.set(platform.id, {
        ...platform,
        folder: systemFolder
      })

      const pathInsideSystem =
        parts.slice(2, -1).join('/')

      mapped.push({
        file,
        name: file.name,
        relativePath: file.webkitRelativePath,
        systemId: platform.id,
        systemFolder,
        relativeDirectory:
          pathInsideSystem || '.'
      })
    }

    const systemList = [...detected.values()]
      .sort((a, b) => a.id.localeCompare(b.id))

    setFiles(mapped)
    setSystems(systemList)
    setSelectedSystem(systemList[0]?.id || '')
    setRomPage(1)

    setLoadingDirectory(false)

    showModal(
      'success',
      'Diretório carregado',
      `${mapped.length} ROMs foram reconhecidas em ${systemList.length} plataformas.`,
      unknown.size
        ? `Pastas não reconhecidas: ${[...unknown].join(', ')}`
        : ''
    )
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
        'Preencha todos os campos do ScreenScraper antes de continuar.'
      )
      return false
    }
    return true
  }

  async function testScreenScraper() {
    if (!validateCredentials()) return

    try {
      const params = new URLSearchParams({
        devid: settings.devid,
        devpassword: settings.devpassword,
        softname: settings.softname,
        ssid: settings.ssid,
        sspassword: settings.sspassword,
        output: 'json'
      })

      const response = await fetch(
        `https://api.screenscraper.fr/api2/ssuserInfos.php?${params}`
      )
      const text = await response.text()

      if (!response.ok || /Erreur de login/i.test(text)) {
        throw new Error(text.slice(0, 500) || `HTTP ${response.status}`)
      }

      showModal(
        'success',
        'ScreenScraper conectado',
        'As credenciais foram validadas com sucesso.'
      )
    } catch (error) {
      showError(
        'Falha no teste do ScreenScraper',
        'A API rejeitou a chamada ou o navegador bloqueou a requisição.',
        `${error.message}\n\nSe aparecer erro de CORS, a hospedagem online precisará usar uma função serverless como proxy.`
      )
    }
  }

  function baseParams() {
    return new URLSearchParams({
      devid: settings.devid,
      devpassword: settings.devpassword,
      softname: settings.softname,
      ssid: settings.ssid,
      sspassword: settings.sspassword,
      output: 'json'
    })
  }

  async function findGame(platform, item) {
    const params = baseParams()
    params.set('systemeid', platform.systemeid)
    params.set('romtype', 'rom')
    params.set('romnom', item.name)
    params.set('romtaille', item.file.size)

    const response = await fetch(
      `https://api.screenscraper.fr/api2/jeuInfos.php?${params}`
    )

    const text = await response.text()
    if (!response.ok) throw new Error(`jeuInfos HTTP ${response.status}: ${text.slice(0, 300)}`)
    if (/Erreur de login/i.test(text)) throw new Error(text.slice(0, 300))

    const json = JSON.parse(text)
    return json?.response?.jeu || null
  }

  async function downloadMedia(platform, gameId, media, region) {
    const attempts = [
      `${media}(${region})`,
      `${media}(us)`,
      `${media}(wor)`,
      `${media}(eu)`,
      media
    ]

    for (const mediaName of [...new Set(attempts)]) {
      const params = baseParams()
      params.set('systemeid', platform.systemeid)
      params.set('jeuid', gameId)
      params.set('media', mediaName)
      params.set('outputformat', 'png')

      const response = await fetch(
        `https://api.screenscraper.fr/api2/mediaJeu.php?${params}`
      )

      if (!response.ok) continue

      const blob = await response.blob()
      if (blob.size > 8 && blob.type.startsWith('image/')) {
        return blob
      }
    }

    return null
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async function startOnlineScrape() {
    if (!validateCredentials()) return
    if (!selectedSystem || !currentFiles.length) {
      showError(
        'Nenhuma ROM selecionada',
        'Escolha a pasta games e selecione uma plataforma.'
      )
      return
    }

    const platform = platforms[selectedSystem]
    if (!platform?.systemeid) {
      showError(
        'ScreenScraper ID ausente',
        `A plataforma ${selectedSystem} não possui ScreenScraper ID configurado.`
      )
      return
    }

    setRunning(true)
    setLogs([])
    setProgress({ current: 0, total: currentFiles.length })

    const zip = new JSZip()
    const platformFolder =
      systems.find(system =>
        system.id === selectedSystem
      )?.folder || platform.id
    let found = 0
    let missing = 0
    let failed = 0

    try {
      for (let index = 0; index < currentFiles.length; index++) {
        const item = currentFiles[index]
        setProgress({ current: index + 1, total: currentFiles.length })
        addLog(`[${index + 1}/${currentFiles.length}] ${item.name}`)

        try {
          const game = await findGame(platform, item)

          if (!game?.id) {
            missing++
            addLog('  NÃO ENCONTRADO')
            continue
          }

          const base = stripExtension(item.name)
          const region = detectRegion(item.name)

          const directoryPrefix =
            item.relativeDirectory === '.'
              ? platformFolder
              : `${platformFolder}/${item.relativeDirectory}`

          const mediaFolder =
            zip.folder(`${directoryPrefix}/media`)

          await sleep(settings.delayMs)
          const box = await downloadMedia(platform, game.id, 'box-2D', region)
          if (box) mediaFolder.file(`${base}.png`, box)

          await sleep(settings.delayMs)
          const bg = await downloadMedia(platform, game.id, 'ss', region)
          if (bg) mediaFolder.file(`${base}-BG.png`, bg)

          if (box || bg) {
            found++
            addLog(`  OK: ${game.nom || base}`)
          } else {
            missing++
            addLog('  SEM MÍDIA')
          }
        } catch (error) {
          failed++
          addLog(`  ERRO: ${error.message}`)
        }
      }

      if (!found) {
        throw new Error(
          'Nenhuma imagem foi baixada. Verifique credenciais, nomes das ROMs e bloqueio de CORS.'
        )
      }

      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const link = document.createElement('a')
      link.href = url
      link.download = `MiSTer-Artwork-${platform.id}.zip`
      link.click()
      URL.revokeObjectURL(url)

      showModal(
        'success',
        'Scraping concluído',
        `${found} jogos adicionados ao ZIP.`,
        `Não encontrados/sem mídia: ${missing}\nErros: ${failed}`
      )
    } catch (error) {
      showError(
        'Falha no scraping online',
        error.message,
        'Os detalhes completos permanecem no card de log.'
      )
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="app">
      <header>
        <div>
          <h1>MiSTer ScreenScraper</h1>
          <p>Modo online — diretório do navegador e download ZIP</p>
        </div>
        <span className={`status ${running ? 'running' : ''}`}>
          {running ? 'PROCESSANDO' : 'ONLINE'}
        </span>
      </header>

      <main>
        <section className="card settings-card">
          <h2>Credenciais ScreenScraper</h2>
          <div className="settings-grid online-settings-grid">
            <label className="field">
              Developer ID
              <input value={settings.devid} onChange={e => updateSettings({ devid: e.target.value })} />
            </label>
            <label className="field">
              Developer Password
              <input type="password" value={settings.devpassword} onChange={e => updateSettings({ devpassword: e.target.value })} />
            </label>
            <label className="field">
              Usuário
              <input value={settings.ssid} onChange={e => updateSettings({ ssid: e.target.value })} />
            </label>
            <label className="field">
              Senha
              <input type="password" value={settings.sspassword} onChange={e => updateSettings({ sspassword: e.target.value })} />
            </label>
          </div>
          <button className="small" onClick={testScreenScraper}>
            Testar ScreenScraper
          </button>
          <p className="settings-note">
            No modo online, as credenciais ficam somente no localStorage deste navegador.
          </p>
        </section>

        <section className="card">
          <h2>Pasta games</h2>
          <input
            ref={directoryInput}
            className="directory-input"
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            onChange={selectDirectory}
          />
          <button
            onClick={() => directoryInput.current?.click()}
            disabled={loadingDirectory}
          >
            {loadingDirectory
              ? 'Escaneando pasta...'
              : 'Escolher pasta games'}
          </button>
          <div className="paths">
            <div><b>Plataformas encontradas:</b> {systems.length}</div>
            <div><b>ROMs reconhecidas:</b> {files.length}</div>
          </div>
        </section>

        <section className="card">
          <h2>Plataforma</h2>
          <select
            value={selectedSystem}
            onChange={event => setSelectedSystem(event.target.value)}
          >
            {!systems.length && <option value="">Nenhuma plataforma</option>}
            {systems.map(system => (
              <option key={system.id} value={system.id}>
                {system.folder} ({system.id})
              </option>
            ))}
          </select>
          <div className="paths">
            <div><b>ROMs:</b> {currentFiles.length}</div>
            <div><b>ScreenScraper ID:</b> {platforms[selectedSystem]?.systemeid ?? 'não configurado'}</div>
          </div>
          <button
            onClick={startOnlineScrape}
            disabled={running || !currentFiles.length}
          >
            {running
              ? `Processando ${progress.current}/${progress.total}`
              : 'Gerar artwork e baixar ZIP'}
          </button>
        </section>

        <section className="card roms-card">
          <h2>ROMs</h2>

          {loadingDirectory && (
            <div className="rom-loading-overlay" role="status">
              <div className="neon-spinner" aria-hidden="true" />
              <strong>Escaneando diretório</strong>
              <span>
                Identificando plataformas, subpastas e ROMs...
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
                  setRomPageSize(Number(event.target.value))
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
                    {item.relativeDirectory === '.'
                      ? item.systemFolder
                      : `${item.systemFolder}/${item.relativeDirectory}`}
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
              disabled={romPage >= romPageCount}
            >
              Próxima
            </button>
          </div>
        </section>

        <section className="card">
          <h2>Log técnico</h2>
          <pre className="log">{logs.join('\n') || 'Aguardando...'}</pre>
        </section>
      </main>

      <FeedbackModal
        modal={modal}
        onClose={() => setModal(current => ({ ...current, open: false }))}
      />
    </div>
  )
}
