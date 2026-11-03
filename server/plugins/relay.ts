import { relayCreds, relayState, relayTick } from '../utils/relay'

// Keeps every account on this computer connected to the relay, so files arrive for all of them, not just the one logged in.
export default defineNitroPlugin(() => {
  if (import.meta.prerender) return // `nuxt generate` must be able to exit
  let busy = false
  const timer = setInterval(async () => {
    if (busy) return
    busy = true
    try {
      for (const { id } of listAccounts()) {
        await runAsProfile(id, async () => {
          if (!relayCreds()) return
          try {
            await relayTick()
          } catch (e: any) {
            relayState.ok = false
            console.error('[relay]', id, e?.message || e)
            relayState.error = e?.name === 'TimeoutError' ? 'The relay did not answer in time.' : (e?.message || 'Relay unreachable.')
          }
        })
      }
    } finally {
      busy = false
    }
  }, 3000)
  timer.unref() // never keep the process alive on our own
})
