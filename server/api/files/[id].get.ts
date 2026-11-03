import { createReadStream, existsSync } from 'node:fs'
import { join } from 'node:path'

export default defineEventHandler((event) => {
  requireOwner(event)
  const id = getRouterParam(event, 'id') ?? ''
  const row = useDb().prepare('SELECT id FROM files WHERE id = ?').get(id)
  const path = join(FILES_DIR, `${id}.bin`)
  if (!row || !existsSync(path)) throw createError({ statusCode: 404 })
  setHeader(event, 'content-type', 'application/octet-stream')
  setHeader(event, 'cache-control', 'no-store')
  return sendStream(event, createReadStream(path))
})
