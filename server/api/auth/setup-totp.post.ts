export default defineEventHandler(async (event) => {
  rateLimit(`totp-setup:${clientIp(event)}`, 10, 15 * 60 * 1000)
  const session = getSession(event)
  const owner = getOwner()
  if (!session || !owner || owner.totp_enabled) throw createError({ statusCode: 401 })
  const { code } = (await readBody(event)) ?? {}
  const step = verifyTotp(owner.totp_secret, String(code ?? ''), 0)
  if (!step) throw createError({ statusCode: 400, statusMessage: 'Invalid code' })
  const db = useDb()
  db.prepare('UPDATE owner SET totp_enabled = 1, totp_confirmed = 1, require_totp = 1, totp_last_step = ? WHERE id = 1').run(step)
  db.prepare('UPDATE sessions SET verified = 1 WHERE id_hash = ?').run(session.idHash)
  return { ok: true }
})
