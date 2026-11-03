export default defineEventHandler((event) => {
  const s = getSession(event)
  return {
    setup: !!getOwner(),
    needsSetupToken: !!process.env.SAFEDROP_SETUP_TOKEN,
    authed: !!s?.verified,
    requireTotp: getOwner()?.require_totp !== 0
  }
})
