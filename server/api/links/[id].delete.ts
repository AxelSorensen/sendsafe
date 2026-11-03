export default defineEventHandler((event) => {
  requireOwner(event)
  useDb().prepare('UPDATE links SET revoked = 1 WHERE id = ?').run(getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
