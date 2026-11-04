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
<title>Download | SendSafe</title><meta name="description" content="Download SendSafe for Mac, Windows and Linux. Send and receive sensitive files safely, end-to-end encrypted.">
<meta name="robots" content="noindex"><meta name="theme-color" content="#dbeafe">
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#0f172a;font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:100%;max-width:28rem;padding:2rem 1.25rem;text-align:center}
img{width:80px;height:80px}h1{margin:1rem 0 .4rem;font-size:1.9rem;letter-spacing:-.02em}
.lead{margin:0 auto 1.75rem;color:#475569}
a.btn{display:flex;flex-direction:column;align-items:center;justify-content:center;height:4.25rem;white-space:nowrap;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:1.1rem;padding:0 1rem;border-radius:.9rem;box-shadow:0 6px 16px -6px rgba(37,99,235,.55)}
a.btn:hover{background:#1d4ed8}a.btn small{display:block;font-weight:400;font-size:.8rem;opacity:.85}
.pick{margin-top:1rem;font-size:.85rem;color:#64748b}
select{margin-left:.4rem;font:inherit;font-size:.85rem;color:#0f172a;background:#fff;border:1px solid #cbd5e1;border-radius:.6rem;padding:.4rem .6rem;cursor:pointer}
details{margin-top:1.75rem;text-align:left;font-size:.88rem;color:#475569;border-top:1px solid #e2e8f0;padding-top:1rem}
summary{cursor:pointer;color:#0f172a;font-weight:600}details p{margin:.6rem 0 0}
#after{margin-top:1.75rem;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:1rem;padding:1.1rem 1.25rem;display:none}
body[data-os=mac] #after{display:block}
#after h2{margin:0 0 .75rem;font-size:.95rem}
#after ol{list-style:none;margin:0;padding:0;counter-reset:s}
#after li{counter-increment:s;display:flex;gap:.75rem;align-items:flex-start;margin:.65rem 0;font-size:.9rem;color:#334155}
#after li:before{content:counter(s);flex:none;width:1.5rem;height:1.5rem;border-radius:99px;background:#dbeafe;color:#1d4ed8;font-weight:700;font-size:.8rem;display:grid;place-items:center}
#after .mock{margin-top:.45rem;display:flex;align-items:center;justify-content:space-between;gap:.75rem;background:#f1f5f9;border-radius:.6rem;padding:.55rem .75rem;font-size:.8rem;color:#475569}
#after .mock b{background:#2563eb;color:#fff;font-weight:600;border-radius:.45rem;padding:.25rem .6rem;white-space:nowrap}
code{background:#f1f5f9;padding:.1rem .35rem;border-radius:.35rem;font-size:.8rem}
</style></head>
<body><main>
<img src="/favicon.svg" alt="" width="80" height="80">
<h1>SendSafe</h1>
<p class="lead">Send and receive files safely. Encrypted before it leaves your device.</p>
<a class="btn" id="dl" href="${DL_BASE}/SendSafe-mac-arm.dmg"><span id="dlt">Download for Mac</span><small id="dls">Apple silicon</small></a>
<p class="pick"><label for="os">Other platforms:</label><select id="os">
<option value="mac-arm">Mac · Apple silicon</option>
<option value="mac-intel">Mac · Intel</option>
<option value="win">Windows 10 / 11</option>
<option value="linux-deb">Linux · Ubuntu, Debian, Mint (.deb)</option>
<option value="linux-app">Linux · Other (AppImage)</option>
</select></p>
<div id="after"><h2>After you download (Mac)</h2><ol>
<li><span>Open the downloaded file and drag <b>SendSafe</b> into <b>Applications</b>.</span></li>
<li><span>Open SendSafe from Applications. macOS will say it can't verify the app. Click <b>Done</b>, not Move to Trash.</span></li>
<li><span>Open <b>System Settings</b>, then <b>Privacy &amp; Security</b>, scroll down and click <b>Open Anyway</b>:<span class="mock"><span>"SendSafe" was blocked from use because it is not from an identified developer.</span><b>Open Anyway</b></span></span></li>
</ol></div>
<details><summary>Help installing</summary>
<p><b>Which Mac?</b> Apple menu, About This Mac. "Chip: Apple M…" means Apple silicon, "Processor: Intel" means Intel.</p>
<p><b>Mac:</b> open the file, drag SendSafe to Applications, then open it. If macOS says it can't verify it, click Done, open System Settings, Privacy &amp; Security, scroll down and click <b>Open Anyway</b> next to SendSafe (older macOS: right-click the app, choose Open). If it says "damaged", run <code>xattr -cr /Applications/SendSafe.app</code> in Terminal.</p>
<p><b>Linux:</b> for Ubuntu, Debian or Mint, open the .deb file and click Install (or run <code>sudo apt install ./SendSafe-linux.deb</code>). For other distributions, download the AppImage, make it executable (<code>chmod +x SendSafe-linux.AppImage</code>) and double-click it. 64-bit Intel/AMD only.</p>
<p><b>Windows:</b> run the installer. If it says "Windows protected your PC", click More info, then Run anyway.</p>
</details>
</main>
<script>
(function(){var B='${DL_BASE}',P={'mac-arm':['Download for Mac','Apple silicon','/SendSafe-mac-arm.dmg'],'mac-intel':['Download for Mac','Intel','/SendSafe-mac-intel.dmg'],'win':['Download for Windows','Windows 10 / 11','/SendSafe-windows.exe'],'linux-deb':['Download for Linux','.deb · Ubuntu, Debian, Mint','/SendSafe-linux.deb'],'linux-app':['Download for Linux','AppImage','/SendSafe-linux.AppImage']};
var sel=document.getElementById('os'),dl=document.getElementById('dl');
function set(k){var p=P[k];document.getElementById('dlt').textContent=p[0];document.getElementById('dls').textContent=p[1];dl.href=B+p[2];sel.value=k}
var ua=navigator.userAgent;set(/Windows/.test(ua)?'win':/Android/.test(ua)?'mac-arm':/Linux|X11/.test(ua)?'linux-deb':'mac-arm');
sel.addEventListener('change',function(){set(sel.value)})})();
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
  if (/^\/u\/[A-Za-z0-9_-]+\/?$/.test(path)) {
    const page = await env.ASSETS.fetch(new Request(new URL('/200.html', url), { method: 'GET', headers: req.headers }))
    // Right title from the first paint (the app sets the same one once it loads).
    const html = (await page.text()).replace('<title>SendSafe</title>', '<title>Upload | SendSafe</title>')
    return new Response(html, { status: page.status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } })
  }
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
