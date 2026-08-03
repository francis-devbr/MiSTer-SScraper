import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import os from 'os'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import SftpClient from 'ssh2-sftp-client'
import { createPlatformCatalog } from './platformCatalog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const configPath = path.join(__dirname, 'config.json')
const configExamplePath = path.join(__dirname, 'config.example.json')
const settingsPath = path.join(__dirname, 'settings.json')
const peasPath = path.join(__dirname, 'peas.json')
const peasLocalPath = path.join(__dirname, 'peas_local.json')
const peasLocalExamplePath = path.join(__dirname, 'peas_local.example.json')
const platformIdsPath = path.join(__dirname, 'platform_ids.json')
const execFileAsync = promisify(execFile)

if (!fs.existsSync(configPath)) {
  if (!fs.existsSync(configExamplePath)) {
    throw new Error(
      `Configuração não encontrada: ${configExamplePath}`
    )
  }

  fs.copyFileSync(
    configExamplePath,
    configPath
  )

  console.log(
    `Configuração criada em: ${configPath}`
  )
}

if (!fs.existsSync(peasLocalPath)) {
  if (fs.existsSync(peasLocalExamplePath)) {
    fs.copyFileSync(
      peasLocalExamplePath,
      peasLocalPath
    )
  } else {
    fs.writeFileSync(
      peasLocalPath,
      '{}\n',
      'utf8'
    )
  }
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

function loadSettings() {
  if (!fs.existsSync(settingsPath)) {
    return {}
  }

  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch {
    return {}
  }
}

function saveSettings(settings) {
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(settings, null, 2),
    'utf8'
  )
}

const savedSettings = loadSettings()

let selectedGamesBasePath =
  savedSettings.gamesBasePath ||
  config.games?.basePath ||
  ''

const platformCatalog = createPlatformCatalog({
  peasPath,
  localPath: peasLocalPath,
  idsPath: platformIdsPath
})

let detectedPlatforms = []
let localFolderSuggestions = []
let remoteDetectedPlatforms = []
let remoteFolderSuggestions = []
let remoteScanCompleted = false

function refreshDetectedPlatforms() {
  const result =
    platformCatalog.detectFolders(
      selectedGamesBasePath
    )

  detectedPlatforms = result.platforms
  localFolderSuggestions = result.suggestions

  return detectedPlatforms
}

function resetRemoteDetection() {
  remoteDetectedPlatforms =
    platformCatalog.list().map(platform => ({
      ...platform,
      detectedFolder: null,
      matchType: null,
      availableRemote: false
    }))

  remoteFolderSuggestions = []
  remoteScanCompleted = false
}

resetRemoteDetection()

refreshDetectedPlatforms()

const app = express()

app.use(cors())
app.use(express.json({ limit: '1mb' }))

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function systemByName(name) {
  const key = String(name || '').toLowerCase()

  return remoteDetectedPlatforms.find(
    platform =>
      platform.id.toLowerCase() === key ||
      platform.name.toLowerCase() === key
  ) || detectedPlatforms.find(
    platform =>
      platform.id.toLowerCase() === key ||
      platform.name.toLowerCase() === key
  ) || platformCatalog.get(key)
}

function ext(file) {
  const index = file.lastIndexOf('.')

  if (index < 0) {
    return ''
  }

  return file.slice(index).toLowerCase()
}

function strip(file) {
  const index = file.lastIndexOf('.')

  if (index <= 0) {
    return file
  }

  return file.slice(0, index)
}

function normalizeExtensions(extensions) {
  if (!Array.isArray(extensions)) {
    return []
  }

  return extensions.map(value => String(value).toLowerCase())
}

function systemFolderName(system) {
  const remoteMatch =
    remoteDetectedPlatforms.find(
      item => item.id === system.id
    )

  return String(
    remoteMatch?.detectedFolder ||
    system.detectedRemoteFolder ||
    system.detectedFolder ||
    system.remoteFolder ||
    system.folder ||
    system.platformFolder ||
    system.id ||
    system.name
  )
}

function localGamesPath(system) {
  if (!selectedGamesBasePath) {
    return ''
  }

  return path.join(
    selectedGamesBasePath,
    systemFolderName(system)
  )
}

function localMediaPath(system) {
  return path.join(
    localGamesPath(system),
    'media'
  )
}

function localSystemExists(system) {
  return Boolean(
    system?.availableLocal &&
    localGamesPath(system) &&
    fs.existsSync(localGamesPath(system))
  )
}

function systemView(system) {
  const localFolder =
    system.availableLocal
      ? system.detectedFolder
      : null

  const remoteMatch =
    remoteDetectedPlatforms.find(
      item => item.id === system.id
    )

  const remoteFolder =
    remoteMatch?.availableRemote
      ? remoteMatch.detectedFolder
      : null

  const gamesPath =
    localFolder && selectedGamesBasePath
      ? path.join(
          selectedGamesBasePath,
          localFolder
        )
      : ''

  return {
    id: system.id,
    name: system.name || system.id,
    folder:
      localFolder ||
      remoteFolder ||
      system.id,
    detectedFolder: localFolder,
    detectedRemoteFolder: remoteFolder,
    localMatchType: system.matchType || null,
    remoteMatchType: remoteMatch?.matchType || null,
    aliases: system.aliases || [],
    folders: system.folders || [],
    formats: system.formats || [],
    retroarchDbName:
      system.retroarchDbName || null,
    systemeid: system.systemeid,
    mobyId: system.mobyId ?? null,
    tgdbId: system.tgdbId ?? null,
    gamesPath,
    mediaPath:
      gamesPath
        ? path.join(gamesPath, 'media')
        : '',
    remotePath:
      remoteFolder
        ? path.posix.join(
            config.mister.remoteBasePath,
            remoteFolder
          )
        : path.posix.join(
            config.mister.remoteBasePath,
            system.id
          ),
    remoteMediaPath:
      remoteFolder
        ? path.posix.join(
            config.mister.remoteBasePath,
            remoteFolder,
            'media'
          )
        : path.posix.join(
            config.mister.remoteBasePath,
            system.id,
            'media'
          ),
    extensions: system.extensions || [],
    availableLocal:
      Boolean(system.availableLocal),
    availableRemote:
      Boolean(remoteMatch?.availableRemote)
  }
}

function remoteSystemPath(system) {
  return path.posix.join(
    config.mister.remoteBasePath,
    systemFolderName(system)
  )
}

function remoteMediaPath(system) {
  return path.posix.join(
    remoteSystemPath(system),
    'media'
  )
}

function walk(dir, result = []) {
  if (!fs.existsSync(dir)) {
    return result
  }

  for (const entry of fs.readdirSync(dir, {
    withFileTypes: true
  })) {
    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      /*
       * Não entrar na pasta media.
       */
      if (
        path.resolve(full) !==
        path.resolve(dir, 'media')
      ) {
        walk(full, result)
      }
    } else {
      result.push(full)
    }
  }

  return result
}

function romsForLocal(system) {
  const files = walk(localGamesPath(system))

  const extensions = normalizeExtensions(
    system.extensions
  )

  return files
    .filter(file => {
      return (
        extensions.length === 0 ||
        extensions.includes(ext(file))
      )
    })
    .map(file => {
      const name = path.basename(file)
      const base = strip(name)
      const mediaPath = localMediaPath(system)

      return {
        name,
        path: file,
        base,
        boxExists: fs.existsSync(
          path.join(mediaPath, `${base}.png`)
        ),
        backgroundExists: fs.existsSync(
          path.join(mediaPath, `${base}-BG.png`)
        )
      }
    })
}

async function listRemoteFiles(sftp, system) {
  const remotePath = remoteSystemPath(system)

  const entries = await sftp.list(remotePath)

  const extensions = normalizeExtensions(
    system.extensions
  )

  const result = []

  for (const entry of entries) {
    if (entry.type !== '-') {
      continue
    }

    const fileExt = ext(entry.name)

    if (
      extensions.length > 0 &&
      !extensions.includes(fileExt)
    ) {
      continue
    }

    const base = strip(entry.name)

    const mediaPath = remoteMediaPath(system)

    let boxExists = false
    let backgroundExists = false

    try {
      boxExists = await sftp.exists(
        path.posix.join(mediaPath, `${base}.png`)
      )
    } catch {
      boxExists = false
    }

    try {
      backgroundExists = await sftp.exists(
        path.posix.join(mediaPath, `${base}-BG.png`)
      )
    } catch {
      backgroundExists = false
    }

    result.push({
      name: entry.name,
      path: path.posix.join(
        remotePath,
        entry.name
      ),
      base,
      boxExists: Boolean(boxExists),
      backgroundExists: Boolean(backgroundExists),
      size: entry.size
    })
  }

  return result
}

/*
|--------------------------------------------------------------------------
| SFTP
|--------------------------------------------------------------------------
*/

function createSftp() {
  const sftp = new SftpClient()

  return {
    sftp,

    async connect() {
      await sftp.connect({
        host: config.mister.host,
        port: Number(config.mister.port || 22),
        username: config.mister.username,
        password: config.mister.password
      })
    }
  }
}

/*
|--------------------------------------------------------------------------
| Hash local
|--------------------------------------------------------------------------
*/

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const md5 = createHash('md5')
    const sha1 = createHash('sha1')
    const sha256 = createHash('sha256')

    let size = 0

    const stream = fs.createReadStream(file)

    stream.on('data', chunk => {
      size += chunk.length

      md5.update(chunk)
      sha1.update(chunk)
      sha256.update(chunk)
    })

    stream.on('end', () => {
      resolve({
        md5: md5.digest('hex').toUpperCase(),
        sha1: sha1.digest('hex').toUpperCase(),
        sha256: sha256.digest('hex').toUpperCase(),
        size
      })
    })

    stream.on('error', reject)
  })
}

/*
|--------------------------------------------------------------------------
| Hash remoto
|--------------------------------------------------------------------------
|
| ScreenScraper precisa do MD5/SHA1.
|
| Como a ROM está no MiSTer, fazemos download temporário
| para o PC, calculamos o hash e apagamos imediatamente.
|
|--------------------------------------------------------------------------
*/

async function hashRemoteFile(sftp, remoteFile, send) {
  const tempName =
    `mister-scraper-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}.rom`

  const tempFile = path.join(
    os.tmpdir(),
    tempName
  )

  try {
    send(
      '  Baixando ROM temporariamente para calcular hash...'
    )

    await sftp.fastGet(
      remoteFile,
      tempFile
    )

    send(
      '  Calculando MD5/SHA1...'
    )

    const hashes = await hashFile(tempFile)

    return hashes
  } finally {
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile)
      }
    } catch {
      // Ignorado.
    }
  }
}

/*
|--------------------------------------------------------------------------
| ScreenScraper
|--------------------------------------------------------------------------
*/

function enc(value) {
  return encodeURIComponent(
    value ?? ''
  )
}

function baseParams() {
  const ss = config.screenscraper

  let query =
    `devid=${enc(ss.devid)}` +
    `&devpassword=${enc(ss.devpassword)}` +
    `&softname=${enc(ss.softname)}` +
    `&output=json`

  if (ss.ssid) {
    query += `&ssid=${enc(ss.ssid)}`
  }

  if (ss.sspassword) {
    query += `&sspassword=${enc(ss.sspassword)}`
  }

  return query
}

async function screenScraperGame(
  system,
  romName,
  hashes
) {
  const url =
    `https://api.screenscraper.fr/api2/jeuInfos.php?` +
    baseParams() +
    `&systemeid=${enc(system.systemeid)}` +
    `&romtype=rom` +
    `&romnom=${enc(romName)}` +
    `&romtaille=${hashes.size}` +
    `&md5=${enc(hashes.md5)}` +
    `&sha1=${enc(hashes.sha1)}`

    
  const response = await fetch(url)

  const text = await response.text()

  if (response.status === 429) {
    throw new Error(
      'ScreenScraper HTTP 429: limite atingido.'
    )
  }

  if (!response.ok) {
    throw new Error(
      `ScreenScraper HTTP ${response.status}: ${text}`
    )
  }

  let json

  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(
      `Resposta inválida da ScreenScraper: ${text.slice(0, 300)}`
    )
  }

  return json?.response?.jeu ?? null
}

async function downloadMedia(
  system,
  game,
  mediaName
) {
  if (!game?.id) {
    return null
  }

  const url =
    `https://api.screenscraper.fr/api2/mediaJeu.php?` +
    baseParams() +
    `&systemeid=${enc(system.systemeid)}` +
    `&jeuid=${enc(game.id)}` +
    `&media=${enc(mediaName)}` +
    `&outputformat=png`

    console.log(url)
    
  const response = await fetch(url)

  if (response.status === 429) {
    throw new Error(
      'ScreenScraper HTTP 429: limite atingido.'
    )
  }

  if (!response.ok) {
    throw new Error(
      `Media HTTP ${response.status}`
    )
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  )

  if (buffer.length < 8) {
    return null
  }

  const png =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47

  const jpg =
    buffer[0] === 0xff &&
    buffer[1] === 0xd8

  return png || jpg
    ? buffer
    : null
}

function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  )
}

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

app.get('/api/config', (req, res) => {
  res.json({
    games: {
      basePath: selectedGamesBasePath
    },

    systems: detectedPlatforms.map(systemView),

    suggestions: {
      local: localFolderSuggestions,
      remote: remoteFolderSuggestions
    },

    mister: {
      host: config.mister.host,
      port: config.mister.port,
      username: config.mister.username,
      remoteBasePath: config.mister.remoteBasePath,
      scanCompleted: remoteScanCompleted
    }
  })
})

/*
|--------------------------------------------------------------------------
| SELEÇÃO DO DIRETÓRIO LOCAL
|--------------------------------------------------------------------------
*/

app.post('/api/local/select-directory', async (req, res) => {
  try {
    if (process.platform !== 'win32') {
      return res.status(400).json({
        error:
          'O seletor nativo está disponível no Windows. Use /api/local/set-directory para informar o caminho.'
      })
    }

    const initialPath =
      selectedGamesBasePath &&
      fs.existsSync(selectedGamesBasePath)
        ? selectedGamesBasePath
        : ''

    const escapedInitial =
      initialPath.replace(/'/g, "''")

    const script = `
Add-Type -AssemblyName System.Windows.Forms

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Selecione a pasta games'
$dialog.ShowNewFolderButton = $false

if ('${escapedInitial}' -ne '') {
  $dialog.SelectedPath = '${escapedInitial}'
}

$result = $dialog.ShowDialog()

if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Write-Output $dialog.SelectedPath
}
`

    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-STA',
        '-Command',
        script
      ],
      {
        windowsHide: true,
        encoding: 'utf8'
      }
    )

    const selectedPath = String(stdout || '').trim()

    if (!selectedPath) {
      return res.json({
        cancelled: true,
        games: {
          basePath: selectedGamesBasePath
        },
        systems: detectedPlatforms.map(systemView)
      })
    }

    if (
      !fs.existsSync(selectedPath) ||
      !fs.statSync(selectedPath).isDirectory()
    ) {
      return res.status(400).json({
        error: `Diretório inválido: ${selectedPath}`
      })
    }

    selectedGamesBasePath = path.resolve(selectedPath)

    saveSettings({
      ...loadSettings(),
      gamesBasePath: selectedGamesBasePath
    })

    refreshDetectedPlatforms()

    return res.json({
      cancelled: false,
      games: {
        basePath: selectedGamesBasePath
      },
      systems: detectedPlatforms.map(systemView)
    })
  } catch (error) {
    return res.status(500).json({
      error: error.message
    })
  }
})

app.post('/api/local/set-directory', (req, res) => {
  const selectedPath = String(
    req.body?.path || ''
  ).trim()

  if (!selectedPath) {
    return res.status(400).json({
      error: 'Informe o caminho da pasta games.'
    })
  }

  if (
    !fs.existsSync(selectedPath) ||
    !fs.statSync(selectedPath).isDirectory()
  ) {
    return res.status(400).json({
      error: `Diretório inválido: ${selectedPath}`
    })
  }

  selectedGamesBasePath =
    path.resolve(selectedPath)

  saveSettings({
    ...loadSettings(),
    gamesBasePath: selectedGamesBasePath
  })

  refreshDetectedPlatforms()

  return res.json({
    games: {
      basePath: selectedGamesBasePath
    },
    systems: detectedPlatforms.map(systemView)
  })
})


/*
|--------------------------------------------------------------------------
| CATÁLOGO E EDIÇÃO DE PLATAFORMAS
|--------------------------------------------------------------------------
*/

app.get('/api/platforms', (req, res) => {
  res.json({
    platforms:
      detectedPlatforms.map(systemView)
  })
})

app.get('/api/platforms/:id', (req, res) => {
  const platform =
    platformCatalog.get(req.params.id)

  if (!platform) {
    return res.status(404).json({
      error: 'Plataforma não encontrada.'
    })
  }

  const detected =
    detectedPlatforms.find(
      item => item.id === platform.id
    ) || platform

  return res.json({
    platform: systemView(detected)
  })
})

app.put('/api/platforms/:id', (req, res) => {
  try {
    platformCatalog.update(
      req.params.id,
      req.body || {}
    )

    refreshDetectedPlatforms()
    resetRemoteDetection()

    const platform =
      detectedPlatforms.find(
        item =>
          item.id ===
          String(req.params.id).toLowerCase()
      )

    return res.json({
      success: true,
      platform: systemView(platform)
    })
  } catch (error) {
    return res.status(400).json({
      error: error.message
    })
  }
})

app.delete(
  '/api/platforms/:id/override',
  (req, res) => {
    try {
      platformCatalog.removeOverride(
        req.params.id
      )

      refreshDetectedPlatforms()
      resetRemoteDetection()

      const platform =
        detectedPlatforms.find(
          item =>
            item.id ===
            String(req.params.id).toLowerCase()
        )

      return res.json({
        success: true,
        platform: systemView(platform)
      })
    } catch (error) {
      return res.status(400).json({
        error: error.message
      })
    }
  }
)

app.post('/api/platforms/reload', (req, res) => {
  platformCatalog.reload()
  refreshDetectedPlatforms()
  resetRemoteDetection()

  return res.json({
    success: true,
    platforms:
      detectedPlatforms.map(systemView)
  })
})


/*
|--------------------------------------------------------------------------
| DETECÇÃO DAS PLATAFORMAS REMOTAS
|--------------------------------------------------------------------------
*/

async function scanRemotePlatforms() {
  const connection = createSftp()

  try {
    await connection.connect()

    const entries = await connection.sftp.list(
      config.mister.remoteBasePath
    )

    const folders = entries
      .filter(entry => entry.type === 'd')
      .map(entry => entry.name)
      .filter(name =>
        String(name).toLowerCase() !== 'media'
      )

    const result =
      platformCatalog.detectRemoteFolders(
        folders
      )

    remoteDetectedPlatforms =
      result.platforms
    remoteFolderSuggestions =
      result.suggestions
    remoteScanCompleted = true

    return {
      platforms:
        detectedPlatforms.map(systemView),
      suggestions:
        remoteFolderSuggestions,
      folders
    }
  } finally {
    try {
      await connection.sftp.end()
    } catch {}
  }
}

app.get(
  '/api/mister/platforms',
  async (req, res) => {
    try {
      const result =
        await scanRemotePlatforms()

      return res.json({
        success: true,
        ...result
      })
    } catch (error) {
      resetRemoteDetection()

      return res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }
)

app.post(
  '/api/platforms/suggestions',
  (req, res) => {
    try {
      const folder = String(
        req.body?.folder || ''
      ).trim()

      const requestedId = String(
        req.body?.id || ''
      ).trim()

      if (!folder) {
        return res.status(400).json({
          error: 'Informe a pasta sugerida.'
        })
      }

      const id =
        requestedId ||
        platformCatalog.normalize(folder)

      if (!id) {
        return res.status(400).json({
          error:
            'Não foi possível gerar o ID da plataforma.'
        })
      }

      platformCatalog.update(id, {
        displayName: folder,
        folders: [folder],
        aliases: [folder],
        formats: [],
        systemeid: null
      })

      refreshDetectedPlatforms()
      resetRemoteDetection()

      return res.json({
        success: true,
        platform:
          platformCatalog.get(id),
        message:
          `A plataforma "${id}" foi adicionada ao peas_local.json.`
      })
    } catch (error) {
      return res.status(400).json({
        error: error.message
      })
    }
  }
)

/*
|--------------------------------------------------------------------------
| TESTE SFTP
|--------------------------------------------------------------------------
*/

app.get('/api/mister/test', async (req, res) => {
  const connection = createSftp()

  try {
    await connection.connect()

    const sftp = connection.sftp

    const rootExists =
      await sftp.exists(
        config.mister.remoteBasePath
      )

    await sftp.end()

    res.json({
      success: true,
      message: 'Conexão SFTP realizada com sucesso.',
      remoteBasePath:
        config.mister.remoteBasePath,
      rootExists: Boolean(rootExists)
    })
  } catch (error) {
    try {
      await connection.sftp.end()
    } catch {}

    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/*
|--------------------------------------------------------------------------
| ROMS
|--------------------------------------------------------------------------
*/

app.get('/api/roms', async (req, res) => {
  const system = systemByName(
    req.query.system
  )

  if (!system) {
    return res.status(404).json({
      error: 'Sistema não encontrado'
    })
  }

  const source =
    String(req.query.source || 'local')

  try {
    if (source === 'network') {
      if (!remoteScanCompleted) {
        await scanRemotePlatforms()
      }

      const remoteSystem =
        remoteDetectedPlatforms.find(
          item => item.id === system.id
        )

      if (!remoteSystem?.availableRemote) {
        return res.status(404).json({
          error:
            `Pasta remota da plataforma não encontrada em ${config.mister.remoteBasePath}.`
        })
      }

      const connection = createSftp()

      try {
        await connection.connect()

        const roms =
          await listRemoteFiles(
            connection.sftp,
            system
          )

        await connection.sftp.end()

        return res.json({
          source: 'network',
          roms
        })
      } catch (error) {
        try {
          await connection.sftp.end()
        } catch {}

        throw error
      }
    }

    if (!localSystemExists(system)) {
      return res.status(404).json({
        error:
          `Pasta do sistema não encontrada: ${localGamesPath(system)}`
      })
    }

    return res.json({
      source: 'local',
      gamesPath: localGamesPath(system),
      roms: romsForLocal(system)
    })
  } catch (error) {
    return res.status(500).json({
      error: error.message
    })
  }
})

/*
|--------------------------------------------------------------------------
| SCRAPE
|--------------------------------------------------------------------------
*/

app.post('/api/scrape', async (req, res) => {
  const system = systemByName(
    req.body.system
  )

  if (!system) {
    return res.status(404).json({
      error: 'Sistema não encontrado'
    })
  }

  const source =
    req.body.source === 'network'
      ? 'network'
      : 'local'

  const force =
    Boolean(req.body.force)

  const background =
    req.body.background !== false

  const dryRun =
    Boolean(req.body.dryRun)

  res.status(200)

  res.setHeader(
    'Content-Type',
    'application/x-ndjson; charset=utf-8'
  )

  res.setHeader(
    'Cache-Control',
    'no-cache'
  )

  res.setHeader(
    'Connection',
    'keep-alive'
  )

  const send = message => {
    res.write(
      JSON.stringify({
        message
      }) + '\n'
    )
  }

  let sftp = null

  try {
    send(`Sistema: ${system.name}`)
    send(`Origem: ${
      source === 'network'
        ? 'MiSTer via SFTP'
        : 'Diretório local'
    }`)

    let roms = []

    /*
     * LOCAL
     */

    if (source === 'local') {
      if (!localSystemExists(system)) {
        throw new Error(
          `Pasta do sistema não encontrada: ${localGamesPath(system)}`
        )
      }

      fs.mkdirSync(
        localMediaPath(system),
        {
          recursive: true
        }
      )

      roms =
        romsForLocal(system)

      send(
        `ROMs encontradas: ${roms.length}`
      )

      send(
        `ROMs: ${localGamesPath(system)}`
      )

      send(
        `Media: ${localMediaPath(system)}`
      )
    }

    /*
     * NETWORK
     */

    if (source === 'network') {
      if (!remoteScanCompleted) {
        await scanRemotePlatforms()
      }

      const remoteSystem =
        remoteDetectedPlatforms.find(
          item => item.id === system.id
        )

      if (!remoteSystem?.availableRemote) {
        throw new Error(
          `Pasta remota da plataforma não encontrada em ${config.mister.remoteBasePath}.`
        )
      }

      system.detectedRemoteFolder =
        remoteSystem.detectedFolder

      send(
        `Conectando ao MiSTer ${config.mister.host}...`
      )

      const connection =
        createSftp()

      await connection.connect()

      sftp =
        connection.sftp

      const remotePath =
        remoteSystemPath(system)

      const remoteMedia =
        remoteMediaPath(system)

      send(
        `ROMs: ${remotePath}`
      )

      send(
        `Media: ${remoteMedia}`
      )

      const exists =
        await sftp.exists(
          remotePath
        )

      if (!exists) {
        throw new Error(
          `Diretório remoto não encontrado: ${remotePath}`
        )
      }

      /*
       * Cria media se não existir.
       */

      await sftp.mkdir(
        remoteMedia,
        true
      )

      roms =
        await listRemoteFiles(
          sftp,
          system
        )

      send(
        `ROMs encontradas: ${roms.length}`
      )
    }

    for (
      let i = 0;
      i < roms.length;
      i++
    ) {
      const rom =
        roms[i]

      const base =
        strip(rom.name)

      send(
        `[${i + 1}/${roms.length}] ${rom.name}`
      )

      /*
       * Verifica artwork existente.
       */

      if (
        !force &&
        rom.boxExists &&
        (
          !background ||
          rom.backgroundExists
        )
      ) {
        send(
          '  SKIP: artwork já existe'
        )

        continue
      }

      if (dryRun) {
        send(
          '  DRY-RUN: não consultando API'
        )

        continue
      }

      try {
        /*
         * HASH
         */

        let hashes

        if (source === 'network') {
          hashes =
            await hashRemoteFile(
              sftp,
              rom.path,
              send
            )
        } else {
          hashes =
            await hashFile(
              rom.path
            )
        }

        send(
          `  MD5: ${hashes.md5}`
        )

        /*
         * SCREEN SCRAPER
         */

        send(
          '  Consultando ScreenScraper...'
        )

        const game =
          await screenScraperGame(
            system,
            rom.name,
            hashes
          )

        if (!game) {
          send(
            '  NÃO ENCONTRADO'
          )

          continue
        }

        send(
          `  Encontrado: ${
            game.nom || base
          } [id=${game.id}]`
        )

        /*
         * BOX
         */

        if (
          force ||
          !rom.boxExists
        ) {
          await sleep(
            config.screenscraper.delayMs || 1500
          )

          const data =
            await downloadMedia(
              system,
              game,
              config.screenscraper.boxartMedia ||
                'box-2D'
            )

          if (data) {
            if (source === 'network') {
              const remoteFile =
                path.posix.join(
                  remoteMediaPath(system),
                  `${base}.png`
                )

              await sftp.put(
                data,
                remoteFile
              )

              send(
                `  BOX enviada: ${remoteFile}`
              )
            } else {
              const localFile =
                path.join(
                  localMediaPath(system),
                  `${base}.png`
                )

              fs.writeFileSync(
                localFile,
                data
              )

              send(
                `  BOX: ${localFile}`
              )
            }
          } else {
            send(
              '  BOX: não disponível'
            )
          }
        }

        /*
         * BACKGROUND
         */

        if (
          background &&
          (
            force ||
            !rom.backgroundExists
          )
        ) {
          await sleep(
            config.screenscraper.delayMs || 1500
          )

          const data =
            await downloadMedia(
              system,
              game,
              config.screenscraper.backgroundMedia ||
                'ss'
            )

          if (data) {
            if (source === 'network') {
              const remoteFile =
                path.posix.join(
                  remoteMediaPath(system),
                  `${base}-BG.png`
                )

              await sftp.put(
                data,
                remoteFile
              )

              send(
                `  BG enviada: ${remoteFile}`
              )
            } else {
              const localFile =
                path.join(
                  localMediaPath(system),
                  `${base}-BG.png`
                )

              fs.writeFileSync(
                localFile,
                data
              )

              send(
                `  BG: ${localFile}`
              )
            }
          } else {
            send(
              '  BG: não disponível'
            )
          }
        }
      } catch (error) {
        send(
          `  ERRO: ${error.message}`
        )
      }
    }

    send(
      '=== FINALIZADO ==='
    )
  } catch (error) {
    send(
      `ERRO FATAL: ${error.message}`
    )
  } finally {
    if (sftp) {
      try {
        await sftp.end()
      } catch {}
    }

    res.end()
  }
})

/*
|--------------------------------------------------------------------------
| FRONTEND
|--------------------------------------------------------------------------
*/

app.use(
  express.static(
    path.join(root, 'dist')
  )
)

/*
 * Express 5:
 * não usar app.get('*'), pois path-to-regexp
 * gera "Missing parameter name".
 */

app.use((req, res, next) => {
  if (
    req.method === 'GET' &&
    !req.path.startsWith('/api/')
  ) {
    const indexFile =
      path.join(
        root,
        'dist',
        'index.html'
      )

    if (fs.existsSync(indexFile)) {
      return res.sendFile(
        indexFile
      )
    }
  }

  next()
})

/*
|--------------------------------------------------------------------------
| SERVER
|--------------------------------------------------------------------------
*/

const PORT = 3001

app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `API: http://localhost:${PORT}`
    )

    console.log(
      `MiSTer: ${config.mister.host}:${config.mister.port}`
    )

    console.log(
      `Local games: ${selectedGamesBasePath || 'não selecionado'}`
    )

    console.log(
      `Remote base: ${config.mister.remoteBasePath}`
    )
  }
)