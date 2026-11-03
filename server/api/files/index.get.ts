export default defineEventHandler((event) => {
  requireOwner(event)
  return useDb().prepare(
    `SELECT f.id, f.enc, f.size, f.created_at, l.label AS link_label
     FROM files f JOIN links l ON l.id = f.link_id ORDER BY f.created_at DESC`
  ).all()
})
