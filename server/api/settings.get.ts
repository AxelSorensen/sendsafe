export default defineEventHandler((event) => {
  requireOwner(event)
  const o = getOwner()!
  return { displayName: o.display_name, requireTotp: !!o.require_totp, totpConfirmed: !!o.totp_confirmed, unlockTotp: !!o.require_totp && !!o.totp_confirmed, sessionMinutes: o.session_minutes, onboarded: !!o.onboarded }
})
