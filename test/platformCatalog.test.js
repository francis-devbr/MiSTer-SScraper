import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createPlatformCatalog } from '../server/platformCatalog.js'

test('detecta pasta usando id canônico e gera sugestões', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mister-platforms-'))
  const peasPath = path.join(dir, 'peas.json')
  const localPath = path.join(dir, 'peas_local.json')
  const idsPath = path.join(dir, 'ids.json')
  const gamesPath = path.join(dir, 'games')

  fs.mkdirSync(path.join(gamesPath, 'psx'), { recursive: true })
  fs.mkdirSync(path.join(gamesPath, 'SistemaNovo'))
  fs.writeFileSync(peasPath, JSON.stringify({
    psx: { aliases: ['playstation'], formats: ['*.cue'] }
  }))
  fs.writeFileSync(localPath, '{}')
  fs.writeFileSync(idsPath, JSON.stringify({ psx: { screenScraperId: 57 } }))

  const catalog = createPlatformCatalog({ peasPath, localPath, idsPath })
  const result = catalog.detectFolders(gamesPath)
  const psx = result.platforms.find(item => item.id === 'psx')

  assert.equal(psx.availableLocal, true)
  assert.equal(psx.detectedFolder, 'psx')
  assert.equal(psx.systemeid, 57)
  assert.deepEqual(result.suggestions.map(item => item.folder), ['SistemaNovo'])
})

test('aplica formatos adicionados no peas_local', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mister-overrides-'))
  const peasPath = path.join(dir, 'peas.json')
  const localPath = path.join(dir, 'peas_local.json')
  const idsPath = path.join(dir, 'ids.json')

  fs.writeFileSync(peasPath, JSON.stringify({
    psx: { aliases: [], formats: ['*.cue'] }
  }))
  fs.writeFileSync(localPath, JSON.stringify({
    psx: { formatsAdd: ['*.bin'] }
  }))
  fs.writeFileSync(idsPath, '{}')

  const catalog = createPlatformCatalog({ peasPath, localPath, idsPath })
  assert.deepEqual(catalog.get('psx').extensions.sort(), ['.bin', '.cue'])
})
