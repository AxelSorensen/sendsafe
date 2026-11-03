import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

export const DATA_DIR = process.env.SENDSAFE_DATA_DIR || join(process.cwd(), '.data', 'sendsafe')
export const FILES_DIR = join(DATA_DIR, 'files')

const SCHEMA = `
CREATE TABLE IF NOT EXISTS owner (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  auth_hash TEXT NOT NULL,
  kdf_salt TEXT NOT NULL,
  public_key TEXT NOT NULL,
  wrapped_private_key TEXT NOT NULL,
  wrap_iv TEXT NOT NULL,
  totp_secret TEXT NOT NULL,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  totp_last_step INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  verified INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  max_files INTEGER NOT NULL,
  max_bytes INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL REFERENCES links(id),
  enc TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
`

let db: DatabaseSync | undefined

export function useDb(): DatabaseSync {
  if (!db) {
    mkdirSync(FILES_DIR, { recursive: true, mode: 0o700 })
    // Renamed from safedrop.db when the app became SendSafe. Move the WAL files with it or recent writes are lost.
    if (existsSync(join(DATA_DIR, 'safedrop.db')) && !existsSync(join(DATA_DIR, 'sendsafe.db'))) {
      for (const ext of ['', '-wal', '-shm']) {
        if (existsSync(join(DATA_DIR, `safedrop.db${ext}`))) renameSync(join(DATA_DIR, `safedrop.db${ext}`), join(DATA_DIR, `sendsafe.db${ext}`))
      }
    }
    db = new DatabaseSync(join(DATA_DIR, 'sendsafe.db'))
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
    db.exec(SCHEMA)
    try { db.exec('ALTER TABLE links ADD COLUMN token_enc TEXT') } catch { /* already migrated */ }
    db.exec('CREATE INDEX IF NOT EXISTS files_link ON files(link_id); CREATE INDEX IF NOT EXISTS files_created ON files(created_at); CREATE INDEX IF NOT EXISTS sessions_exp ON sessions(expires_at)')
    for (const col of [
      "display_name TEXT NOT NULL DEFAULT ''",
      'require_totp INTEGER NOT NULL DEFAULT 1',
      'session_hours INTEGER NOT NULL DEFAULT 12',
      'sharing_enabled INTEGER NOT NULL DEFAULT 1',
      'onboarded INTEGER NOT NULL DEFAULT 0',
      "relay_url TEXT NOT NULL DEFAULT ''",
      "relay_token TEXT NOT NULL DEFAULT ''"
    ]) {
      try { db.exec(`ALTER TABLE owner ADD COLUMN ${col}`) } catch { /* already migrated */ }
    }
  }
  return db
}
