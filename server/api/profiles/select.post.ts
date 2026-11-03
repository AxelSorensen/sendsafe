// Choose which account to log in to.
export default defineEventHandler(async (event) => {
  rateLimit(`profile-select:${clientIp(event)}`, 60, 15 * 60 * 1000)
  const { id } = (await readBody(event)) ?? {}
  if (typeof id !== 'string' || !listAccounts().some(a => a.id === id)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  setCookie(event, 'sd_profile', id, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 365 })
  return { ok: true }
})
