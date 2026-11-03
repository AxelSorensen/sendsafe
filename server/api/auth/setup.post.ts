import QRCode from 'qrcode'

export default defineEventHandler(async (event) => {
  rateLimit(`setup:${clientIp(event)}`, 10, 60 * 60 * 1000)
  const existing = getOwner()
  if (existing?.totp_enabled) throw createError({ statusCode: 409, statusMessage: 'Already set up' })
  // An earlier attempt that never got past the QR code has nothing in it yet (no login, no files): start over cleanly.
  if (existing) {
    useDb().prepare('DELETE FROM sessions').run()
    useDb().prepare('DELETE FROM owner WHERE id = 1').run()
  }

  const required = process.env.SENDSAFE_SETUP_TOKEN
  const body = await readBody(event)
  if (required && !safeEqual(String(body?.setupToken ?? ''), required)) {
    throw createError({ statusCode: 403, statusMessage: 'Bad setup token' })
  }
  const { authSecret, kdfSalt, publicKey, wrappedPrivateKey, wrapIv } = body ?? {}
  for (const v of [authSecret, kdfSalt, publicKey, wrappedPrivateKey, wrapIv]) {
    if (typeof v !== 'string' || !v || v.length > 20000) throw createError({ statusCode: 400 })
  }

  const secret = generateTotpSecret()
  const email = typeof body?.email === 'string' ? body.email.trim().slice(0, 120) : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw createError({ statusCode: 400, statusMessage: 'Please enter a valid email address.' })
  useDb().prepare(
    `INSERT INTO owner (id, auth_hash, kdf_salt, public_key, wrapped_private_key, wrap_iv, totp_secret, created_at, email)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(hashSecret(authSecret), kdfSalt, publicKey, wrappedPrivateKey, wrapIv, secret, Date.now(), email)

  createSession(event, false)
  const uri = otpauthUri(secret, email)
  return { secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 240 }) }
})
