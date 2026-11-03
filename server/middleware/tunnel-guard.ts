// Requests arriving through the Cloudflare tunnel carry a `cf-ray` header.
// Over the tunnel, expose only the uploader page and its API. Owner login/admin stay local-only.
const ALLOWED = [/^\/u\/[A-Za-z0-9_-]+\/?$/, /^\/api\/upload\//, /^\/_nuxt\//, /^\/favicon\.ico$/, /^\/robots\.txt$/]

export default defineEventHandler((event) => {
  if (!getRequestHeader(event, 'cf-ray')) return
  const path = getRequestURL(event).pathname
  if (ALLOWED.some(r => r.test(path))) return
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
})
