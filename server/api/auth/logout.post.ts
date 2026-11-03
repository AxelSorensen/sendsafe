export default defineEventHandler((event) => {
  destroySessions(event)
  return { ok: true }
})
