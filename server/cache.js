import fs from 'fs'
import path from 'path'
import { DatabaseSync } from 'node:sqlite'

export function createGameCache({ file, ttlDays = 30, enabled = true }) {
  if (!enabled) {
    return {
      get: () => null,
      set: () => {},
      clear: () => {},
      stats: () => ({ enabled: false, entries: 0, file })
    }
  }

  fs.mkdirSync(path.dirname(file), { recursive: true })

  const db = new DatabaseSync(file)
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_cache (
      cache_key TEXT PRIMARY KEY,
      system_id TEXT NOT NULL,
      rom_name TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_hit_at INTEGER NOT NULL,
      hits INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_game_cache_created_at
      ON game_cache(created_at);
  `)

  const selectStmt = db.prepare(`
    SELECT payload, created_at
    FROM game_cache
    WHERE cache_key = ?
  `)

  const hitStmt = db.prepare(`
    UPDATE game_cache
    SET hits = hits + 1, last_hit_at = ?
    WHERE cache_key = ?
  `)

  const upsertStmt = db.prepare(`
    INSERT INTO game_cache (
      cache_key, system_id, rom_name, payload,
      created_at, last_hit_at, hits
    ) VALUES (?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(cache_key) DO UPDATE SET
      system_id = excluded.system_id,
      rom_name = excluded.rom_name,
      payload = excluded.payload,
      created_at = excluded.created_at,
      last_hit_at = excluded.last_hit_at
  `)

  const maxAgeMs = Math.max(1, Number(ttlDays) || 30) * 86400000

  function get(key) {
    const row = selectStmt.get(key)
    if (!row) return null

    if (Date.now() - Number(row.created_at) > maxAgeMs) {
      db.prepare('DELETE FROM game_cache WHERE cache_key = ?').run(key)
      return null
    }

    hitStmt.run(Date.now(), key)

    try {
      return JSON.parse(row.payload)
    } catch {
      db.prepare('DELETE FROM game_cache WHERE cache_key = ?').run(key)
      return null
    }
  }

  function set(key, { systemId, romName, payload }) {
    const now = Date.now()
    upsertStmt.run(
      key,
      String(systemId),
      String(romName),
      JSON.stringify(payload),
      now,
      now
    )
  }

  function clear() {
    db.exec('DELETE FROM game_cache')
  }

  function stats() {
    const row = db.prepare(`
      SELECT
        COUNT(*) AS entries,
        COALESCE(SUM(hits), 0) AS hits,
        MIN(created_at) AS oldest,
        MAX(created_at) AS newest
      FROM game_cache
    `).get()

    return {
      enabled: true,
      file,
      ttlDays: Math.round(maxAgeMs / 86400000),
      entries: Number(row.entries || 0),
      hits: Number(row.hits || 0),
      oldest: row.oldest || null,
      newest: row.newest || null
    }
  }

  return { get, set, clear, stats }
}
