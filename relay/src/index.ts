// SendSafe relay: one hosted service for many users. Public upload endpoint backed by R2 (encrypted blobs)
// and D1 (links). Files are end-to-end encrypted in the sender's browser; this Worker only ever sees ciphertext.
// Each user's desktop app registers itself, syncs its links, and is told over a WebSocket when a file arrives.
import { DurableObject } from 'cloudflare:workers'

interface Env { DB: D1Database, BUCKET: R2Bucket, ASSETS: Fetcher, HUB: DurableObjectNamespace }

const MAX_BODY = 100 * 1024 * 1024 - 4096 // Cloudflare's request body limit
const KEEP_DAYS = 30                      // uncollected encrypted files are deleted after this
// Per-owner limits so one user cannot fill the shared storage.
const MAX_LINKS = 25
const MAX_PENDING_FILES = 500
const MAX_PENDING_BYTES = 2 * 1024 * 1024 * 1024
// Sign-up limits.
const REG_PER_IP_PER_HOUR = 10
const REG_GLOBAL_PER_HOUR = 300

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; frame-src blob:; worker-src 'self' blob:; object-src 'none'; connect-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
const SEC: Record<string, string> = {
  'Content-Security-Policy': CSP,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Robots-Tag': 'noindex, nofollow, noarchive'
}

const SECURITY_TXT = `Contact: https://github.com/AxelSorensen/sendsafe/security/advisories/new
Expires: 2027-11-01T00:00:00.000Z
Preferred-Languages: en
Canonical: https://sendsafe-relay.sendsafe.workers.dev/.well-known/security.txt
`

const DL_BASE = 'https://github.com/AxelSorensen/sendsafe/releases/latest/download'

const HOME = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Download SendSafe</title><meta name="description" content="Download SendSafe for Mac and Windows. Send and receive sensitive files safely, end-to-end encrypted.">
<meta name="robots" content="noindex"><meta name="theme-color" content="#dbeafe">
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style>
*{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#0f172a;font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:44rem;margin:0 auto;padding:3rem 1.25rem 4rem}
header{text-align:center}header img{width:72px;height:72px}h1{margin:.6rem 0 .3rem;font-size:2rem;letter-spacing:-.02em}
.lead{color:#475569;margin:0 auto;max-width:30rem}
.grid{display:grid;gap:1rem;margin-top:2rem;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:1rem;padding:1.25rem;text-align:center;display:flex;flex-direction:column;gap:.35rem}
.card.rec{border-color:#2563eb;box-shadow:0 0 0 3px #dbeafe}
.card h2{margin:0;font-size:1.05rem}.card small{color:#64748b;min-height:2.6em}
.tag{display:none;align-self:center;background:#dbeafe;color:#1d4ed8;font-size:.7rem;font-weight:700;padding:.1rem .55rem;border-radius:99px}
.rec .tag{display:inline-block}
a.btn{margin-top:.5rem;display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;padding:.65rem 1rem;border-radius:.7rem}
a.btn:hover{background:#1d4ed8}
section{margin-top:2.25rem;background:#fff;border:1px solid #e2e8f0;border-radius:1rem;padding:1.25rem 1.5rem}
section h3{margin:0 0 .5rem;font-size:1rem}section ol,section ul{margin:.25rem 0 0;padding-left:1.2rem;color:#334155}section li{margin:.3rem 0}
.note{color:#64748b;font-size:.85rem;margin-top:1.5rem;text-align:center}
</style></head>
<body><main>
<header><img src="/favicon.svg" alt="" width="72" height="72"><h1>Download SendSafe</h1>
<p class="lead">Send and receive sensitive files safely. Everything is encrypted before it leaves your device, and only the recipient can open it.</p></header>
<div class="grid">
<div class="card" id="mac-arm"><span class="tag">Recommended for you</span><h2>Mac · Apple silicon</h2><small>M1, M2, M3, M4 and newer (most Macs since 2020)</small><a class="btn" href="${DL_BASE}/SendSafe-mac-arm.dmg">Download for Mac</a></div>
<div class="card" id="mac-intel"><span class="tag">Recommended for you</span><h2>Mac · Intel</h2><small>Older Macs with an Intel processor</small><a class="btn" href="${DL_BASE}/SendSafe-mac-intel.dmg">Download for Intel Mac</a></div>
<div class="card" id="win"><span class="tag">Recommended for you</span><h2>Windows</h2><small>Windows 10 and 11, 64-bit</small><a class="btn" href="${DL_BASE}/SendSafe-windows.exe">Download for Windows</a></div>
</div>
<section><h3>Not sure which Mac you have?</h3><p style="margin:0;color:#334155">Click the Apple menu, then About This Mac. If it says Chip: Apple M1 (or M2, M3, M4), choose Apple silicon. If it says Processor: Intel, choose Intel.</p></section>
<section><h3>Installing on a Mac</h3><ol><li>Open the downloaded <b>SendSafe</b> file.</li><li>Drag SendSafe into the <b>Applications</b> folder.</li><li>Open SendSafe from Applications. If macOS says it can't verify the app, right-click it, choose <b>Open</b>, then <b>Open</b> again.</li></ol><p style="margin:.75rem 0 0;color:#334155">If it says SendSafe is <b>damaged</b>, open Terminal and run:<br><code style="background:#f1f5f9;padding:.15rem .4rem;border-radius:.4rem">xattr -cr /Applications/SendSafe.app</code><br>then open it again. This happens because the app is not yet signed by Apple.</p></section>
<section><h3>Installing on Windows</h3><ol><li>Run the downloaded installer.</li><li>If Windows shows "Windows protected your PC", click <b>More info</b>, then <b>Run anyway</b>.</li></ol></section>
<p class="note">SendSafe stays in your menu bar or tray and starts when you log in, so uploads reach you even when the window is closed.</p>
</main>
<script>
(function(){var ua=navigator.userAgent,id=/Windows/.test(ua)?'win':(/Mac/.test(ua)&&!/iPhone|iPad/.test(ua))?'mac-arm':null;
if(id){var el=document.getElementById(id);if(el){el.classList.add('rec');var g=el.parentNode;g.insertBefore(el,g.firstChild)}}})();
</script></body></html>`

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg) } }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  return (crypto.subtle as unknown as { timingSafeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean }).timingSafeEqual(ea, eb)
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// Best-effort per-isolate rate limit. Hard limits (quotas, link rules) are enforced from D1.
const hits = new Map<string, number[]>()
function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter(t => now - t < windowMs)
  if (recent.length >= max) throw new HttpError(429, 'Too many requests')
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) hits.clear()
}

interface OwnerRow { id: string, secret_hash: string, public_key: string, display_name: string, enabled: number }
interface LinkRow { id: string, owner_id: string, label: string, expires_at: number, max_files: number, max_bytes: number, revoked: number, local_used: number }
type LinkWithOwner = LinkRow & { public_key: string, display_name: string, enabled: number }

async function authOwner(req: Request, env: Env): Promise<OwnerRow> {
  const h = req.headers.get('authorization') ?? ''
  const tok = h.startsWith('Bearer ') ? h.slice(7) : ''
  const dot = tok.indexOf('.')
  const id = tok.slice(0, dot)
  const secret = tok.slice(dot + 1)
  if (dot < 1 || !secret || id.length > 64 || secret.length > 200) throw new HttpError(404, 'Not found')
  const o = await env.DB.prepare('SELECT * FROM owners WHERE id = ?').bind(id).first<OwnerRow>()
  if (!o || !safeEqual(await sha256Hex(secret), o.secret_hash)) throw new HttpError(404, 'Not found')
  return o
}

async function findLink(env: Env, token: string): Promise<LinkWithOwner | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const l = await env.DB.prepare(
    `SELECT l.*, o.public_key, o.display_name, o.enabled FROM links l JOIN owners o ON o.id = l.owner_id WHERE l.token_hash = ?`
  ).bind(await sha256Hex(token)).first<LinkWithOwner>()
  if (!l || l.revoked || l.expires_at < Date.now()) return null
  return l
}

const hub = (env: Env, ownerId: string) => env.HUB.get(env.HUB.idFromName(ownerId))

// ---- public: sign-up ----
async function register(req: Request, env: Env): Promise<Response> {
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown'
  rateLimit(`reg:${ip}`, REG_PER_IP_PER_HOUR, 3_600_000)
  const recent = (await env.DB.prepare('SELECT COUNT(*) AS n FROM owners WHERE created_at > ?').bind(Date.now() - 3_600_000).first<{ n: number }>())!.n
  if (recent >= REG_GLOBAL_PER_HOUR) throw new HttpError(429, 'Sign-ups are busy right now. Try again later.')
  const b = await req.json<{ publicKey?: string }>().catch(() => ({} as { publicKey?: string }))
  const publicKey = String(b.publicKey ?? '')
  if (publicKey.length < 100 || publicKey.length > 2000 || !/^[A-Za-z0-9+/=_-]+$/.test(publicKey)) throw new HttpError(400, 'Bad key')
  const id = crypto.randomUUID()
  const secret = b64url(crypto.getRandomValues(new Uint8Array(32)))
  await env.DB.prepare('INSERT INTO owners (id, secret_hash, public_key, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, await sha256Hex(secret), publicKey, Date.now()).run()
  return json({ ownerId: id, secret })
}

// ---- public: uploader page API ----
async function upload(req: Request, env: Env, ctx: ExecutionContext, token: string): Promise<Response> {
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown'
  const link = await findLink(env, token)
  if (!link) throw new HttpError(404, 'Link invalid or expired')
  if (!link.enabled) throw new HttpError(503, 'The recipient has turned sharing off.')
  const q = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS b FROM files WHERE owner_id = ?').bind(link.owner_id).first<{ n: number, b: number }>()
  const linkPending = (await env.DB.prepare('SELECT COUNT(*) AS n FROM files WHERE link_id = ?').bind(link.id).first<{ n: number }>())!.n
  const used = link.local_used + linkPending
  const cap = Math.min(link.max_bytes, MAX_BODY - 1024)

  if (req.method === 'GET') {
    rateLimit(`info:${ip}`, 120, 10 * 60_000)
    return json({
      label: link.label,
      ownerName: link.display_name,
      publicKey: link.public_key,
      filesLeft: Math.max(link.max_files - used, 0),
      maxFileBytes: cap,
      expiresAt: link.expires_at,
      now: Date.now()
    })
  }

  rateLimit(`up:${ip}`, 60, 10 * 60_000)
  if (used >= link.max_files) throw new HttpError(409, 'File limit reached')
  const limit = cap + 1024 // AES-GCM tag + slack
  const declared = Number(req.headers.get('content-length') ?? 0)
  if (!declared) throw new HttpError(411, 'Length required')
  if (declared > limit) throw new HttpError(413, 'File too large')
  if (q!.n >= MAX_PENDING_FILES || q!.b + declared > MAX_PENDING_BYTES) throw new HttpError(507, 'The recipient’s inbox is full right now. Try again later.')

  const encHeader = req.headers.get('x-enc') ?? ''
  if (!encHeader || encHeader.length > 4000) throw new HttpError(400, 'Bad metadata')
  try {
    const parsed = JSON.parse(atob(encHeader.replace(/-/g, '+').replace(/_/g, '/')))
    for (const k of ['iv', 'metaIv', 'meta', 'key']) if (typeof parsed[k] !== 'string') throw new Error()
  } catch { throw new HttpError(400, 'Bad metadata') }
  if (!req.body) throw new HttpError(400, 'Empty upload')

  const id = crypto.randomUUID()
  const key = `f/${id}`
  const obj = await env.BUCKET.put(key, req.body)
  if (!obj || obj.size === 0 || obj.size > limit) {
    await env.BUCKET.delete(key)
    throw new HttpError(obj && obj.size > limit ? 413 : 400, obj && obj.size > limit ? 'File too large' : 'Empty upload')
  }
  try {
    await env.DB.prepare('INSERT INTO files (id, link_id, owner_id, enc, size, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, link.id, link.owner_id, encHeader, obj.size, Date.now()).run()
  } catch {
    await env.BUCKET.delete(key)
    throw new HttpError(500, 'Could not save the file')
  }
  // Tell the owner's app right away (push), instead of it polling.
  ctx.waitUntil(hub(env, link.owner_id).fetch('https://hub/notify', { method: 'POST' }).catch(() => {}))
  // Receipt: the browser checks `size` against what it sent.
  return json({ ok: true, id, size: obj.size })
}

// ---- owner API (authenticated with the secret returned at sign-up) ----
async function owner(req: Request, env: Env, path: string): Promise<Response> {
  const o = await authOwner(req, env)

  if (path === '/owner/ws') {
    if (req.headers.get('upgrade') !== 'websocket') throw new HttpError(426, 'Expected WebSocket')
    return hub(env, o.id).fetch('https://hub/connect', req)
  }

  if (path === '/owner/ping') return json({ ok: true })

  if (path === '/owner/sync' && req.method === 'PUT') {
    const b = await req.json<{ enabled: boolean, displayName: string, links: { id: string, tokenHash: string, label: string, expiresAt: number, maxFiles: number, maxBytes: number, revoked: number, localUsed: number }[] }>()
    if (!Array.isArray(b.links) || b.links.length > MAX_LINKS) throw new HttpError(400, 'Too many links')
    const stmts: D1PreparedStatement[] = [
      env.DB.prepare('UPDATE owners SET enabled = ?, display_name = ? WHERE id = ?').bind(b.enabled ? 1 : 0, String(b.displayName ?? '').slice(0, 80), o.id)
    ]
    for (const l of b.links) {
      if (!/^[0-9a-f]{64}$/.test(l.tokenHash) || String(l.id).length > 64) throw new HttpError(400, 'Bad link')
      stmts.push(env.DB.prepare(
        `INSERT INTO links (id, owner_id, token_hash, label, expires_at, max_files, max_bytes, revoked, local_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET token_hash = excluded.token_hash, label = excluded.label, expires_at = excluded.expires_at,
           max_files = excluded.max_files, max_bytes = excluded.max_bytes, revoked = excluded.revoked, local_used = excluded.local_used
         WHERE links.owner_id = excluded.owner_id`
      ).bind(l.id, o.id, l.tokenHash, String(l.label).slice(0, 80), l.expiresAt, l.maxFiles, l.maxBytes, l.revoked ? 1 : 0, l.localUsed))
    }
    // Links deleted on the Mac stop working here too (only this owner's).
    const ids = b.links.map(l => l.id)
    stmts.push(ids.length
      ? env.DB.prepare(`DELETE FROM links WHERE owner_id = ? AND id NOT IN (${ids.map(() => '?').join(',')})`).bind(o.id, ...ids)
      : env.DB.prepare('DELETE FROM links WHERE owner_id = ?').bind(o.id))
    try { await env.DB.batch(stmts) } catch { throw new HttpError(409, 'Could not save links') }
    return json({ ok: true })
  }

  if (path === '/owner/files' && req.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, link_id AS linkId, enc, size, created_at AS createdAt FROM files WHERE owner_id = ? ORDER BY created_at LIMIT 50').bind(o.id).all()
    return json(results)
  }

  const m = path.match(/^\/owner\/files\/([0-9a-f-]{36})$/)
  if (m) {
    const id = m[1]!
    const row = await env.DB.prepare('SELECT id FROM files WHERE id = ? AND owner_id = ?').bind(id, o.id).first()
    if (!row) throw new HttpError(404, 'Not found')
    if (req.method === 'GET') {
      const obj = await env.BUCKET.get(`f/${id}`)
      if (!obj) throw new HttpError(404, 'Not found')
      return new Response(obj.body, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(obj.size), 'cache-control': 'no-store' } })
    }
    if (req.method === 'DELETE') {
      await env.BUCKET.delete(`f/${id}`)
      await env.DB.prepare('DELETE FROM files WHERE id = ? AND owner_id = ?').bind(id, o.id).run()
      return json({ ok: true })
    }
  }
  throw new HttpError(404, 'Not found')
}

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname

  if (path === '/ping') return json({ sendsafe: true })
  if (path === '/register' && req.method === 'POST') return register(req, env)
  if (path.startsWith('/owner/')) return owner(req, env, path)

  const up = path.match(/^\/api\/upload\/([A-Za-z0-9_-]+)$/)
  if (up && (req.method === 'GET' || req.method === 'POST')) return upload(req, env, ctx, up[1]!)

  // Only the uploader page and its assets are public. The page shows its own "closed" screen when the API says so.
  if (/^\/u\/[A-Za-z0-9_-]+\/?$/.test(path)) return env.ASSETS.fetch(new Request(new URL('/200.html', url), { method: 'GET', headers: req.headers }))
  if (path.startsWith('/_nuxt/') || ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png', '/og.png', '/robots.txt'].includes(path)) return env.ASSETS.fetch(req)
  if (path === '/.well-known/security.txt') return new Response(SECURITY_TXT, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
  if ((path === '/' || path === '/download') && (req.method === 'GET' || req.method === 'HEAD')) return new Response(HOME, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } })

  throw new HttpError(404, 'Not found')
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let res: Response
    try {
      res = await route(req, env, ctx)
    } catch (e) {
      if (e instanceof HttpError) res = json({ statusMessage: e.message }, e.status)
      else { console.error(e); res = json({ statusMessage: 'Server error' }, 500) }
    }
    if (res.status === 101) return res // WebSocket upgrade: leave untouched
    res = new Response(res.body, res)
    for (const [k, v] of Object.entries(SEC)) res.headers.set(k, v)
    return res
  },

  // Daily: drop encrypted files nobody collected within KEEP_DAYS, and owners that never set anything up.
  async scheduled(_e: ScheduledController, env: Env) {
    const cutoff = Date.now() - KEEP_DAYS * 86_400_000
    const { results } = await env.DB.prepare('SELECT id FROM files WHERE created_at < ? LIMIT 500').bind(cutoff).all<{ id: string }>()
    for (const r of results) {
      await env.BUCKET.delete(`f/${r.id}`)
      await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(r.id).run()
    }
    await env.DB.prepare('DELETE FROM owners WHERE created_at < ? AND id NOT IN (SELECT owner_id FROM links)').bind(cutoff).run()
  }
}

// One per owner. Holds the app's WebSocket (hibernates when idle, so it costs nothing while quiet) and pushes "files" when an upload lands.
export class OwnerHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  async fetch(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url)
    if (pathname === '/notify') {
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send('files') } catch { /* closed */ }
      }
      return new Response('ok')
    }
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket]
    // A new connection replaces older ones (e.g. the app restarted).
    for (const old of this.ctx.getWebSockets()) { try { old.close(1000, 'replaced') } catch { /* closed */ } }
    this.ctx.acceptWebSocket(server)
    server.send('hello')
    return new Response(null, { status: 101, webSocket: client })
  }

  webSocketMessage() { /* nothing to receive; 'ping' is answered automatically */ }
  webSocketClose(ws: WebSocket, code: number) { try { ws.close(code) } catch { /* already closed */ } }
}
