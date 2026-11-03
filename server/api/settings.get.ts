export default defineEventHandler((event) => {
  requireOwner(event)
  const o = getOwner()!
  return { displayName: o.display_name, requireTotp: !!o.require_totp, sessionHours: o.session_hours, onboarded: !!o.onboarded }
})
