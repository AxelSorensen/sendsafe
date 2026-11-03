// Start a new account on this computer: make an empty profile and switch to it. Setup follows.
export default defineEventHandler((event) => {
  rateLimit(`profile-new:${clientIp(event)}`, 10, 60 * 60 * 1000)
  const id = createProfile()
  setCookie(event, 'sd_profile', id, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 365 })
  return { id }
})
