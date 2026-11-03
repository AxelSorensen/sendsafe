export default defineEventHandler(async (event) => {
  requireOwner(event)
  const b = (await readBody(event)) ?? {}
  const o = getOwner()!
  const displayName = typeof b.displayName === 'string' ? b.displayName.trim().slice(0, 80) : o.display_name
  const requireTotp = typeof b.requireTotp === 'boolean' ? (b.requireTotp ? 1 : 0) : o.require_totp
  // Without an enrolled authenticator, requiring a code would lock the account out.
  if (requireTotp && !o.totp_confirmed) throw createError({ statusCode: 400, statusMessage: 'Set up an authenticator first.' })
  const autoLock = b.autoLockMinutes === undefined ? o.autolock_minutes : Math.min(Math.max(Math.floor(Number(b.autoLockMinutes) || 0), 0), 240)
  const unlockMode = b.unlockMode === undefined ? o.unlock_mode : String(b.unlockMode)
  if (!['password', 'code', 'both'].includes(unlockMode)) throw createError({ statusCode: 400, statusMessage: 'Bad unlock mode.' })
  if (unlockMode !== 'password' && !o.totp_confirmed) throw createError({ statusCode: 400, statusMessage: 'Set up an authenticator first.' })
  const sessionMinutes = b.sessionMinutes === undefined ? o.session_minutes : Math.min(Math.max(Math.floor(Number(b.sessionMinutes) || 720), 1), 60 * 24 * 30)
  if (typeof b.onboarded === 'boolean') useDb().prepare('UPDATE owner SET onboarded = ? WHERE id = 1').run(b.onboarded ? 1 : 0)
  useDb().prepare('UPDATE owner SET display_name = ?, require_totp = ?, session_minutes = ?, autolock_minutes = ?, unlock_mode = ? WHERE id = 1')
    .run(displayName, requireTotp, sessionMinutes, autoLock, unlockMode)
  return { ok: true }
})
