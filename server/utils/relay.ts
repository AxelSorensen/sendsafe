import { createWriteStream, existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeWebStream } from 'node:stream/web'

// Client for the hosted SendSafe relay. The relay holds encrypted uploads only until this app pulls them.
// On first run the app registers itself (open sign-up) and keeps its own secret; nothing is typed in.
// A WebSocket tells us the moment a file arrives, so there is no constant polling.

interface PS { ok: boolean, error: string, syncedAt: number, lastSig: string, pulling: boolean, lastPull: number, ws: WebSocket | null, wsOpen: boolean, wsKey: string, wsRetryAt: number, wsFails: number, wsLastMsg: number }
const states = new Map<string, PS>()
// Every account on this computer has its own relay connection and state.
const S = (): PS => {
  const id = currentProfile()
  let st = states.get(id)
  if (!st) {
    st = { ok: false, error: '', syncedAt: 0, lastSig: '', pulling: false, lastPull: 0, ws: null, wsOpen: false, wsKey: '', wsRetryAt: 0, wsFails: 0, wsLastMsg: 0 }
    states.set(id, st)
  }
  return st
}
export const relayState = new Proxy({} as { ok: boolean, error: string, syncedAt: number }, {
  get: (_, k) => (S() as any)[k],
  set: (_, k, v) => { (S() as any)[k] = v; return true }
})

/** True when the relay address is built into the app (env), so users never enter anything. */
export const relayManaged = () => !!process.env.SENDSAFE_RELAY_URL

const clean = (u: string) => u.replace(/\/+$/, '')

export const relayUrl = () => {
  if (process.env.SENDSAFE_RELAY_URL) return clean(process.env.SENDSAFE_RELAY_URL)
  const o = getOwner()
  return o?.relay_url ? clean(o.relay_url) : ''
}

/** Non-null while a relay is configured (registered or not yet). */
export const relayCreds = () => {
  const url = relayUrl()
  return url ? { url, token: getOwner()?.relay_token ?? '' } : null
}

type Creds = { url: string, token: string }

async function call(c: Creds, path: string, init: RequestInit = {}) {
  return fetch(c.url + path, {
    ...init,
    headers: { authorization: `Bearer ${c.token}`, ...(init.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(60_000)
  })
}

export async function relayPing(url: string) {
  const r = await fetch(clean(url) + '/ping', { signal: AbortSignal.timeout(10_000) })
  return r.ok && (await r.json() as { sendsafe?: boolean }).sendsafe === true
}

/** Sign up with the relay once; the secret stays on this computer. */
async function ensureRegistered(url: string): Promise<Creds> {
  const o = getOwner()!
  if (o.relay_token && clean(o.relay_url) === url) return { url, token: o.relay_token }
  const r = await fetch(url + '/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ publicKey: o.public_key }),
    signal: AbortSignal.timeout(30_000)
  })
  if (!r.ok) throw new Error(r.status === 429 ? 'The relay is busy. Retrying shortly.' : `Could not sign up with the relay (${r.status}).`)
  const { ownerId, secret } = await r.json() as { ownerId: string, secret: string }
  const token = `${ownerId}.${secret}`
  useDb().prepare('UPDATE owner SET relay_url = ?, relay_token = ? WHERE id = 1').run(url, token)
  S().lastSig = ''
  return { url, token }
}

function forgetRegistration() {
  useDb().prepare("UPDATE owner SET relay_token = '' WHERE id = 1").run()
  S().lastSig = ''
}

/** Push links/settings to the relay, but only when something changed. */
async function pushIfChanged(c: Creds) {
  const o = getOwner()!
  const db = useDb()
  const used = new Map((db.prepare('SELECT link_id AS id, COUNT(*) AS n FROM files GROUP BY link_id').all() as { id: string, n: number }[]).map(r => [r.id, r.n]))
  const links = (db.prepare('SELECT id, token_hash, label, expires_at, max_files, max_bytes, revoked FROM links').all() as any[]).map(l => ({
    id: l.id, tokenHash: l.token_hash, label: l.label, expiresAt: l.expires_at,
    maxFiles: l.max_files, maxBytes: l.max_bytes, revoked: l.revoked, localUsed: used.get(l.id) ?? 0
  }))
  const body = JSON.stringify({ enabled: !!o.sharing_enabled, displayName: o.display_name, links })
  if (body === S().lastSig) return
  const r = await call(c, '/owner/sync', { method: 'PUT', body, headers: { 'content-type': 'application/json' } })
  if (r.status === 404) { forgetRegistration(); throw new Error('The relay no longer knows this app. Signing up again.') }
  if (!r.ok) throw new Error(`Relay sync failed (${r.status})`)
  S().lastSig = body
}

/** Download any files waiting on the relay, then delete them there. */
async function pull(c: Creds) {
  const st = S()
  if (st.pulling) return
  st.pulling = true
  try {
    const db = useDb()
    let pulled = false
    const r = await call(c, '/owner/files')
    if (!r.ok) throw new Error(`Relay error (${r.status})`)
    const list = await r.json() as { id: string, linkId: string, enc: string, size: number, createdAt: number }[]
    for (const f of list) {
      const have = db.prepare('SELECT id FROM files WHERE id = ?').get(f.id)
      const link = db.prepare('SELECT id FROM links WHERE id = ?').get(f.linkId)
      if (!have && link) {
        const path = join(filesDir(), `${f.id}.bin`)
        const res = await call(c, `/owner/files/${f.id}`)
        if (!res.ok || !res.body) continue
        try {
          await pipeline(Readable.fromWeb(res.body as unknown as NodeWebStream), createWriteStream(path, { mode: 0o600 }))
          if (!existsSync(path)) continue
          // Insert only once the whole file is on disk; the relay copy is removed after that.
          db.prepare('INSERT INTO files (id, link_id, enc, size, created_at) VALUES (?, ?, ?, ?, ?)').run(f.id, f.linkId, f.enc, f.size, f.createdAt)
          pulled = true
        } catch {
          await rm(path, { force: true })
          continue
        }
      }
      await call(c, `/owner/files/${f.id}`, { method: 'DELETE' })
    }
    st.lastPull = Date.now()
    // The relay counts files per link to enforce limits; tell it the new total right away.
    if (pulled) await pushIfChanged(c).catch(() => {})
  } finally {
    st.pulling = false
  }
}

// ---- live connection ----
function closeWs(st: PS = S()) {
  try { st.ws?.close() } catch { /* already closed */ }
  st.ws = null
  st.wsOpen = false
}

function ensureWs(c: Creds) {
  const st = S()
  const pid = currentProfile()
  const key = c.url + c.token
  if (st.ws && st.wsKey !== key) closeWs(st)
  if (st.ws) {
    // The relay answers our 'ping' with 'pong'. Silence for 70 s means the connection is dead.
    if (st.wsOpen && Date.now() - st.wsLastMsg > 70_000) closeWs(st)
    else if (st.wsOpen) { try { st.ws.send('ping') } catch { closeWs(st) } }
    return
  }
  if (Date.now() < st.wsRetryAt) return
  st.wsKey = key
  const sock = new (WebSocket as any)(c.url.replace(/^http/, 'ws') + '/owner/ws', { headers: { authorization: `Bearer ${c.token}` } }) as WebSocket
  st.ws = sock
  sock.onopen = () => { st.wsOpen = true; st.wsFails = 0; st.wsLastMsg = Date.now() }
  sock.onmessage = (e: MessageEvent) => {
    st.wsLastMsg = Date.now()
    // Socket callbacks run outside the request, so name the account explicitly.
    if (e.data === 'files' || e.data === 'hello') runAsProfile(pid, () => pull(c)).catch(() => {})
  }
  const dropped = () => {
    if (st.ws !== sock) return
    st.ws = null
    st.wsOpen = false
    st.wsFails++
    st.wsRetryAt = Date.now() + Math.min(2000 * 2 ** st.wsFails, 60_000)
  }
  sock.onclose = dropped
  sock.onerror = dropped
}

/** One cheap pass, run every few seconds. Network is touched only when needed. */
export async function relayTick() {
  const url = relayUrl()
  if (!url) { closeWs(); return }
  if (!getOwner()) return
  const c = await ensureRegistered(url)
  await pushIfChanged(c)
  ensureWs(c)
  // With a live connection we are told about new files. Without one, fall back to polling; a slow safety poll runs either way.
  const st = S()
  const every = st.wsOpen ? 120_000 : 10_000
  if (Date.now() - st.lastPull > every) await pull(c)
  relayState.ok = true
  relayState.error = ''
  relayState.syncedAt = Date.now()
}

export function resetRelaySync() {
  const st = S()
  st.lastSig = ''
  closeWs(st)
  st.ok = false
  st.error = ''
}
