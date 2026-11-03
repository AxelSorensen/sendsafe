export default defineEventHandler((event) => {
  requireOwner(event)
  return useDb().prepare(
    `SELECT l.id, l.token_enc, l.label, l.expires_at, l.max_files, l.max_bytes, l.revoked, l.created_at,
            (SELECT COUNT(*) FROM files f WHERE f.link_id = l.id) AS file_count
     FROM links l ORDER BY l.created_at DESC`
  ).all()
})
