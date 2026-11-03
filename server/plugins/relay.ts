import { relayCreds, relayState, relayPing, relayTick, resetRelaySync } from '../utils/relay'
export default defineNitroPlugin(() => {
  if (import.meta.prerender) return // `nuxt generate` must be able to exit
  let busy = false
  const timer = setInterval(async () => {
    if (busy || !relayCreds()) return
    busy = true
    try {
      await relayTick()
    } catch (e: any) {
      relayState.ok = false
      console.error('[relay]', e?.message || e)
      relayState.error = e?.name === 'TimeoutError' ? 'The relay did not answer in time.' : (e?.message || 'Relay unreachable.')
    } finally {
      busy = false
    }
  }, 3000)
  timer.unref() // never keep the process alive on our own
})
