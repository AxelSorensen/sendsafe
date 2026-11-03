export interface TunnelState { status: string, url: string, error: string, enabled: boolean }

const tunnel = ref<TunnelState>({ status: 'stopped', url: '', error: '', enabled: true })
let poll: ReturnType<typeof setInterval> | undefined
let started = false

function apply(t: TunnelState) {
  tunnel.value = t
  tunnelUrl.value = t.status === 'running' ? t.url : ''
  const watching = t.enabled && (t.status === 'starting' || t.status === 'error')
  if (watching && !poll) {
    poll = setInterval(async () => apply(await $fetch<TunnelState>('/api/tunnel')), 3000)
  } else if (!watching && poll) {
    clearInterval(poll)
    poll = undefined
  }
}

async function start() {
  apply(await $fetch<TunnelState>('/api/tunnel/start', { method: 'POST' }))
}

async function stop() {
  apply(await $fetch<TunnelState>('/api/tunnel/stop', { method: 'POST' }))
}

/** Sharing server is on by default (and remembered when turned off): start the tunnel once per session if enabled. */
export function useTunnel() {
  async function init() {
    if (started) return
    started = true
    const t = await $fetch<TunnelState>('/api/tunnel')
    apply(t)
    if (t.enabled && (t.status === 'stopped' || t.status === 'error')) await start()
  }
  return { tunnel, init, retry: start, start, stop }
}
