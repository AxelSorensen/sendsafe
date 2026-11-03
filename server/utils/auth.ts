import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

const COOKIE = 'sd_session'

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/** Hash the client-derived auth secret (already a PBKDF2 output) with scrypt for storage. */
export function hashSecret(secret: string): string {
  const salt = randomBytes(16)
  const h = scryptSync(secret, salt, 64, { N: 16384, r: 8, p: 1 })
  return `${salt.toString('base64')}:${h.toString('base64')}`
}

export function verifySecret(secret: string, stored: string): boolean {
  const [saltB64, hashB64] = stored.split(':')
  if (!saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = scryptSync(secret, Buffer.from(saltB64, 'base64'), 64, { N: 16384, r: 8, p: 1 })
  return timingSafeEqual(expected, actual)
}

export function getOwner() {
  return useDb().prepare('SELECT * FROM owner WHERE id = 1').get() as OwnerRow | undefined
}

export interface OwnerRow {
  id: number
  auth_hash: string
  kdf_salt: string
  public_key: string
  wrapped_private_key: string
  wrap_iv: string
  totp_secret: string
  totp_enabled: number
  totp_last_step: number
  display_name: string
  email: string
  totp_confirmed: number
  unlock_totp: number
  autolock_minutes: number
  require_totp: number
  sharing_enabled: number
  onboarded: number
  relay_url: string
  relay_token: string
  session_hours: number
  session_minutes: number
  created_at: number
}

export function createSession(event: H3Event, verified: boolean): string {
  const db = useDb()
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())
  const sessionMs = (getOwner()?.session_minutes ?? 720) * 60_000
  const token = randomBytes(32).toString('base64url')
  db.prepare('INSERT INTO sessions (id_hash, verified, expires_at) VALUES (?, ?, ?)')
    .run(sha256(token), verified ? 1 : 0, Date.now() + sessionMs)
  setCookie(event, COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: !import.meta.dev && getRequestProtocol(event, { xForwardedProto: true }) === 'https',
    path: '/',
    maxAge: sessionMs / 1000
  })
  return token
}

export function getSession(event: H3Event): { verified: boolean, idHash: string } | null {
  const token = getCookie(event, COOKIE)
  if (!token) return null
  const row = useDb()
    .prepare('SELECT id_hash, verified, expires_at FROM sessions WHERE id_hash = ?')
    .get(sha256(token)) as { id_hash: string, verified: number, expires_at: number } | undefined
  if (!row || row.expires_at < Date.now()) return null
  return { verified: row.verified === 1, idHash: row.id_hash }
}

export function destroySessions(event: H3Event, all = false) {
  const s = getSession(event)
  if (all) useDb().prepare('DELETE FROM sessions').run()
  else if (s) useDb().prepare('DELETE FROM sessions WHERE id_hash = ?').run(s.idHash)
  deleteCookie(event, COOKIE, { path: '/' })
}

export function requireOwner(event: H3Event) {
  const s = getSession(event)
  if (!s || !s.verified) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return s
}

const hits = new Map<string, number[]>()

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter(t => now - t < windowMs)
  if (recent.length >= max) {
    hits.set(key, recent)
    throw createError({ statusCode: 429, statusMessage: 'Too many requests' })
  }
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 10000) hits.clear()
}

export function clientIp(event: H3Event): string {
  return getRequestIP(event, { xForwardedFor: process.env.SENDSAFE_TRUST_PROXY === '1' }) || 'unknown'
}
