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
  // Turning a second step off (login code, or code-based unlock) needs one valid code first, so a stolen session cannot weaken 2FA.
  const weakening = !!o.totp_confirmed && ((o.require_totp && !requireTotp) || (o.unlock_mode !== 'password' && unlockMode === 'password'))
  let usedStep = 0
  if (weakening) {
    rateLimit(`settings-totp:${clientIp(event)}`, 10, 15 * 60 * 1000)
    const code = String(b.code ?? '')
    usedStep = verifyTotp(o.totp_secret, code, o.totp_last_step) || 0
    if (!usedStep) throw createError({ statusCode: 400, statusMessage: isValidButUsed(o.totp_secret, code) ? 'Code already used' : 'Invalid code' })
  }
  const sessionMinutes = b.sessionMinutes === undefined ? o.session_minutes : Math.min(Math.max(Math.floor(Number(b.sessionMinutes) || 720), 1), 60 * 24 * 30)
  if (typeof b.onboarded === 'boolean') useDb().prepare('UPDATE owner SET onboarded = ? WHERE id = 1').run(b.onboarded ? 1 : 0)
  useDb().prepare('UPDATE owner SET display_name = ?, require_totp = ?, session_minutes = ?, autolock_minutes = ?, unlock_mode = ? WHERE id = 1')
    .run(displayName, requireTotp, sessionMinutes, autoLock, unlockMode)
  if (usedStep) useDb().prepare('UPDATE owner SET totp_last_step = ? WHERE id = 1').run(usedStep)
  return { ok: true }
})
