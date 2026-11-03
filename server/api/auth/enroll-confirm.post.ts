// Settings: the first authenticator code proves the app was set up. Only then is two-factor switched on.
export default defineEventHandler(async (event) => {
  requireOwner(event)
  rateLimit(`enroll-confirm:${clientIp(event)}`, 10, 15 * 60 * 1000)
  const o = getOwner()!
  if (o.totp_confirmed) throw createError({ statusCode: 409, statusMessage: 'Two-factor is already set up.' })
  const { code } = (await readBody(event)) ?? {}
  const step = verifyTotp(o.totp_secret, String(code ?? ''), 0)
  if (!step) throw createError({ statusCode: 400, statusMessage: 'Invalid code' })
  useDb().prepare('UPDATE owner SET totp_confirmed = 1, require_totp = 1, totp_last_step = ? WHERE id = 1').run(step)
  return { ok: true }
})
