export default defineEventHandler((event) => {
  requireOwner(event)
  const o = getOwner()!
  return { displayName: o.display_name, requireTotp: !!o.require_totp, totpConfirmed: !!o.totp_confirmed, autoLockMinutes: o.autolock_minutes, unlockMode: o.totp_confirmed ? o.unlock_mode : 'password', sessionMinutes: o.session_minutes, onboarded: !!o.onboarded }
})
