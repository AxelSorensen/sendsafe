export default defineEventHandler((event) => {
  requireOwner(event)
  const o = getOwner()!
  return { displayName: o.display_name, requireTotp: !!o.require_totp, sessionMinutes: o.session_minutes, onboarded: !!o.onboarded }
})
