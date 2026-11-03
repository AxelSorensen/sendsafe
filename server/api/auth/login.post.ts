export default defineEventHandler(async (event) => {
  const ip = clientIp(event)
  rateLimit(`login:${ip}`, 8, 15 * 60 * 1000)
  rateLimit('login:global', 60, 15 * 60 * 1000)

  const { authSecret, code, email } = (await readBody(event)) ?? {}
  const owner = getOwner()
  const fail = () => createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  if (!owner || !owner.totp_enabled || typeof authSecret !== 'string' || authSecret.length > 200) throw fail()
  if (!verifySecret(authSecret, owner.auth_hash)) throw fail()
  const db = useDb()
  if (owner.require_totp) {
    const step = verifyTotp(owner.totp_secret, String(code ?? ''), owner.totp_last_step)
    // The password was right at this point, so it is safe to say a correct code was simply used a moment ago.
    if (!step) throw isValidButUsed(owner.totp_secret, String(code ?? '')) ? createError({ statusCode: 401, statusMessage: 'Code already used' }) : fail()
    db.prepare('UPDATE owner SET totp_last_step = ? WHERE id = 1').run(step)
  }
  // Older accounts have no email yet: remember the one used for this successful login.
  if (!owner.email && typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) db.prepare('UPDATE owner SET email = ? WHERE id = 1').run(email.trim().slice(0, 120))
  db.prepare('DELETE FROM sessions').run()
  createSession(event, true)
  return {
    publicKey: owner.public_key,
    wrappedPrivateKey: owner.wrapped_private_key,
    wrapIv: owner.wrap_iv
  }
})
