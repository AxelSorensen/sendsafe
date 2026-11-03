import { relayCreds, relayState, relayPing, relayTick, resetRelaySync } from '../../utils/relay'
export default defineEventHandler((event) => {
  requireOwner(event)
  useDb().prepare('UPDATE owner SET sharing_enabled = 0 WHERE id = 1').run()
  stopTunnel()
  const relay = relayCreds()
  if (relay) return { status: relayState.ok ? 'running' : 'starting', url: relay.url, error: relayState.error, enabled: false }
  return { ...tunnelState(), enabled: false }
})
