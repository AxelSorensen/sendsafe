-- Multi-user relay: every link and file belongs to one owner who registered themselves.
CREATE TABLE IF NOT EXISTS owners (
  id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  public_key TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
ALTER TABLE links ADD COLUMN owner_id TEXT NOT NULL DEFAULT '';
ALTER TABLE files ADD COLUMN owner_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS links_owner ON links(owner_id);
CREATE INDEX IF NOT EXISTS files_owner ON files(owner_id);
CREATE INDEX IF NOT EXISTS owners_created ON owners(created_at);
-- Data from the old single-owner relay has no owner; drop it (the app re-syncs under its new identity).
DELETE FROM links WHERE owner_id = '';
DELETE FROM files WHERE owner_id = '';
DELETE FROM meta;
