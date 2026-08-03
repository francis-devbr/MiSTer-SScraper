import fs from 'fs'
import path from 'path'

function readJson(file, fallback) {
  if (!fs.existsSync(file)) {
    return fallback
  }

  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`JSON inválido em ${file}: ${error.message}`)
  }
}

function unique(values) {
  return [...new Set(
    (values || [])
      .map(value => String(value).trim())
      .filter(Boolean)
  )]
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}

function mergeList(defaults, override, additions, removals) {
  const base = Array.isArray(override)
    ? override
    : defaults || []

  const removed = new Set(
    (removals || []).map(normalize)
  )

  return unique([
    ...base,
    ...(additions || [])
  ]).filter(value => !removed.has(normalize(value)))
}

function normalizeFormats(formats) {
  return unique(formats).map(format => {
    const value = format.toLowerCase()

    if (value.startsWith('*.')) {
      return value.slice(1)
    }

    if (value.startsWith('.')) {
      return value
    }

    return `.${value.replace(/^\*/, '')}`
  })
}

function mergePlatform(id, defaults, override, ids) {
  const merged = {
    ...defaults,
    ...override
  }

  merged.id = id
  merged.name = override.displayName || defaults.displayName || id
  merged.aliases = mergeList(
    defaults.aliases,
    override.aliases,
    override.aliasesAdd,
    override.aliasesRemove
  )
  merged.folders = mergeList(
    [id, ...(defaults.folders || [])],
    override.folders,
    override.foldersAdd,
    override.foldersRemove
  )
  merged.formats = mergeList(
    defaults.formats,
    override.formats,
    override.formatsAdd,
    override.formatsRemove
  )
  merged.extensions = normalizeFormats(merged.formats)
  merged.retroarchDbName =
    merged.retroarch_dbname ||
    merged.retroarchDbName ||
    null

  const platformIds = ids[id] || {}

  merged.systemeid =
    override.systemeid ??
    override.screenScraperId ??
    platformIds.screenScraperId ??
    null

  merged.mobyId =
    override.mobyId ??
    platformIds.mobyId ??
    null

  merged.tgdbId =
    override.tgdbId ??
    platformIds.tgdbId ??
    null

  return merged
}

export function createPlatformCatalog({
  peasPath,
  localPath,
  idsPath
}) {
  let defaults = {}
  let overrides = {}
  let ids = {}
  let resolved = {}

  function reload() {
    defaults = readJson(peasPath, {})
    overrides = readJson(localPath, {})
    ids = readJson(idsPath, {})

    const keys = unique([
      ...Object.keys(defaults),
      ...Object.keys(overrides),
      ...Object.keys(ids)
    ])

    resolved = Object.fromEntries(
      keys.map(id => [
        id,
        mergePlatform(
          id,
          defaults[id] || {
            aliases: [],
            formats: []
          },
          overrides[id] || {},
          ids
        )
      ])
    )

    return resolved
  }

  function list() {
    return Object.values(resolved)
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  function get(id) {
    return resolved[String(id || '').toLowerCase()] || null
  }

  function saveOverrides() {
    fs.writeFileSync(
      localPath,
      `${JSON.stringify(overrides, null, 2)}\n`,
      'utf8'
    )
  }

  function update(id, patch) {
    const key = String(id || '').toLowerCase()

    if (!key) {
      throw new Error('ID da plataforma não informado.')
    }

    overrides[key] = {
      ...(overrides[key] || {}),
      ...patch
    }

    saveOverrides()
    reload()

    return get(key)
  }

  function removeOverride(id) {
    const key = String(id || '').toLowerCase()
    delete overrides[key]
    saveOverrides()
    reload()
    return get(key)
  }

  function detectFolderNames(folderNames, availabilityField) {
    const platforms = list().map(platform => ({
      ...platform,
      detectedFolder: null,
      matchType: null,
      [availabilityField]: false
    }))

    const folders = unique(folderNames)
    const folderMap = new Map(
      folders.map(folder => [
        normalize(folder),
        folder
      ])
    )

    const usedFolders = new Set()

    // 1. Chave canônica e folders explícitos.
    for (const platform of platforms) {
      const candidates = unique([
        platform.id,
        ...(platform.folders || [])
      ])

      for (const candidate of candidates) {
        const actual = folderMap.get(normalize(candidate))

        if (actual && !usedFolders.has(actual)) {
          platform.detectedFolder = actual
          platform.matchType =
            normalize(candidate) === normalize(platform.id)
              ? 'id'
              : 'folder'
          platform[availabilityField] = true
          usedFolders.add(actual)
          break
        }
      }
    }

    // 2. Alias apenas quando pertence a uma única plataforma.
    const aliasOwners = new Map()

    for (const platform of platforms) {
      for (const alias of platform.aliases || []) {
        const key = normalize(alias)

        if (!key) {
          continue
        }

        const owners = aliasOwners.get(key) || []
        owners.push(platform.id)
        aliasOwners.set(key, owners)
      }
    }

    for (const platform of platforms) {
      if (platform[availabilityField]) {
        continue
      }

      for (const alias of platform.aliases || []) {
        const normalizedAlias = normalize(alias)
        const owners = aliasOwners.get(normalizedAlias) || []

        if (owners.length !== 1) {
          continue
        }

        const actual = folderMap.get(normalizedAlias)

        if (actual && !usedFolders.has(actual)) {
          platform.detectedFolder = actual
          platform.matchType = 'alias'
          platform[availabilityField] = true
          usedFolders.add(actual)
          break
        }
      }
    }

    const suggestions = folders
      .filter(folder => !usedFolders.has(folder))
      .map(folder => ({
        folder,
        suggestedId:
          normalize(folder) || 'nova-plataforma',
        reason:
          'Pasta existente, mas sem correspondência em peas.json ou peas_local.json.'
      }))
      .sort((a, b) =>
        a.folder.localeCompare(b.folder)
      )

    return {
      platforms,
      suggestions
    }
  }

  function detectFolders(basePath) {
    if (
      !basePath ||
      !fs.existsSync(basePath) ||
      !fs.statSync(basePath).isDirectory()
    ) {
      return detectFolderNames(
        [],
        'availableLocal'
      )
    }

    const folders = fs.readdirSync(basePath, {
      withFileTypes: true
    })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)

    return detectFolderNames(
      folders,
      'availableLocal'
    )
  }

  function detectRemoteFolders(folderNames) {
    return detectFolderNames(
      folderNames,
      'availableRemote'
    )
  }

  reload()

  return {
    reload,
    list,
    get,
    update,
    removeOverride,
    detectFolders,
    detectRemoteFolders,
    normalize
  }
}
