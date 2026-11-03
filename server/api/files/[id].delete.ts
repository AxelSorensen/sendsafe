import { rm } from 'node:fs/promises'
import { join } from 'node:path'

export default defineEventHandler(async (event) => {
  requireOwner(event)
  const id = getRouterParam(event, 'id') ?? ''
  const res = useDb().prepare('DELETE FROM files WHERE id = ?').run(id)
  if (res.changes) await rm(join(FILES_DIR, `${id}.bin`), { force: true })
  return { ok: true }
})
