import { spawn, type ChildProcess } from 'node:child_process'

type Status = 'stopped' | 'starting' | 'running' | 'error'

let proc: ChildProcess | null = null
let state: { status: Status, url: string, error: string } = { status: 'stopped', url: '', error: '' }

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/

export const tunnelState = () => ({ ...state })

let retryTimer: ReturnType<typeof setTimeout> | undefined
let lastPort = 0

export function stopTunnel() {
  clearTimeout(retryTimer)
  proc?.kill('SIGTERM')
  proc = null
  state = { status: 'stopped', url: '', error: '' }
}

export function startTunnel(port: number) {
  if (proc) return
  clearTimeout(retryTimer)
  lastPort = port
  state = { status: 'starting', url: '', error: '' }
  const child = spawn(process.env.SENDSAFE_CLOUDFLARED || 'cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], {
    stdio: ['ignore', 'ignore', 'pipe']
  })
  proc = child
  let buf = ''
  child.stderr!.on('data', (d: Buffer) => {
    if (state.status === 'running') return
    buf += d.toString()
    const m = buf.match(URL_RE)
    if (m) state = { status: 'running', url: m[0], error: '' }
    buf = buf.slice(-2000)
  })
  child.on('error', (e: NodeJS.ErrnoException) => {
    if (proc !== child) return
    proc = null
    state = { status: 'error', url: '', error: e.code === 'ENOENT' ? 'cloudflared not installed (brew install cloudflared)' : e.message }
  })
  child.on('exit', (code) => {
    if (proc !== child) return
    proc = null
    const wasRunning = state.status === 'running'
    const limited = /status 429/.test(buf)
    state = wasRunning
      ? { status: 'starting', url: '', error: '' }
      : { status: 'error', url: '', error: limited ? 'Cloudflare is limiting new tunnels (too many restarts). Retrying automatically in a minute.' : `cloudflared exited (${code})` }
    // Keep sharing alive: reconnect on its own while the switch is on.
    if (getOwner()?.sharing_enabled) retryTimer = setTimeout(() => startTunnel(lastPort), wasRunning ? 2_000 : limited ? 60_000 : 15_000)
  })
}

process.on('exit', () => proc?.kill('SIGTERM'))
