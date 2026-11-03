import QRCode from 'qrcode'

// Settings: start adding two-factor to an account that skipped it. Nothing changes until the first code is confirmed.
export default defineEventHandler(async (event) => {
  requireOwner(event)
  rateLimit(`enroll:${clientIp(event)}`, 10, 15 * 60 * 1000)
  const o = getOwner()!
  if (o.totp_confirmed) throw createError({ statusCode: 409, statusMessage: 'Two-factor is already set up.' })
  const secret = generateTotpSecret()
  useDb().prepare('UPDATE owner SET totp_secret = ?, totp_last_step = 0 WHERE id = 1').run(secret)
  const uri = otpauthUri(secret, o.email || o.display_name)
  return { secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 240 }) }
})
