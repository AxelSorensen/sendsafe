export default defineEventHandler(async (event) => {
  requireOwner(event)
  const b = (await readBody(event)) ?? {}
  const hours = Math.min(Math.max(Number(b.expiresInHours) || 24, 1), 24 * 90)
  const maxFiles = Math.min(Math.max(Math.floor(Number(b.maxFiles) || 10), 1), 500)
  const maxMb = Math.min(Math.max(Number(b.maxFileMb) || 100, 1), 500)
  const label = String(b.label ?? '').trim().slice(0, 120)
  useDb().prepare('UPDATE links SET label = COALESCE(NULLIF(?, \'\'), label), expires_at = ?, max_files = ?, max_bytes = ? WHERE id = ? AND revoked = 0')
    .run(label, Date.now() + hours * 3600_000, maxFiles, Math.floor(maxMb * 1024 * 1024), getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
