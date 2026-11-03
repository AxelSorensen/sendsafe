// Unlock a locked safe: the logged-in session is required, plus an authenticator code when the owner chose that in Settings.
export default defineEventHandler(async (event) => {
  requireOwner(event)
  rateLimit(`unlock:${clientIp(event)}`, 15, 15 * 60 * 1000)
  const o = getOwner()!
  if (o.unlock_totp && o.totp_confirmed) {
    const { code } = (await readBody(event)) ?? {}
    const step = verifyTotp(o.totp_secret, String(code ?? ''), o.totp_last_step)
    if (!step) throw createError({ statusCode: 401, statusMessage: 'Invalid code' })
    useDb().prepare('UPDATE owner SET totp_last_step = ? WHERE id = 1').run(step)
  }
  return { salt: o.kdf_salt, wrappedPrivateKey: o.wrapped_private_key, wrapIv: o.wrap_iv }
})
