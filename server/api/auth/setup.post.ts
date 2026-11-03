import QRCode from 'qrcode'

export default defineEventHandler(async (event) => {
  rateLimit(`setup:${clientIp(event)}`, 10, 60 * 60 * 1000)
  if (getOwner()) throw createError({ statusCode: 409, statusMessage: 'Already set up' })

  const required = process.env.SAFEDROP_SETUP_TOKEN
  const body = await readBody(event)
  if (required && !safeEqual(String(body?.setupToken ?? ''), required)) {
    throw createError({ statusCode: 403, statusMessage: 'Bad setup token' })
  }
  const { authSecret, kdfSalt, publicKey, wrappedPrivateKey, wrapIv } = body ?? {}
  for (const v of [authSecret, kdfSalt, publicKey, wrappedPrivateKey, wrapIv]) {
    if (typeof v !== 'string' || !v || v.length > 20000) throw createError({ statusCode: 400 })
  }

  const secret = generateTotpSecret()
  useDb().prepare(
    `INSERT INTO owner (id, auth_hash, kdf_salt, public_key, wrapped_private_key, wrap_iv, totp_secret, created_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)`
  ).run(hashSecret(authSecret), kdfSalt, publicKey, wrappedPrivateKey, wrapIv, secret, Date.now())

  createSession(event, false)
  const uri = otpauthUri(secret)
  return { secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 240 }) }
})
