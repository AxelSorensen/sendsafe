export interface LinkRow {
  id: string
  label: string
  expires_at: number
  max_files: number
  max_bytes: number
  revoked: number
}

export function findActiveLink(token: string): LinkRow | undefined {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined
  const link = useDb().prepare('SELECT * FROM links WHERE token_hash = ?').get(sha256(token)) as LinkRow | undefined
  if (!link || link.revoked || link.expires_at < Date.now()) return undefined
  return link
}
