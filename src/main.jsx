import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import OnlineApp from './online/OnlineApp.jsx'

const AGENT_STORAGE_KEY =
  'mister-sscraper-agent-connection'

function loadAgentConnection() {
  try {
    return JSON.parse(
      localStorage.getItem(AGENT_STORAGE_KEY) ||
      '{}'
    )
  } catch {
    return {}
  }
}

function saveAgentConnection(connection) {
  localStorage.setItem(
    AGENT_STORAGE_KEY,
    JSON.stringify(connection)
  )
}

function agentUrl(pathname) {
  const connection = loadAgentConnection()
  const baseUrl = String(
    connection.baseUrl ||
    'http://127.0.0.1:3001'
  ).replace(/\/$/, '')

  return `${baseUrl}${pathname}`
}

const api = async (url, options = {}) => {
  const connection = loadAgentConnection()

  const response = await fetch(agentUrl(url), {
    headers: {
      'Content-Type': 'application/json',
      ...(connection.token
        ? {
            Authorization:
              `Bearer ${connection.token}`
          }
        : {}),
      ...(options.headers || {})
    },
    ...options
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`)
  }

  return data
}

const splitList = value =>
  String(value || '')
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean)


function CollapsibleCard({
  id,
  title,
  children,
  className = '',
  badge = null,
  actions = null,
  defaultCollapsed = false
}) {
  const storageKey = `mister-screenscraper-card-${id}`

  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem(storageKey)

    if (saved === null) {
      return defaultCollapsed
    }

    return saved === 'true'
  })

  function toggleCollapsed() {
    setCollapsed(current => {
      const next = !current
      localStorage.setItem(storageKey, String(next))
      return next
    })
  }

  return (
    <section
      className={`card collapsible-card ${
        collapsed ? 'card-collapsed' : ''
      } ${className}`.trim()}
    >
      <div className="card-header">
        <div className="card-title-area">
          <h2>{title}</h2>
          {badge !== null && (
            <span className="card-badge">{badge}</span>
          )}
        </div>

        <div className="card-header-actions">
          {actions}

          <button
            type="button"
            className="collapse-button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls={`card-content-${id}`}
            title={collapsed ? 'Expandir card' : 'Minimizar card'}
          >
            <span aria-hidden="true">
              {collapsed ? '＋' : '－'}
            </span>
            <span className="collapse-label">
              {collapsed ? 'Expandir' : 'Minimizar'}
            </span>
          </button>
        </div>
      </div>

      <div
        id={`card-content-${id}`}
        className="card-content"
        hidden={collapsed}
      >
        {children}
      </div>
    </section>
  )
}

function detectExecutionMode() {
  const hostname = window.location.hostname
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1'
  ) ? 'local' : 'online'
}

function App() {
  if (detectExecutionMode() === 'online') {
    return <OnlineApp />
  }

  const initialConnection = loadAgentConnection()

  const [agentConnection, setAgentConnection] = useState({
    baseUrl:
      initialConnection.baseUrl ||
      'http://127.0.0.1:3001',
    token:
      initialConnection.token ||
      ''
  })

  const [agentOnline, setAgentOnline] = useState(false)
  const [showSettings, setShowSettings] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [testingScreenScraper, setTestingScreenScraper] = useState(false)
  const [testingMister, setTestingMister] = useState(false)
  const [modal, setModal] = useState({
    open: false,
    type: 'info',
    title: '',
    message: '',
    details: ''
  })
  const [settingsForm, setSettingsForm] = useState({
    gamesBasePath: '',
    screenscraper: {
      devid: '',
      devpassword: '',
      ssid: '',
      sspassword: '',
      softname: 'MiSTerConsoleModeScraper',
      delayMs: 1500,
      boxartMedia: 'box-2D',
      backgroundMedia: 'ss',
      defaultRegion: 'us'
    },
    mister: {
      host: '',
      port: 22,
      username: 'root',
      password: '',
      remoteBasePath: '/media/fat/games'
    }
  })

  const [systems, setSystems] = useState([])
  const [selectedSystem, setSelectedSystem] = useState('')
  const [source, setSource] = useState('local')
  const [roms, setRoms] = useState([])
  const [loadingRoms, setLoadingRoms] = useState(false)
  const [loadingRomsMessage, setLoadingRomsMessage] = useState('')
  const [romPage, setRomPage] = useState(1)
  const [romPageSize, setRomPageSize] = useState(25)
  const [hoveredRom, setHoveredRom] = useState(null)
  const [selectedRom, setSelectedRom] = useState(null)
  const [cacheStats, setCacheStats] = useState(null)
  const [config, setConfig] = useState(null)
  const [running, setRunning] = useState(false)
  const [choosingDirectory, setChoosingDirectory] = useState(false)
  const [scanningRemote, setScanningRemote] = useState(false)
  const [remoteSuggestions, setRemoteSuggestions] = useState([])
  const [logs, setLogs] = useState([])
  const [showEditor, setShowEditor] = useState(false)
  const [editor, setEditor] = useState({
    id: '',
    displayName: '',
    folders: '',
    aliases: '',
    formats: '',
    systemeid: ''
  })

  const [options, setOptions] = useState({
    force: false,
    background: true,
    dryRun: false
  })

  const availableLocalSystems = useMemo(
    () => systems.filter(system => system.availableLocal),
    [systems]
  )

  const availableRemoteSystems = useMemo(
    () => systems.filter(system => system.availableRemote),
    [systems]
  )

  const current = systems.find(
    system => system.id === selectedSystem
  )

  const romPageCount = Math.max(
    1,
    Math.ceil(roms.length / romPageSize)
  )

  const paginatedRoms = useMemo(() => {
    const start = (romPage - 1) * romPageSize
    return roms.slice(start, start + romPageSize)
  }, [roms, romPage, romPageSize])

  useEffect(() => {
    connectAgent()
  }, [])

  useEffect(() => {
    if (!selectedSystem) {
      setRoms([])
      return
    }

    loadRoms(selectedSystem, source)
  }, [selectedSystem, source])

  useEffect(() => {
    if (!current) {
      return
    }

    setEditor({
      id: current.id,
      displayName: current.name || current.id,
      folders: (current.folders || [current.folder])
        .filter(Boolean)
        .join(', '),
      aliases: (current.aliases || []).join(', '),
      formats: (current.formats || []).join(', '),
      systemeid: current.systemeid ?? ''
    })
  }, [current])

  async function connectAgent() {
    saveAgentConnection(agentConnection)

    try {
      const infoResponse = await fetch(
        `${String(agentConnection.baseUrl).replace(/\/$/, '')}/api/agent/info`
      )

      if (!infoResponse.ok) {
        throw new Error(
          `Agente HTTP ${infoResponse.status}`
        )
      }

      setAgentOnline(true)

      if (!agentConnection.token) {
        addLog(
          'Agente encontrado. Informe o token exibido no terminal do agente.'
        )
        return
      }

      await loadSettings()
      await loadConfig()
    } catch (error) {
      const message =
        error?.message ||
        'Não foi possível conectar ao agente local.'

      setAgentOnline(false)
      setShowSettings(true)
      addLog(
        `Agente local indisponível: ${message}`
      )

      showModal({
        type: 'error',
        title: 'Agente local indisponível',
        message,
        details:
          message.includes('Token')
            ? 'Copie somente o token exibido no terminal do agente e clique em Conectar ao agente.'
            : 'Confira se o agente está executando em http://127.0.0.1:3001.'
      })
    }
  }

  async function loadSettings() {
    const data = await api('/api/settings')
    const settings = data.settings || {}

    setSettingsForm(current => ({
      ...current,
      gamesBasePath:
        settings.gamesBasePath || '',
      screenscraper: {
        ...current.screenscraper,
        ...(settings.screenscraper || {}),
        devpassword: '',
        sspassword: ''
      },
      mister: {
        ...current.mister,
        ...(settings.mister || {}),
        password: ''
      }
    }))

    setShowSettings(!settings.configured)
  }

  async function saveSettingsForm({ closeSettings = true } = {}) {
    setSavingSettings(true)

    try {
      const data = await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settingsForm)
      })

      addLog('Configurações salvas no agente local.')
      setSettingsForm(current => ({
        ...current,
        screenscraper: {
          ...current.screenscraper,
          devpassword: '',
          sspassword: ''
        },
        mister: {
          ...current.mister,
          password: ''
        }
      }))

      if (closeSettings) {
        setShowSettings(false)
      }

      await loadConfig()
      return data
    } catch (error) {
      const message =
        error?.message ||
        'Não foi possível salvar as configurações.'

      addLog(
        `ERRO ao salvar configurações: ${message}`
      )

      if (closeSettings) {
        showModal({
          type: 'error',
          title: 'Erro ao salvar configurações',
          message
        })
      }

      throw error
    } finally {
      setSavingSettings(false)
    }
  }

  async function testScreenScraper() {
    setTestingScreenScraper(true)

    try {
      await saveSettingsForm({
        closeSettings: false
      })

      const data = await api(
        '/api/settings/test-screenscraper',
        { method: 'POST' }
      )

      addLog(
        data.message ||
        'Credenciais ScreenScraper validadas.'
      )

      showModal({
        type: 'success',
        title: 'ScreenScraper conectado',
        message:
          data.message ||
          'As credenciais foram validadas com sucesso.'
      })
    } catch (error) {
      const message =
        error?.message ||
        'Não foi possível validar o ScreenScraper.'

      addLog(`ERRO ScreenScraper: ${message}`)

      showModal({
        type: 'error',
        title: 'Erro no ScreenScraper',
        message,
        details:
          'Confira Developer ID, Developer Password, usuário e senha do ScreenScraper.'
      })
    } finally {
      setTestingScreenScraper(false)
    }
  }

  async function testMisterConnection() {
    setTestingMister(true)

    try {
      await saveSettingsForm({
        closeSettings: false
      })

      const data = await api('/api/mister/test')

      const message =
        data.message ||
        'Conexão SSH/SFTP realizada com sucesso.'

      addLog(message)

      showModal({
        type: 'success',
        title: 'MiSTer conectado',
        message,
        details: data.remoteBasePath
          ? `Pasta remota: ${data.remoteBasePath}`
          : ''
      })
    } catch (error) {
      const message =
        error?.message ||
        'Não foi possível conectar ao MiSTer.'

      addLog(`ERRO MiSTer: ${message}`)

      showModal({
        type: 'error',
        title: 'Erro ao conectar no MiSTer',
        message,
        details:
          'Confira IP, porta, usuário, senha SSH e se o MiSTer está ligado na mesma rede.'
      })
    } finally {
      setTestingMister(false)
    }
  }

  function showModal({
    type = 'info',
    title,
    message,
    details = ''
  }) {
    setModal({
      open: true,
      type,
      title,
      message,
      details
    })
  }

  function closeModal() {
    setModal(current => ({
      ...current,
      open: false
    }))
  }

  function addLog(text) {
    setLogs(currentLogs => [
      ...currentLogs.slice(-300),
      text
    ])
  }

  function applyConfig(data, preferredSource = source) {
    const nextSystems = data.systems || []

    setSystems(nextSystems)
    setConfig(data)

    setSelectedSystem(currentId => {
      const active = nextSystems.find(
        system => system.id === currentId
      )

      if (
        active &&
        (
          (
            preferredSource === 'network' &&
            active.availableRemote
          ) ||
          (
            preferredSource === 'local' &&
            active.availableLocal
          )
        )
      ) {
        return currentId
      }

      const first =
        preferredSource === 'network'
          ? nextSystems.find(system => system.availableRemote)
          : nextSystems.find(system => system.availableLocal)

      return first?.id || ''
    })
  }

  async function loadConfig() {
    try {
      const data = await api('/api/config')
      applyConfig(data)
      setCacheStats(data.cache || null)
    } catch (error) {
      addLog(`ERRO: ${error.message}`)
    }
  }

  async function chooseGamesDirectory() {
    setChoosingDirectory(true)

    try {
      const data = await api(
        '/api/local/select-directory',
        { method: 'POST' }
      )

      if (data.cancelled) {
        return
      }

      applyConfig({
        ...config,
        games: data.games,
        systems: data.systems
      }, 'local')

      const found = data.systems.filter(
        system => system.availableLocal
      )

      addLog(`Pasta games: ${data.games.basePath}`)
      addLog(`Sistemas encontrados: ${found.length}`)
    } catch (error) {
      addLog(`ERRO: ${error.message}`)
    } finally {
      setChoosingDirectory(false)
    }
  }

  async function scanRemotePlatforms() {
    setScanningRemote(true)

    try {
      const data = await api(
        '/api/mister/platforms'
      )

      setSystems(data.platforms || [])
      setRemoteSuggestions(
        data.suggestions || []
      )

      setConfig(currentConfig => ({
        ...currentConfig,
        mister: {
          ...(currentConfig?.mister || {}),
          scanCompleted: true
        },
        suggestions: {
          ...(currentConfig?.suggestions || {}),
          remote: data.suggestions || []
        }
      }))

      setSelectedSystem(currentId => {
        const currentPlatform =
          (data.platforms || []).find(
            platform =>
              platform.id === currentId &&
              platform.availableRemote
          )

        return (
          currentPlatform?.id ||
          (data.platforms || []).find(
            platform => platform.availableRemote
          )?.id ||
          ''
        )
      })

      addLog(
        `Plataformas encontradas no MiSTer: ${
          (data.platforms || []).filter(
            platform => platform.availableRemote
          ).length
        }`
      )

      if ((data.suggestions || []).length) {
        addLog(
          `Pastas não reconhecidas: ${
            data.suggestions
              .map(item => item.folder)
              .join(', ')
          }`
        )
      }
    } catch (error) {
      addLog(
        `ERRO ao ler plataformas do MiSTer: ${error.message}`
      )
    } finally {
      setScanningRemote(false)
    }
  }

  async function addRemoteSuggestion(suggestion) {
    try {
      await api(
        '/api/platforms/suggestions',
        {
          method: 'POST',
          body: JSON.stringify({
            folder: suggestion.folder,
            id: suggestion.suggestedId
          })
        }
      )

      addLog(
        `Sugestão adicionada ao peas_local.json: ${suggestion.folder}`
      )

      await loadConfig()
      await scanRemotePlatforms()
    } catch (error) {
      addLog(
        `ERRO ao adicionar sugestão: ${error.message}`
      )
    }
  }

  async function loadRoms(systemId, selectedSource) {
    setLoadingRoms(true)
    setLoadingRomsMessage(
      selectedSource === 'network'
        ? 'Lendo diretórios e ROMs do MiSTer...'
        : 'Lendo diretórios e ROMs do computador...'
    )

    try {
      setRoms([])
      setSelectedRom(null)
      setHoveredRom(null)

      const data = await api(
        `/api/roms?system=${encodeURIComponent(systemId)}` +
        `&source=${encodeURIComponent(selectedSource)}`
      )

      const nextRoms = data.roms || []

      setRoms(nextRoms)
      setRomPage(1)
      setSelectedRom(null)
      setHoveredRom(null)

      showModal({
        type: 'success',
        title: 'Varredura concluída',
        message:
          `${nextRoms.length} ROMs foram encontradas.`,
        details:
          nextRoms.length
            ? `Plataforma: ${systemId}\nOrigem: ${
                selectedSource === 'network'
                  ? 'MiSTer via rede'
                  : 'Diretório local'
              }`
            : 'Nenhuma ROM compatível foi encontrada.'
      })
    } catch (error) {
      setRoms([])
      setRomPage(1)
      setSelectedRom(null)
      setHoveredRom(null)

      addLog(`ERRO ao listar ROMs: ${error.message}`)

      showModal({
        type: 'error',
        title: 'Erro ao escanear ROMs',
        message: error.message,
        details:
          'Confira o diretório, a conexão e as extensões configuradas para a plataforma.'
      })
    } finally {
      setLoadingRoms(false)
      setLoadingRomsMessage('')
    }
  }

  async function changeSource(nextSource) {
    setSource(nextSource)

    if (nextSource === 'local') {
      if (!current?.availableLocal) {
        setSelectedSystem(
          availableLocalSystems[0]?.id || ''
        )
      }

      return
    }

    await scanRemotePlatforms()
  }

  async function savePlatform() {
    if (!editor.id) {
      return
    }

    try {
      const payload = {
        displayName: editor.displayName.trim() || editor.id,
        folders: splitList(editor.folders),
        aliases: splitList(editor.aliases),
        formats: splitList(editor.formats),
        systemeid:
          editor.systemeid === ''
            ? null
            : Number(editor.systemeid)
      }

      await api(
        `/api/platforms/${encodeURIComponent(editor.id)}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload)
        }
      )

      addLog(`Plataforma salva: ${editor.id}`)
      await loadConfig()
    } catch (error) {
      addLog(`ERRO ao salvar plataforma: ${error.message}`)
    }
  }

  async function restorePlatform() {
    if (!editor.id) {
      return
    }

    try {
      await api(
        `/api/platforms/${encodeURIComponent(editor.id)}/override`,
        { method: 'DELETE' }
      )

      addLog(`Padrão restaurado: ${editor.id}`)
      await loadConfig()
    } catch (error) {
      addLog(`ERRO ao restaurar plataforma: ${error.message}`)
    }
  }

  async function clearCache() {
    try {
      const data = await api('/api/cache', {
        method: 'DELETE'
      })
      setCacheStats(data)
      addLog('Cache SQLite limpo.')
    } catch (error) {
      addLog(`ERRO ao limpar cache: ${error.message}`)
    }
  }

  function artworkUrl(type) {
    if (!selectedRom || !selectedSystem) {
      return ''
    }

    const params = new URLSearchParams({
      system: selectedSystem,
      source,
      romPath: selectedRom.path,
      type
    })

    const connection = loadAgentConnection()

    if (connection.token) {
      params.set(
        'agentToken',
        connection.token
      )
    }

    return agentUrl(
      `/api/artwork?${params.toString()}`
    )
  }

  function artworkUrlForRom(rom, type) {
    if (!rom || !selectedSystem) {
      return ''
    }

    const params = new URLSearchParams({
      system: selectedSystem,
      source,
      romPath: rom.path,
      type
    })

    const connection = loadAgentConnection()

    if (connection.token) {
      params.set(
        'agentToken',
        connection.token
      )
    }

    return agentUrl(
      `/api/artwork?${params.toString()}`
    )
  }

  async function startScrape() {
    if (!selectedSystem) {
      return
    }

    setRunning(true)
    setLogs([])

    try {
      const connection = loadAgentConnection()

      const response = await fetch(agentUrl('/api/scrape'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:
            `Bearer ${connection.token || ''}`
        },
        body: JSON.stringify({
          system: selectedSystem,
          source,
          ...options
        })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()

        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) {
            continue
          }

          try {
            const event = JSON.parse(line)
            addLog(event.message || JSON.stringify(event))
          } catch {
            addLog(line)
          }
        }
      }
    } catch (error) {
      addLog(`ERRO: ${error.message}`)
    } finally {
      setRunning(false)
      await loadRoms(selectedSystem, source)
    }
  }

  const remotePath =
    current?.remotePath || ''

  return (
    <div className="app">
      <header>
        <div>
          <h1>MiSTer ScreenScraper</h1>
          <p>Artwork para Console Mode</p>
        </div>

        <div className="header-controls">
          <button
            className="small settings-toggle"
            onClick={() => setShowSettings(!showSettings)}
          >
            Configurações
          </button>

          <span
            className={`status ${
              running
                ? 'running'
                : agentOnline
                  ? ''
                  : 'offline'
            }`}
          >
            {running
              ? 'SCRAPING'
              : agentOnline
                ? 'AGENTE ONLINE'
                : 'AGENTE OFFLINE'}
          </span>
        </div>
      </header>

      <main>
        {showSettings && (
          <CollapsibleCard
            id="agent-settings"
            title="Configurações do agente"
            className="settings-card"
          >
            <div className="settings-grid">
              <div className="settings-section">
                <h3>Conexão com o agente local</h3>

                <label className="field">
                  URL do agente
                  <input
                    type="text"
                    value={agentConnection.baseUrl}
                    onChange={event =>
                      setAgentConnection({
                        ...agentConnection,
                        baseUrl: event.target.value
                      })
                    }
                    placeholder="http://127.0.0.1:3001"
                  />
                </label>

                <label className="field">
                  Token do agente
                  <input
                    type="password"
                    value={agentConnection.token}
                    onChange={event =>
                      setAgentConnection({
                        ...agentConnection,
                        token: event.target.value
                      })
                    }
                    placeholder="Cole o token exibido no terminal"
                  />
                </label>

                <button onClick={connectAgent}>
                  Conectar ao agente
                </button>

                <p className="settings-note">
                  A URL e o token ficam no localStorage deste navegador.
                  As senhas não ficam no navegador.
                </p>
              </div>

              <div className="settings-section">
                <h3>ScreenScraper</h3>

                <label className="field">
                  Developer ID
                  <input
                    value={settingsForm.screenscraper.devid}
                    onChange={event =>
                      setSettingsForm({
                        ...settingsForm,
                        screenscraper: {
                          ...settingsForm.screenscraper,
                          devid: event.target.value
                        }
                      })
                    }
                  />
                </label>

                <label className="field">
                  Developer Password
                  <input
                    type="password"
                    value={settingsForm.screenscraper.devpassword}
                    onChange={event =>
                      setSettingsForm({
                        ...settingsForm,
                        screenscraper: {
                          ...settingsForm.screenscraper,
                          devpassword: event.target.value
                        }
                      })
                    }
                    placeholder="Deixe vazio para manter"
                  />
                </label>

                <label className="field">
                  Usuário ScreenScraper
                  <input
                    value={settingsForm.screenscraper.ssid}
                    onChange={event =>
                      setSettingsForm({
                        ...settingsForm,
                        screenscraper: {
                          ...settingsForm.screenscraper,
                          ssid: event.target.value
                        }
                      })
                    }
                  />
                </label>

                <label className="field">
                  Senha ScreenScraper
                  <input
                    type="password"
                    value={settingsForm.screenscraper.sspassword}
                    onChange={event =>
                      setSettingsForm({
                        ...settingsForm,
                        screenscraper: {
                          ...settingsForm.screenscraper,
                          sspassword: event.target.value
                        }
                      })
                    }
                    placeholder="Deixe vazio para manter"
                  />
                </label>

                <button
                  className="small"
                  onClick={testScreenScraper}
                  disabled={testingScreenScraper}
                >
                  {testingScreenScraper
                    ? 'Testando...'
                    : 'Testar ScreenScraper'}
                </button>
              </div>

              <div className="settings-section">
                <h3>MiSTer</h3>

                <label className="field">
                  IP ou hostname
                  <input
                    value={settingsForm.mister.host}
                    onChange={event =>
                      setSettingsForm({
                        ...settingsForm,
                        mister: {
                          ...settingsForm.mister,
                          host: event.target.value
                        }
                      })
                    }
                    placeholder="192.168.50.82"
                  />
                </label>

                <label className="field">
                  Porta SSH
                  <input
                    type="number"
                    value={settingsForm.mister.port}
                    onChange={event =>
                      setSettingsForm({
                        ...settingsForm,
                        mister: {
                          ...settingsForm.mister,
                          port: Number(event.target.value)
                        }
                      })
                    }
                  />
                </label>

                <label className="field">
                  Usuário SSH
                  <input
                    value={settingsForm.mister.username}
                    onChange={event =>
                      setSettingsForm({
                        ...settingsForm,
                        mister: {
                          ...settingsForm.mister,
                          username: event.target.value
                        }
                      })
                    }
                  />
                </label>

                <label className="field">
                  Senha SSH
                  <input
                    type="password"
                    value={settingsForm.mister.password}
                    onChange={event =>
                      setSettingsForm({
                        ...settingsForm,
                        mister: {
                          ...settingsForm.mister,
                          password: event.target.value
                        }
                      })
                    }
                    placeholder="Deixe vazio para manter"
                  />
                </label>

                <label className="field">
                  Pasta remota
                  <input
                    value={settingsForm.mister.remoteBasePath}
                    onChange={event =>
                      setSettingsForm({
                        ...settingsForm,
                        mister: {
                          ...settingsForm.mister,
                          remoteBasePath: event.target.value
                        }
                      })
                    }
                  />
                </label>

                <button
                  className="small"
                  onClick={testMisterConnection}
                  disabled={testingMister}
                >
                  {testingMister
                    ? 'Testando...'
                    : 'Testar MiSTer'}
                </button>
              </div>
            </div>

            <button
              onClick={saveSettingsForm}
              disabled={savingSettings}
            >
              {savingSettings
                ? 'Salvando...'
                : 'Salvar no agente local'}
            </button>
          </CollapsibleCard>
        )}
        <CollapsibleCard
          id="source"
          title="Fonte dos jogos"
        >

          <div className="source-selector">
            <label>
              <input
                type="radio"
                checked={source === 'local'}
                onChange={() => changeSource('local')}
                disabled={running}
              />
              Diretório local
            </label>

            <label>
              <input
                type="radio"
                checked={source === 'network'}
                onChange={() => changeSource('network')}
                disabled={running}
              />
              MiSTer via rede
            </label>
          </div>

          {source === 'local' ? (
            <>
              <div className="paths">
                <div>
                  <b>Pasta games:</b>{' '}
                  {config?.games?.basePath || 'não selecionada'}
                </div>
                <div>
                  <b>Sistemas encontrados:</b>{' '}
                  {availableLocalSystems.length}
                </div>
              </div>

              <button
                onClick={chooseGamesDirectory}
                disabled={running || choosingDirectory}
              >
                {choosingDirectory
                  ? 'Abrindo seletor...'
                  : 'Escolher pasta games'}
              </button>
            </>
          ) : (
            <>
              <div className="paths">
                <div><b>MiSTer:</b> {config?.mister?.host}</div>
                <div>
                  <b>Base:</b> {config?.mister?.remoteBasePath}
                </div>
                <div>
                  <b>Sistemas encontrados:</b>{' '}
                  {availableRemoteSystems.length}
                </div>
                <div>
                  <b>Pastas não reconhecidas:</b>{' '}
                  {remoteSuggestions.length}
                </div>
              </div>

              <button
                onClick={scanRemotePlatforms}
                disabled={running || scanningRemote}
              >
                {scanningRemote
                  ? 'Lendo diretórios...'
                  : 'Atualizar plataformas do MiSTer'}
              </button>
            </>
          )}
        </CollapsibleCard>

        <CollapsibleCard
          id="system"
          title="Sistema"
          actions={
            <button
              className="small"
              onClick={() => setShowEditor(!showEditor)}
            >
              {showEditor ? 'Fechar editor' : 'Editar plataforma'}
            </button>
          }
        >

          <select
            value={selectedSystem}
            onChange={event =>
              setSelectedSystem(event.target.value)
            }
            disabled={running}
          >
            {!selectedSystem && (
              <option value="">Nenhum sistema disponível</option>
            )}

            {systems.map(system => {
              const disabled =
                (
                  source === 'local' &&
                  !system.availableLocal
                ) ||
                (
                  source === 'network' &&
                  !system.availableRemote
                )

              return (
                <option
                  key={system.id}
                  value={system.id}
                  disabled={disabled}
                >
                  {system.name}
                  {disabled ? ' — pasta não encontrada' : ''}
                </option>
              )
            })}
          </select>

          {current && (
            <div className="paths">
              <div>
                <b>ID:</b> {current.id}
              </div>
              <div>
                <b>Pasta reconhecida:</b>{' '}
                {source === 'local'
                  ? (
                      current.detectedFolder ||
                      'não encontrada'
                    )
                  : (
                      current.detectedRemoteFolder ||
                      'não encontrada'
                    )}
              </div>
              <div>
                <b>ROMs:</b>{' '}
                {source === 'local'
                  ? current.gamesPath
                  : remotePath}
              </div>
              <div>
                <b>ScreenScraper:</b>{' '}
                {current.systemeid ?? 'não configurado'}
              </div>
              <div>
                <b>Extensões:</b>{' '}
                {current.extensions?.join(', ') || 'todas'}
              </div>
            </div>
          )}
        </CollapsibleCard>

        {showEditor && current && (
          <CollapsibleCard
            id="platform-editor"
            title="Editor de plataforma"
            className="platform-editor"
          >

            <label className="field">
              Nome exibido
              <input
                type="text"
                value={editor.displayName}
                onChange={event =>
                  setEditor({
                    ...editor,
                    displayName: event.target.value
                  })
                }
              />
            </label>

            <label className="field">
              Pastas reconhecidas
              <textarea
                value={editor.folders}
                onChange={event =>
                  setEditor({
                    ...editor,
                    folders: event.target.value
                  })
                }
              />
            </label>

            <label className="field">
              Aliases
              <textarea
                value={editor.aliases}
                onChange={event =>
                  setEditor({
                    ...editor,
                    aliases: event.target.value
                  })
                }
              />
            </label>

            <label className="field">
              Formatos, como *.bin, *.cue
              <textarea
                value={editor.formats}
                onChange={event =>
                  setEditor({
                    ...editor,
                    formats: event.target.value
                  })
                }
              />
            </label>

            <label className="field">
              ScreenScraper ID
              <input
                type="number"
                value={editor.systemeid}
                onChange={event =>
                  setEditor({
                    ...editor,
                    systemeid: event.target.value
                  })
                }
              />
            </label>

            <div className="editor-actions">
              <button onClick={savePlatform}>
                Salvar sobrescrita
              </button>
              <button className="small" onClick={restorePlatform}>
                Restaurar padrão
              </button>
            </div>
          </CollapsibleCard>
        )}

        {source === 'network' &&
          remoteSuggestions.length > 0 && (
          <CollapsibleCard
            id="remote-suggestions"
            title="Sugestões de plataformas"
            className="remote-suggestions"
            badge={remoteSuggestions.length}
            defaultCollapsed={false}
          >

            <p className="muted suggestion-help">
              Estas pastas existem no MiSTer, mas não correspondem
              a nenhuma plataforma de peas.json ou peas_local.json.
            </p>

            <div className="suggestion-list">
              {remoteSuggestions.map(suggestion => (
                <div
                  className="suggestion-item"
                  key={suggestion.folder}
                >
                  <div>
                    <strong>{suggestion.folder}</strong>
                    <small>
                      ID sugerido: {suggestion.suggestedId}
                    </small>
                  </div>

                  <button
                    className="small"
                    onClick={() =>
                      addRemoteSuggestion(suggestion)
                    }
                    disabled={running}
                  >
                    Adicionar ao peas_local
                  </button>
                </div>
              ))}
            </div>
          </CollapsibleCard>
        )}

        <CollapsibleCard
          id="cache"
          title="Cache SQLite"
          badge={cacheStats?.entries ?? 0}
          defaultCollapsed={true}
          actions={
            <button
              className="small"
              onClick={clearCache}
              disabled={running}
            >
              Limpar cache
            </button>
          }
        >
          <div className="paths">
            <div><b>Status:</b> {cacheStats?.enabled ? 'ativo' : 'desativado'}</div>
            <div><b>Entradas:</b> {cacheStats?.entries ?? 0}</div>
            <div><b>Reutilizações:</b> {cacheStats?.hits ?? 0}</div>
            <div><b>Validade:</b> {cacheStats?.ttlDays ?? 0} dias</div>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          id="roms"
          title="ROMs"
          badge={loadingRoms ? '...' : roms.length}
          className="roms-card"
        >
          {loadingRoms && (
            <div className="rom-loading-overlay" role="status">
              <div className="neon-spinner" aria-hidden="true" />
              <strong>Escaneando ROMs</strong>
              <span>
                {loadingRomsMessage ||
                  'Aguarde enquanto os arquivos são analisados...'}
              </span>
            </div>
          )}

          <div className="rom-options-panel">
            <label>
              <input
                type="checkbox"
                checked={options.force}
                onChange={event =>
                  setOptions({
                    ...options,
                    force: event.target.checked
                  })
                }
                disabled={running || loadingRoms}
              />
              Forçar atualização das imagens
            </label>

            <label>
              <input
                type="checkbox"
                checked={options.background}
                onChange={event =>
                  setOptions({
                    ...options,
                    background: event.target.checked
                  })
                }
                disabled={running || loadingRoms}
              />
              Baixar imagem -BG
            </label>

            <label>
              <input
                type="checkbox"
                checked={options.dryRun}
                onChange={event =>
                  setOptions({
                    ...options,
                    dryRun: event.target.checked
                  })
                }
                disabled={running || loadingRoms}
              />
              Simulação
            </label>

            <button
              onClick={startScrape}
              disabled={
                running ||
                loadingRoms ||
                !selectedSystem ||
                (
                  source === 'local' &&
                  !current?.availableLocal
                ) ||
                (
                  source === 'network' &&
                  !current?.availableRemote
                )
              }
            >
              {running
                ? 'Processando...'
                : 'Iniciar Scraper'}
            </button>
          </div>
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
                disabled={loadingRoms}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>

          <div className="rom-list">
            {paginatedRoms.map(rom => (
              <button
                type="button"
                className={`rom rom-button rom-with-preview ${
                  selectedRom?.path === rom.path
                    ? 'selected'
                    : ''
                }`}
                key={rom.path}
                onClick={() => setSelectedRom(rom)}
                onMouseEnter={() => setHoveredRom(rom)}
                onMouseLeave={() => setHoveredRom(null)}
              >
                <div className="rom-main-info">
                  <span className="rom-name">
                    {rom.name}
                  </span>

                  <small className="rom-directory">
                    {rom.relativeDirectory &&
                    rom.relativeDirectory !== '.'
                      ? rom.relativeDirectory
                      : 'Raiz da plataforma'}
                  </small>
                </div>

                <div className="rom-art-status">
                  <span
                    className={`art-indicator ${
                      rom.boxExists
                        ? 'has-art'
                        : 'missing-art'
                    }`}
                  >
                    Capa
                  </span>

                  <span
                    className={`art-indicator ${
                      rom.backgroundExists
                        ? 'has-art'
                        : 'missing-art'
                    }`}
                  >
                    Fundo
                  </span>
                </div>

                {hoveredRom?.path === rom.path && (
                  <div className="rom-hover-preview">
                    <div className="preview-panel">
                      <strong>Capa</strong>

                      {rom.boxExists ? (
                        <img
                          src={artworkUrlForRom(rom, 'box')}
                          alt={`Capa de ${rom.name}`}
                        />
                      ) : (
                        <div className="preview-missing">
                          Sem capa
                        </div>
                      )}
                    </div>

                    <div className="preview-panel">
                      <strong>Fundo</strong>

                      {rom.backgroundExists ? (
                        <img
                          src={artworkUrlForRom(
                            rom,
                            'background'
                          )}
                          alt={`Fundo de ${rom.name}`}
                        />
                      ) : (
                        <div className="preview-missing">
                          Sem fundo
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </button>
            ))}

            {!paginatedRoms.length && (
              <p className="muted">
                Nenhuma ROM encontrada.
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
              disabled={loadingRoms || romPage <= 1}
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
              disabled={loadingRoms || romPage >= romPageCount}
            >
              Próxima
            </button>
          </div>
        </CollapsibleCard>

        {selectedRom && (
          <CollapsibleCard
            id="preview"
            title="Preview de artwork"
            defaultCollapsed={false}
          >
            <div className="preview-title">{selectedRom.name}</div>
            <div className="artwork-preview-grid">
              <figure>
                <figcaption>Capa</figcaption>
                {selectedRom.boxExists ? (
                  <img src={artworkUrl('box')} alt={`Capa de ${selectedRom.name}`} />
                ) : (
                  <div className="preview-empty">Sem capa</div>
                )}
              </figure>
              <figure>
                <figcaption>Background</figcaption>
                {selectedRom.backgroundExists ? (
                  <img src={artworkUrl('background')} alt={`Background de ${selectedRom.name}`} />
                ) : (
                  <div className="preview-empty">Sem background</div>
                )}
              </figure>
            </div>
          </CollapsibleCard>
        )}

        <CollapsibleCard
          id="log"
          title="Log"
          actions={
            <button
              className="small"
              onClick={() => setLogs([])}
              disabled={running}
            >
              Limpar
            </button>
          }
        >

          <pre className="log">
            {logs.join('\n') || 'Aguardando...'}
          </pre>
        </CollapsibleCard>
      </main>

      {modal.open && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              closeModal()
            }
          }}
        >
          <div
            className={`feedback-modal modal-${modal.type}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-modal-title"
          >
            <div className="feedback-modal-icon" aria-hidden="true">
              {modal.type === 'success'
                ? '✓'
                : modal.type === 'error'
                  ? '!'
                  : 'i'}
            </div>

            <div className="feedback-modal-content">
              <h2 id="feedback-modal-title">
                {modal.title}
              </h2>

              <p>{modal.message}</p>

              {modal.details && (
                <pre className="feedback-modal-details">
                  {modal.details}
                </pre>
              )}
            </div>

            <button
              type="button"
              className="modal-close-button"
              onClick={closeModal}
              autoFocus
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

createRoot(
  document.getElementById('root')
).render(<App />)
