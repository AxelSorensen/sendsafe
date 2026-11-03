import { relayCreds, relayState, relayPing, relayTick, resetRelaySync } from '../../utils/relay'
export default defineEventHandler((event) => {
  requireOwner(event)
  const enabled = !!getOwner()?.sharing_enabled
  const relay = relayCreds()
  if (relay) {
    return { status: relayState.ok ? 'running' : relayState.error ? 'error' : 'starting', url: relay.url, error: relayState.error, enabled }
  }
  return { ...tunnelState(), enabled }
})
