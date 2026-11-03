export default defineEventHandler((event) => {
  const s = getSession(event)
  return {
    setup: !!getOwner()?.totp_enabled,
    needsSetupToken: !!process.env.SENDSAFE_SETUP_TOKEN,
    authed: !!s?.verified,
    requireTotp: getOwner()?.require_totp !== 0
  }
})
