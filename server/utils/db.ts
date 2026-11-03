import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'

export const DATA_DIR = process.env.SENDSAFE_DATA_DIR || join(process.cwd(), '.data', 'sendsafe')

// Several accounts ("profiles") can live on one computer. Each has its own database, files and relay sign-up.
// The first account stays where it always was (DATA_DIR); extra ones live in DATA_DIR/profiles/<id>.
const profileStore = new AsyncLocalStorage<{ id: string }>()
export const currentProfile = () => profileStore.getStore()?.id ?? 'main'
export const runAsProfile = <T>(id: string, fn: () => T): T => profileStore.run({ id }, fn)
export const enterProfile = (id: string) => profileStore.enterWith({ id })
export const validProfileId = (id: string) => id === 'main' || /^[a-f0-9]{8}$/.test(id)
export const profileDir = (id: string) => (id === 'main' ? DATA_DIR : join(DATA_DIR, 'profiles', id))
export const filesDir = (id: string = currentProfile()) => join(profileDir(id), 'files')

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

const dbs = new Map<string, DatabaseSync>()

export function useDb(id: string = currentProfile()): DatabaseSync {
  let db = dbs.get(id)
  if (!db) {
    const dir = profileDir(id)
    mkdirSync(filesDir(id), { recursive: true, mode: 0o700 })
    // Renamed from safedrop.db when the app became SendSafe. Move the WAL files with it or recent writes are lost.
    if (existsSync(join(dir, 'safedrop.db')) && !existsSync(join(dir, 'sendsafe.db'))) {
      for (const ext of ['', '-wal', '-shm']) {
        if (existsSync(join(dir, `safedrop.db${ext}`))) renameSync(join(dir, `safedrop.db${ext}`), join(dir, `sendsafe.db${ext}`))
      }
    }
    db = new DatabaseSync(join(dir, 'sendsafe.db'))
    dbs.set(id, db)
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
    db.exec(SCHEMA)
    try { db.exec('ALTER TABLE links ADD COLUMN token_enc TEXT') } catch { /* already migrated */ }
    db.exec('CREATE INDEX IF NOT EXISTS files_link ON files(link_id); CREATE INDEX IF NOT EXISTS files_created ON files(created_at); CREATE INDEX IF NOT EXISTS sessions_exp ON sessions(expires_at)')
    for (const col of [
      "display_name TEXT NOT NULL DEFAULT ''",
      "email TEXT NOT NULL DEFAULT ''",
      'require_totp INTEGER NOT NULL DEFAULT 1',
      'session_hours INTEGER NOT NULL DEFAULT 12',
      'sharing_enabled INTEGER NOT NULL DEFAULT 1',
      'onboarded INTEGER NOT NULL DEFAULT 0',
      "relay_url TEXT NOT NULL DEFAULT ''",
      "relay_token TEXT NOT NULL DEFAULT ''"
    ]) {
      try { db.exec(`ALTER TABLE owner ADD COLUMN ${col}`) } catch { /* already migrated */ }
    }
    // Session length is kept in minutes now (was hours). Convert existing values once, when the column is first added.
    try {
      db.exec('ALTER TABLE owner ADD COLUMN session_minutes INTEGER NOT NULL DEFAULT 720')
      db.exec('UPDATE owner SET session_minutes = session_hours * 60')
    } catch { /* already migrated */ }
  }
  return db
}

/** Ids of every profile that has a database on disk. */
export function listProfileIds(): string[] {
  const ids: string[] = []
  if (existsSync(join(DATA_DIR, 'sendsafe.db')) || existsSync(join(DATA_DIR, 'safedrop.db'))) ids.push('main')
  const dir = join(DATA_DIR, 'profiles')
  if (existsSync(dir)) {
    for (const n of readdirSync(dir)) if (validProfileId(n) && existsSync(join(dir, n, 'sendsafe.db'))) ids.push(n)
  }
  return ids
}

/** Profiles that finished setup (a password exists), with the name shown on the login screen. */
export function listAccounts(): { id: string, name: string }[] {
  const out: { id: string, name: string }[] = []
  for (const id of listProfileIds()) {
    const row = useDb(id).prepare('SELECT display_name FROM owner WHERE id = 1 AND totp_enabled = 1').get() as { display_name: string } | undefined
    if (row) out.push({ id, name: row.display_name })
  }
  return out
}

/** Make a new, empty profile. Half-finished ones from earlier attempts are removed first. */
export function createProfile(): string {
  for (const id of listProfileIds()) {
    if (id === 'main') continue
    const has = useDb(id).prepare('SELECT 1 AS x FROM owner WHERE id = 1 AND totp_enabled = 1').get()
    if (!has) { try { dbs.get(id)?.close() } catch { /* ignore */ } dbs.delete(id); rmSync(profileDir(id), { recursive: true, force: true }) }
  }
  const id = randomBytes(4).toString('hex')
  useDb(id)
  return id
}
