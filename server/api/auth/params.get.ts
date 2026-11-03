// Step one of login: find the account for an email and say what it needs (salt for the password, and whether a code is required).
export default defineEventHandler((event) => {
  rateLimit(`params:${clientIp(event)}`, 60, 15 * 60 * 1000)
  const id = findProfileByEmail(String(getQuery(event).email ?? ''))
  if (!id) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  setCookie(event, 'sd_profile', id, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 365 })
  return runAsProfile(id, () => {
    const o = getOwner()!
    return { salt: o.kdf_salt, requireTotp: o.require_totp !== 0 }
  })
})
