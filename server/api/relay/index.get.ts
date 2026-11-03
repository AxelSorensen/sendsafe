import { relayManaged, relayCreds, relayState, relayPing, relayTick, resetRelaySync } from '../../utils/relay'
export default defineEventHandler((event) => {
  requireOwner(event)
  const c = relayCreds()
  // The token is write-only: never sent back to the browser.
  return { managed: relayManaged(), url: c?.url ?? '', configured: !!c, ok: relayState.ok, error: relayState.error }
})
