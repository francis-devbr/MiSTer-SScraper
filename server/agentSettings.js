import fs from 'fs'
import crypto from 'crypto'
import path from 'path'

function readJson(file, fallback = {}) {
  if (!fs.existsSync(file)) {
    return fallback
  }

  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), {
    recursive: true
  })

  fs.writeFileSync(
    file,
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  )
}

function createToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function createAgentSettings({
  settingsFile,
  defaults
}) {
  let settings = readJson(settingsFile, {})

  if (!settings.agentToken) {
    settings.agentToken = createToken()
    writeJson(settingsFile, settings)
  }

  function getRaw() {
    return settings
  }

  function getPublic() {
    return {
      configured: Boolean(
        settings.screenscraper?.devid &&
        settings.screenscraper?.devpassword &&
        settings.screenscraper?.ssid &&
        settings.screenscraper?.sspassword
      ),
      gamesBasePath:
        settings.gamesBasePath ||
        defaults.games?.basePath ||
        '',
      screenscraper: {
        devid: settings.screenscraper?.devid || '',
        devpasswordConfigured: Boolean(
          settings.screenscraper?.devpassword
        ),
        ssid: settings.screenscraper?.ssid || '',
        sspasswordConfigured: Boolean(
          settings.screenscraper?.sspassword
        ),
        softname:
          settings.screenscraper?.softname ||
          defaults.screenscraper?.softname ||
          'MiSTerConsoleModeScraper',
        delayMs:
          settings.screenscraper?.delayMs ??
          defaults.screenscraper?.delayMs ??
          1500,
        boxartMedia:
          settings.screenscraper?.boxartMedia ||
          defaults.screenscraper?.boxartMedia ||
          'box-2D',
        backgroundMedia:
          settings.screenscraper?.backgroundMedia ||
          defaults.screenscraper?.backgroundMedia ||
          'ss',
        defaultRegion:
          settings.screenscraper?.defaultRegion ||
          defaults.screenscraper?.defaultRegion ||
          'us'
      },
      mister: {
        host:
          settings.mister?.host ||
          defaults.mister?.host ||
          '',
        port:
          settings.mister?.port ??
          defaults.mister?.port ??
          22,
        username:
          settings.mister?.username ||
          defaults.mister?.username ||
          'root',
        passwordConfigured: Boolean(
          settings.mister?.password
        ),
        remoteBasePath:
          settings.mister?.remoteBasePath ||
          defaults.mister?.remoteBasePath ||
          '/media/fat/games'
      }
    }
  }

  function effectiveConfig() {
    return {
      ...defaults,
      screenscraper: {
        ...(defaults.screenscraper || {}),
        ...(settings.screenscraper || {})
      },
      mister: {
        ...(defaults.mister || {}),
        ...(settings.mister || {})
      },
      artwork: {
        ...(defaults.artwork || {}),
        ...(settings.artwork || {})
      },
      games: {
        ...(defaults.games || {}),
        basePath:
          settings.gamesBasePath ||
          defaults.games?.basePath ||
          ''
      }
    }
  }

  function update(patch = {}) {
    const nextScreenscraper = {
      ...(settings.screenscraper || {}),
      ...(patch.screenscraper || {})
    }

    const nextMister = {
      ...(settings.mister || {}),
      ...(patch.mister || {})
    }

    // Password fields left blank mean "keep current value".
    if (!patch.screenscraper?.devpassword) {
      nextScreenscraper.devpassword =
        settings.screenscraper?.devpassword || ''
    }

    if (!patch.screenscraper?.sspassword) {
      nextScreenscraper.sspassword =
        settings.screenscraper?.sspassword || ''
    }

    if (!patch.mister?.password) {
      nextMister.password =
        settings.mister?.password || ''
    }

    settings = {
      ...settings,
      gamesBasePath:
        patch.gamesBasePath ??
        settings.gamesBasePath ??
        '',
      screenscraper: nextScreenscraper,
      mister: nextMister,
      artwork: {
        ...(settings.artwork || {}),
        ...(patch.artwork || {})
      }
    }

    writeJson(settingsFile, settings)
    return getPublic()
  }

  function validateToken(token) {
    const expected = Buffer.from(
      String(settings.agentToken || '')
    )
    const received = Buffer.from(
      String(token || '')
    )

    if (
      expected.length === 0 ||
      expected.length !== received.length
    ) {
      return false
    }

    return crypto.timingSafeEqual(
      expected,
      received
    )
  }

  return {
    getRaw,
    getPublic,
    effectiveConfig,
    update,
    validateToken,
    token: settings.agentToken
  }
}
