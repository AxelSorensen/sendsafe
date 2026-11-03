export default defineEventHandler(async (event) => {
  requireOwner(event)
  const b = (await readBody(event)) ?? {}
  const o = getOwner()!
  const displayName = typeof b.displayName === 'string' ? b.displayName.trim().slice(0, 80) : o.display_name
  const requireTotp = typeof b.requireTotp === 'boolean' ? (b.requireTotp ? 1 : 0) : o.require_totp
  const sessionMinutes = b.sessionMinutes === undefined ? o.session_minutes : Math.min(Math.max(Math.floor(Number(b.sessionMinutes) || 720), 1), 60 * 24 * 30)
  if (typeof b.onboarded === 'boolean') useDb().prepare('UPDATE owner SET onboarded = ? WHERE id = 1').run(b.onboarded ? 1 : 0)
  useDb().prepare('UPDATE owner SET display_name = ?, require_totp = ?, session_minutes = ? WHERE id = 1')
    .run(displayName, requireTotp, sessionMinutes)
  return { ok: true }
})
