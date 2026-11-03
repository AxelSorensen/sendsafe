import { relayManaged, relayPing, resetRelaySync } from '../../utils/relay'

// Manual relay address (only when none is built into the app). No token: the app signs itself up.
export default defineEventHandler(async (event) => {
  requireOwner(event)
  if (relayManaged()) throw createError({ statusCode: 403, statusMessage: 'The relay is built into this app.' })
  const b = (await readBody(event)) ?? {}
  if (b.clear === true) {
    useDb().prepare("UPDATE owner SET relay_url = '', relay_token = '' WHERE id = 1").run()
    resetRelaySync()
    return { ok: true }
  }
  let url: URL
  try { url = new URL(String(b.url ?? '').trim()) } catch { throw createError({ statusCode: 400, statusMessage: 'Enter the relay address, e.g. https://sendsafe-relay.example.workers.dev' }) }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !local) throw createError({ statusCode: 400, statusMessage: 'The relay address must start with https://' })
  let ok = false
  try { ok = await relayPing(url.origin) } catch { /* unreachable */ }
  if (!ok) throw createError({ statusCode: 400, statusMessage: 'That address is not a SendSafe relay.' })
  useDb().prepare("UPDATE owner SET relay_url = ?, relay_token = '' WHERE id = 1").run(url.origin)
  stopTunnel() // the relay replaces the temporary tunnel
  resetRelaySync()
  return { ok: true }
})
