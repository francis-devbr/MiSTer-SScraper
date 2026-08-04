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
import { createGameCache } from './cache.js'
import { createAgentSettings } from './agentSettings.js'

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
const dataPath = path.join(__dirname, 'data')

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

const cacheFile = path.resolve(
  __dirname,
  config.cache?.file || 'data/cache.sqlite'
)

const gameCache = createGameCache({
  file: cacheFile,
  ttlDays: config.cache?.ttlDays || 30,
  enabled: config.cache?.enabled !== false
})

const agentSettings = createAgentSettings({
  settingsFile: settingsPath,
  defaults: config
})

function runtimeConfig() {
  return agentSettings.effectiveConfig()
}

let selectedGamesBasePath =
  runtimeConfig().games?.basePath ||
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

const allowedOrigins = new Set([
  ...(runtimeConfig().agent?.allowedOrigins || []),
  'http://localhost:5173',
  'http://127.0.0.1:5173'
])

app.use(cors({
  origin(origin, callback) {
    if (
      !origin ||
      allowedOrigins.has(origin) ||
      process.env.AGENT_ALLOW_ANY_ORIGIN === '1'
    ) {
      return callback(null, true)
    }

    return callback(
      new Error(`Origem não autorizada: ${origin}`)
    )
  }
}))

app.use(express.json({ limit: '1mb' }))

app.get('/api/agent/info', (req, res) => {
  res.json({
    name: 'MiSTer S-Scraper Local Agent',
    version: '5.0.0',
    online: true,
    configured:
      agentSettings.getPublic().configured
  })
})

app.use('/api', (req, res, next) => {
  if (req.path === '/agent/info') {
    return next()
  }

  const authorization =
    String(req.headers.authorization || '')

  const bearer = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : ''

  const queryToken =
    req.path === '/artwork'
      ? String(req.query.agentToken || '')
      : ''

  if (
    !agentSettings.validateToken(
      bearer || queryToken
    )
  ) {
    return res.status(401).json({
      error:
        'Token do agente ausente ou inválido.'
    })
  }

  next()
})

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
            runtimeConfig().mister.remoteBasePath,
            remoteFolder
          )
        : path.posix.join(
            runtimeConfig().mister.remoteBasePath,
            system.id
          ),
    remoteMediaPath:
      remoteFolder
        ? path.posix.join(
            runtimeConfig().mister.remoteBasePath,
            remoteFolder,
            'media'
          )
        : path.posix.join(
            runtimeConfig().mister.remoteBasePath,
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
    runtimeConfig().mister.remoteBasePath,
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
  const systemRoot = localGamesPath(system)
  const files = walk(systemRoot)

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
      const romDirectory = path.dirname(file)
      const mediaPath = path.join(
        romDirectory,
        'media'
      )
      const relativeDirectory =
        path.relative(
          systemRoot,
          romDirectory
        )

      return {
        name,
        path: file,
        base,
        directory: romDirectory,
        relativeDirectory:
          relativeDirectory === ''
            ? '.'
            : relativeDirectory,
        mediaPath,
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
  const systemRoot = remoteSystemPath(system)

  const extensions = normalizeExtensions(
    system.extensions
  )

  const result = []

  async function scanDirectory(directory) {
    const entries = await sftp.list(directory)

    for (const entry of entries) {
      const fullPath = path.posix.join(
        directory,
        entry.name
      )

      if (entry.type === 'd') {
        if (
          entry.name.toLowerCase() !== 'media'
        ) {
          await scanDirectory(fullPath)
        }

        continue
      }

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
      const mediaPath = path.posix.join(
        directory,
        'media'
      )

      let boxExists = false
      let backgroundExists = false

      try {
        boxExists = Boolean(
          await sftp.exists(
            path.posix.join(
              mediaPath,
              `${base}.png`
            )
          )
        )
      } catch {
        boxExists = false
      }

      try {
        backgroundExists = Boolean(
          await sftp.exists(
            path.posix.join(
              mediaPath,
              `${base}-BG.png`
            )
          )
        )
      } catch {
        backgroundExists = false
      }

      const relativeDirectory =
        path.posix.relative(
          systemRoot,
          directory
        )

      result.push({
        name: entry.name,
        path: fullPath,
        base,
        directory,
        relativeDirectory:
          relativeDirectory === ''
            ? '.'
            : relativeDirectory,
        mediaPath,
        boxExists,
        backgroundExists,
        size: entry.size
      })
    }
  }

  await scanDirectory(systemRoot)

  return result.sort((a, b) =>
    a.path.localeCompare(b.path)
  )
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
        host: runtimeConfig().mister.host,
        port: Number(runtimeConfig().mister.port || 22),
        username: runtimeConfig().mister.username,
        password: runtimeConfig().mister.password
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
  const ss = runtimeConfig().screenscraper

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
  hashes,
  send = null
) {
  const cacheKey = [
    system.systemeid,
    hashes.size,
    hashes.md5,
    hashes.sha1
  ].join(':')

  if (config.scraping?.skipCachedSearches !== false) {
    const cached = gameCache.get(cacheKey)

    if (cached) {
      send?.('  CACHE: resultado reutilizado')
      return cached
    }
  }

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
  const responseText = await response.text()

  if (response.status === 429) {
    throw new Error(
      'ScreenScraper HTTP 429: limite atingido.'
    )
  }

  if (!response.ok) {
    throw new Error(
      `ScreenScraper HTTP ${response.status}: ${responseText}`
    )
  }

  let json

  try {
    json = JSON.parse(responseText)
  } catch {
    throw new Error(
      `Resposta inválida da ScreenScraper: ${responseText.slice(0, 300)}`
    )
  }

  const game = json?.response?.jeu ?? null

  gameCache.set(cacheKey, {
    systemId: system.systemeid,
    romName,
    payload: game
  })

  return game
}

function mediaEntriesFromGame(game) {
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

function mediaTypeOf(entry) {
  return String(
    entry?.type ??
    entry?.["@_type"] ??
    entry?.mediatype ??
    ''
  ).trim()
}

function mediaRegionOf(entry) {
  return String(
    entry?.region ??
    entry?.["@_region"] ??
    ''
  ).trim().toLowerCase()
}

function unique(values) {
  return [
    ...new Set(
      values.filter(Boolean)
    )
  ]
}

function mediaCandidates(
  game,
  mediaName
) {
  const requested =
    String(mediaName || '').trim()

  const regionMatch =
    requested.match(
      /^(.*)\(([^)]+)\)$/
    )

  const baseMedia =
    regionMatch
      ? regionMatch[1]
      : requested

  const explicitRegion =
    regionMatch
      ? regionMatch[2].toLowerCase()
      : ''

  const ss =
    runtimeConfig().screenscraper

  const configuredRegions = unique([
    explicitRegion,
    ss.defaultRegion,
    ...(ss.regionFallbackOrder || []),
    'us',
    'wor',
    'eu',
    'br',
    'jp',
    'au',
    'kr',
    'ss'
  ].map(value =>
    String(value || '')
      .trim()
      .toLowerCase()
  ))

  const availableRegions =
    mediaEntriesFromGame(game)
      .filter(entry =>
        mediaTypeOf(entry)
          .toLowerCase() ===
        baseMedia.toLowerCase()
      )
      .map(mediaRegionOf)

  /*
   * Prioridade:
   * 1. Regiões realmente presentes no retorno do jogo,
   *    ordenadas conforme a preferência configurada.
   * 2. Demais regiões presentes no retorno.
   * 3. Regiões de fallback conhecidas.
   * 4. Tipo sem região, para jogos onde a API decide sozinha.
   */
  const orderedAvailable = [
    ...configuredRegions.filter(region =>
      availableRegions.includes(region)
    ),
    ...availableRegions.filter(region =>
      !configuredRegions.includes(region)
    )
  ]

  return unique([
    ...orderedAvailable.map(region =>
      `${baseMedia}(${region})`
    ),
    ...configuredRegions.map(region =>
      `${baseMedia}(${region})`
    ),
    requested,
    baseMedia
  ])
}

async function downloadMedia(
  system,
  game,
  mediaName,
  send = null
) {
  if (!game?.id) {
    return null
  }

  const candidates =
    mediaCandidates(
      game,
      mediaName
    )

  for (const candidate of candidates) {
    const url =
      `https://api.screenscraper.fr/api2/mediaJeu.php?` +
      baseParams() +
      `&systemeid=${enc(system.systemeid)}` +
      `&jeuid=${enc(game.id)}` +
      `&media=${enc(candidate)}` +
      `&outputformat=png`

    send?.(
      `  Tentando mídia: ${candidate}`
    )

    const response = await fetch(url)

    if (response.status === 429) {
      throw new Error(
        'ScreenScraper HTTP 429: limite atingido.'
      )
    }

    /*
     * Uma região inexistente pode retornar 400/404.
     * Não encerramos o jogo: tentamos a próxima candidata.
     */
    if (!response.ok) {
      continue
    }

    const buffer = Buffer.from(
      await response.arrayBuffer()
    )

    if (buffer.length < 8) {
      continue
    }

    const png =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47

    const jpg =
      buffer[0] === 0xff &&
      buffer[1] === 0xd8

    if (png || jpg) {
      send?.(
        `  Mídia encontrada: ${candidate}`
      )

      return buffer
    }
  }

  return null
}

function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  )
}

/*
|--------------------------------------------------------------------------
| CONFIGURAÇÕES LOCAIS DO AGENTE
|--------------------------------------------------------------------------
*/

app.get('/api/settings', (req, res) => {
  res.json({
    settings: agentSettings.getPublic()
  })
})

app.put('/api/settings', (req, res) => {
  try {
    const settings =
      agentSettings.update(req.body || {})

    selectedGamesBasePath =
      settings.gamesBasePath || ''

    refreshDetectedPlatforms()
    resetRemoteDetection()

    return res.json({
      success: true,
      settings
    })
  } catch (error) {
    return res.status(400).json({
      error: error.message
    })
  }
})

app.post('/api/settings/test-screenscraper', async (req, res) => {
  try {
    const ss = runtimeConfig().screenscraper

    if (
      !ss?.devid ||
      !ss?.devpassword ||
      !ss?.ssid ||
      !ss?.sspassword
    ) {
      return res.status(400).json({
        error:
          'Preencha todas as credenciais do ScreenScraper.'
      })
    }

    const params = new URLSearchParams({
      devid: ss.devid,
      devpassword: ss.devpassword,
      softname:
        ss.softname ||
        'MiSTerConsoleModeScraper',
      ssid: ss.ssid,
      sspassword: ss.sspassword,
      output: 'json'
    })

    const response = await fetch(
      `https://api.screenscraper.fr/api2/ssuserInfos.php?${params}`
    )

    const text = await response.text()

    if (!response.ok) {
      throw new Error(
        `ScreenScraper HTTP ${response.status}: ${text.slice(0, 200)}`
      )
    }

    if (/Erreur de login/i.test(text)) {
      throw new Error(
        'ScreenScraper rejeitou as credenciais.'
      )
    }

    return res.json({
      success: true,
      message:
        'Credenciais ScreenScraper validadas.'
    })
  } catch (error) {
    return res.status(400).json({
      error: error.message
    })
  }
})

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

app.get('/api/config', (req, res) => {
  const publicSettings =
    agentSettings.getPublic()

  res.json({
    games: {
      basePath: selectedGamesBasePath
    },

    systems:
      detectedPlatforms.map(systemView),

    suggestions: {
      local: localFolderSuggestions,
      remote: remoteFolderSuggestions
    },

    mister: {
      ...publicSettings.mister,
      scanCompleted: remoteScanCompleted
    },

    screenscraper:
      publicSettings.screenscraper,

    agent: {
      version: '5.0.0'
    }
  })
})

/*
|--------------------------------------------------------------------------
| CACHE
|--------------------------------------------------------------------------
*/

app.get('/api/cache/stats', (req, res) => {
  res.json(gameCache.stats())
})

app.delete('/api/cache', (req, res) => {
  gameCache.clear()
  res.json({ success: true, ...gameCache.stats() })
})

/*
|--------------------------------------------------------------------------
| PREVIEW DE ARTWORK
|--------------------------------------------------------------------------
*/

app.get('/api/artwork', async (req, res) => {
  const system = systemByName(req.query.system)
  const source = req.query.source === 'network' ? 'network' : 'local'
  const type = req.query.type === 'background' ? 'background' : 'box'
  const romPath = String(req.query.romPath || '')

  if (!system || !romPath) {
    return res.status(400).json({ error: 'Sistema ou ROM não informado.' })
  }

  const base = strip(
    source === 'network'
      ? path.posix.basename(romPath)
      : path.basename(romPath)
  )

  const fileName = type === 'background'
    ? `${base}-BG.png`
    : `${base}.png`

  try {
    if (source === 'local') {
      const systemRoot =
        path.resolve(localGamesPath(system))

      const absoluteRomPath =
        path.resolve(romPath)

      if (
        absoluteRomPath !== systemRoot &&
        !absoluteRomPath.startsWith(
          systemRoot + path.sep
        )
      ) {
        return res.status(400).json({
          error: 'Caminho da ROM fora do sistema.'
        })
      }

      const mediaRoot = path.resolve(
        path.dirname(absoluteRomPath),
        'media'
      )

      const file = path.resolve(
        mediaRoot,
        fileName
      )

      if (
        file !== mediaRoot &&
        !file.startsWith(mediaRoot + path.sep)
      ) {
        return res.status(400).json({
          error: 'Caminho de artwork inválido.'
        })
      }

      if (!fs.existsSync(file)) {
        return res.status(404).end()
      }

      return res.sendFile(file)
    }

    if (!remoteScanCompleted) {
      await scanRemotePlatforms()
    }

    const systemRoot =
      remoteSystemPath(system)

    const normalizedRomPath =
      path.posix.normalize(romPath)

    if (
      normalizedRomPath !== systemRoot &&
      !normalizedRomPath.startsWith(
        `${systemRoot}/`
      )
    ) {
      return res.status(400).json({
        error: 'Caminho remoto fora do sistema.'
      })
    }

    const remoteFile = path.posix.join(
      path.posix.dirname(normalizedRomPath),
      'media',
      fileName
    )

    const connection = createSftp()

    try {
      await connection.connect()
      const exists = await connection.sftp.exists(remoteFile)

      if (!exists) {
        return res.status(404).end()
      }

      const data = await connection.sftp.get(remoteFile)
      res.type('png')
      return res.send(data)
    } finally {
      try { await connection.sftp.end() } catch {}
    }
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
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

    agentSettings.update({ gamesBasePath: selectedGamesBasePath })

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

  agentSettings.update({ gamesBasePath: selectedGamesBasePath })

  refreshDetectedPlatforms()

  return res.json({
    games: {
      basePath: selectedGamesBasePath
    },

    cache: gameCache.stats(),
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
      runtimeConfig().mister.remoteBasePath
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
        runtimeConfig().mister.remoteBasePath
      )

    await sftp.end()

    res.json({
      success: true,
      message: 'Conexão SFTP realizada com sucesso.',
      remoteBasePath:
        runtimeConfig().mister.remoteBasePath,
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
            `Pasta remota da plataforma não encontrada em ${runtimeConfig().mister.remoteBasePath}.`
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

  let clientAborted = false

  req.on('aborted', () => {
    clientAborted = true
  })

  res.on('close', () => {
    if (!res.writableEnded) {
      clientAborted = true
    }
  })

  const send = payload => {
    if (
      clientAborted ||
      res.writableEnded ||
      res.destroyed
    ) {
      return false
    }

    const event =
      typeof payload === 'string'
        ? { type: 'log', message: payload }
        : payload

    try {
      res.write(
        `${JSON.stringify(event)}\n`
      )
      return true
    } catch {
      clientAborted = true
      return false
    }
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

      roms =
        romsForLocal(system)

      send(
        `ROMs encontradas: ${roms.length}`
      )

      send(
        `ROMs: ${localGamesPath(system)}`
      )

      send(
        'Media: criada em cada diretório que contém ROMs'
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
          `Pasta remota da plataforma não encontrada em ${runtimeConfig().mister.remoteBasePath}.`
        )
      }

      system.detectedRemoteFolder =
        remoteSystem.detectedFolder

      send(
        `Conectando ao MiSTer ${runtimeConfig().mister.host}...`
      )

      const connection =
        createSftp()

      await connection.connect()

      sftp =
        connection.sftp

      const remotePath =
        remoteSystemPath(system)

      send(
        `ROMs: ${remotePath}`
      )

      send(
        'Media: criada em cada diretório remoto que contém ROMs'
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

      roms =
        await listRemoteFiles(
          sftp,
          system
        )

      send(
        `ROMs encontradas: ${roms.length}`
      )
    }

    send({
      type: 'progress',
      current: 0,
      total: roms.length,
      remaining: roms.length,
      percent: 0
    })

    for (
      let i = 0;
      i < roms.length;
      i++
    ) {
      if (clientAborted) {
        break
      }
      const rom =
        roms[i]

      send({
        type: 'progress',
        current: i,
        total: roms.length,
        remaining: roms.length - i,
        percent:
          roms.length > 0
            ? Math.round((i / roms.length) * 100)
            : 0,
        rom: rom.name,
        romPath: rom.path,
        relativeDirectory:
          rom.relativeDirectory || '.',
        boxExists: Boolean(rom.boxExists),
        backgroundExists:
          Boolean(rom.backgroundExists)
      })

      const base =
        strip(rom.name)

      send(
        `[${i + 1}/${roms.length}] ${
          rom.relativeDirectory &&
          rom.relativeDirectory !== '.'
            ? `${rom.relativeDirectory}/`
            : ''
        }${rom.name}`
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

        send({
          type: 'progress',
          current: i + 1,
          total: roms.length,
          remaining: roms.length - (i + 1),
          percent:
            roms.length > 0
              ? Math.round(((i + 1) / roms.length) * 100)
              : 100
        })

        continue
      }

      if (dryRun) {
        send(
          '  DRY-RUN: não consultando API'
        )

        send({
          type: 'progress',
          current: i + 1,
          total: roms.length,
          remaining: roms.length - (i + 1),
          percent:
            roms.length > 0
              ? Math.round(((i + 1) / roms.length) * 100)
              : 100
        })

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
            hashes,
            send
          )

        if (!game) {
          send(
            '  NÃO ENCONTRADO'
          )

          send({
          type: 'progress',
          current: i + 1,
          total: roms.length,
          remaining: roms.length - (i + 1),
          percent:
            roms.length > 0
              ? Math.round(((i + 1) / roms.length) * 100)
              : 100
        })

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
            runtimeConfig().screenscraper.delayMs || 1500
          )

          const data =
            await downloadMedia(
              system,
              game,
              runtimeConfig().screenscraper.boxartMedia ||
                'box-2D',
              send
            )

          if (data) {
            if (source === 'network') {
              await sftp.mkdir(
                rom.mediaPath,
                true
              )

              const remoteFile =
                path.posix.join(
                  rom.mediaPath,
                  `${base}.png`
                )

              await sftp.put(
                data,
                remoteFile
              )

              send(
                `  BOX enviada: ${remoteFile}`
              )

              send({
                type: 'artwork',
                artworkType: 'box',
                rom: rom.name,
                romPath: rom.path,
                filePath: remoteFile
              })
            } else {
              fs.mkdirSync(
                rom.mediaPath,
                {
                  recursive: true
                }
              )

              const localFile =
                path.join(
                  rom.mediaPath,
                  `${base}.png`
                )

              fs.writeFileSync(
                localFile,
                data
              )

              send(
                `  BOX: ${localFile}`
              )

              send({
                type: 'artwork',
                artworkType: 'box',
                rom: rom.name,
                romPath: rom.path,
                filePath: localFile
              })
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
            runtimeConfig().screenscraper.delayMs || 1500
          )

          const data =
            await downloadMedia(
              system,
              game,
              runtimeConfig().screenscraper.backgroundMedia ||
                'ss',
              send
            )

          if (data) {
            if (source === 'network') {
              await sftp.mkdir(
                rom.mediaPath,
                true
              )

              const remoteFile =
                path.posix.join(
                  rom.mediaPath,
                  `${base}-BG.png`
                )

              await sftp.put(
                data,
                remoteFile
              )

              send(
                `  BG enviada: ${remoteFile}`
              )

              send({
                type: 'artwork',
                artworkType: 'background',
                rom: rom.name,
                romPath: rom.path,
                filePath: remoteFile
              })
            } else {
              fs.mkdirSync(
                rom.mediaPath,
                {
                  recursive: true
                }
              )

              const localFile =
                path.join(
                  rom.mediaPath,
                  `${base}-BG.png`
                )

              fs.writeFileSync(
                localFile,
                data
              )

              send(
                `  BG: ${localFile}`
              )

              send({
                type: 'artwork',
                artworkType: 'background',
                rom: rom.name,
                romPath: rom.path,
                filePath: localFile
              })
            }
          } else {
            send(
              '  BG: não disponível'
            )
          }
        }
      } catch (error) {
        if (!clientAborted) {
          send(
            `  ERRO: ${error.message}`
          )
        }
      }

      send({
        type: 'progress',
        current: i + 1,
        total: roms.length,
        remaining: roms.length - (i + 1),
        percent:
          roms.length > 0
            ? Math.round(((i + 1) / roms.length) * 100)
            : 100
      })
    }

    if (!clientAborted) {
      send({
        type: 'complete',
        current: roms.length,
        total: roms.length,
        remaining: 0,
        percent: 100,
        message: '=== FINALIZADO ==='
      })
    }
  } catch (error) {
    if (!clientAborted) {
      send({
        type: 'error',
        message: `ERRO FATAL: ${error.message}`
      })
    }
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

const PORT =
  Number(
    process.env.AGENT_PORT ||
    runtimeConfig().agent?.port ||
    3001
  )

const HOST =
  process.env.AGENT_HOST ||
  runtimeConfig().agent?.host ||
  '127.0.0.1'

app.listen(
  PORT,
  HOST,
  () => {
    console.log(
      `Agente local: http://${HOST}:${PORT}`
    )

    console.log(
      `Token do agente: ${agentSettings.token}`
    )

    console.log(
      'Guarde este token no navegador. Não publique nem compartilhe.'
    )

    console.log(
      `MiSTer: ${
        runtimeConfig().mister?.host ||
        'não configurado'
      }`
    )

    console.log(
      `Local games: ${
        selectedGamesBasePath ||
        'não selecionado'
      }`
    )
  }
)