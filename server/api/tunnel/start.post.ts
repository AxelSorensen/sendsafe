import { relayCreds, relayState, relayPing, relayTick, resetRelaySync } from '../../utils/relay'
export default defineEventHandler((event) => {
  requireOwner(event)
  // In dev the socket port is an internal worker port, so prefer the port the browser used.
  const hostPort = Number((getRequestHeader(event, 'host') ?? '').split(':')[1])
  const port = hostPort || Number(process.env.PORT || process.env.NITRO_PORT) || event.node.req.socket.localPort || 3000
  useDb().prepare('UPDATE owner SET sharing_enabled = 1 WHERE id = 1').run()
  if (relayCreds()) return { status: relayState.ok ? 'running' : 'starting', url: relayCreds()!.url, error: relayState.error, enabled: true }
  startTunnel(port)
  return { ...tunnelState(), enabled: true }
})
