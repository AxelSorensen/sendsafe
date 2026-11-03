// Finish setup with a password only. Two-factor can be added later in Settings.
export default defineEventHandler((event) => {
  rateLimit(`totp-skip:${clientIp(event)}`, 10, 15 * 60 * 1000)
  const session = getSession(event)
  const owner = getOwner()
  if (!session || !owner || owner.totp_enabled) throw createError({ statusCode: 401 })
  const db = useDb()
  db.prepare('UPDATE owner SET totp_enabled = 1, totp_confirmed = 0, require_totp = 0 WHERE id = 1').run()
  db.prepare('UPDATE sessions SET verified = 1 WHERE id_hash = ?').run(session.idHash)
  return { ok: true }
})
