export default defineEventHandler((event) => {
  rateLimit(`up-info:${clientIp(event)}`, 60, 10 * 60 * 1000)
  const link = findActiveLink(getRouterParam(event, 'token') ?? '')
  const owner = getOwner()
  if (!link || !owner) throw createError({ statusCode: 404, statusMessage: 'Link invalid or expired' })
  const used = (useDb().prepare('SELECT COUNT(*) AS n FROM files WHERE link_id = ?').get(link.id) as { n: number }).n
  return {
    label: link.label,
    ownerName: owner.display_name,
    publicKey: owner.public_key,
    filesLeft: Math.max(link.max_files - used, 0),
    maxFileBytes: link.max_bytes,
    expiresAt: link.expires_at,
    now: Date.now()
  }
})
