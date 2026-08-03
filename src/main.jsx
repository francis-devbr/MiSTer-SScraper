import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const api = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
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

function App() {
  const [systems, setSystems] = useState([])
  const [selectedSystem, setSelectedSystem] = useState('')
  const [source, setSource] = useState('local')
  const [roms, setRoms] = useState([])
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

  useEffect(() => {
    loadConfig()
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
    try {
      setRoms([])

      const data = await api(
        `/api/roms?system=${encodeURIComponent(systemId)}` +
        `&source=${encodeURIComponent(selectedSource)}`
      )

      setRoms(data.roms || [])
    } catch (error) {
      setRoms([])
      addLog(`ERRO ao listar ROMs: ${error.message}`)
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

  async function startScrape() {
    if (!selectedSystem) {
      return
    }

    setRunning(true)
    setLogs([])

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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

        <span className={`status ${running ? 'running' : ''}`}>
          {running ? 'SCRAPING' : 'PRONTO'}
        </span>
      </header>

      <main>
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
          id="options"
          title="Opções"
        >

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
              disabled={running}
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
              disabled={running}
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
              disabled={running}
            />
            Simulação
          </label>

          <button
            onClick={startScrape}
            disabled={
              running ||
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
            {running ? 'Processando...' : 'Iniciar Scraper'}
          </button>
        </CollapsibleCard>

        <CollapsibleCard
          id="roms"
          title="ROMs"
          badge={roms.length}
        >

          <div className="rom-list">
            {roms.map(rom => (
              <div className="rom" key={rom.path}>
                <span>{rom.name}</span>
                <small>
                  {rom.boxExists ? '🖼 capa' : '○ capa'}{' '}
                  {rom.backgroundExists ? '🖼 BG' : '○ BG'}
                </small>
              </div>
            ))}

            {!roms.length && (
              <p className="muted">Nenhuma ROM encontrada.</p>
            )}
          </div>
        </CollapsibleCard>

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
    </div>
  )
}

createRoot(
  document.getElementById('root')
).render(<App />)
