// Unlock a locked safe. A logged-in session is required, plus an authenticator code when the owner chose
// "code" or "password + code" in Settings. (With "code" the window keeps the key in memory while locked, so the code is all it needs.)
export default defineEventHandler(async (event) => {
  requireOwner(event)
  rateLimit(`unlock:${clientIp(event)}`, 15, 15 * 60 * 1000)
  const o = getOwner()!
  if (o.totp_confirmed && o.unlock_mode !== 'password') {
    const { code } = (await readBody(event)) ?? {}
    const step = verifyTotp(o.totp_secret, String(code ?? ''), o.totp_last_step)
    if (!step) throw createError({ statusCode: 401, statusMessage: isValidButUsed(o.totp_secret, String(code ?? '')) ? 'Code already used' : 'Invalid code' })
    useDb().prepare('UPDATE owner SET totp_last_step = ? WHERE id = 1').run(step)
  }
  return { salt: o.kdf_salt, wrappedPrivateKey: o.wrapped_private_key, wrapIv: o.wrap_iv }
})
