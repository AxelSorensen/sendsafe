import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  rateLimit(`up:${clientIp(event)}`, 60, 10 * 60 * 1000)
  const link = findActiveLink(token)
  if (!link) throw createError({ statusCode: 404, statusMessage: 'Link invalid or expired' })

  const db = useDb()
  const used = (db.prepare('SELECT COUNT(*) AS n FROM files WHERE link_id = ?').get(link.id) as { n: number }).n
  if (used >= link.max_files) throw createError({ statusCode: 409, statusMessage: 'File limit reached' })

  const limit = link.max_bytes + 1024 // AES-GCM tag + slack
  const declared = Number(getHeader(event, 'content-length') ?? 0)
  if (declared > limit) throw createError({ statusCode: 413, statusMessage: 'File too large' })

  // Opaque encrypted blob: {iv, metaIv, meta, key}. Server never sees plaintext.
  const encHeader = getHeader(event, 'x-enc') ?? ''
  if (!encHeader || encHeader.length > 4000) throw createError({ statusCode: 400 })
  try {
    const parsed = JSON.parse(Buffer.from(encHeader, 'base64url').toString())
    for (const k of ['iv', 'metaIv', 'meta', 'key']) if (typeof parsed[k] !== 'string') throw new Error()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Bad metadata' })
  }

  const id = randomUUID()
  const path = join(filesDir(), `${id}.bin`)
  let size = 0
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length
      if (size > limit) cb(new Error('too large'))
      else cb(null, chunk)
    }
  })
  try {
    await pipeline(event.node.req, counter, createWriteStream(path, { mode: 0o600 }))
  } catch {
    await rm(path, { force: true })
    throw createError({ statusCode: 413, statusMessage: 'Upload failed' })
  }
  if (size === 0) {
    await rm(path, { force: true })
    throw createError({ statusCode: 400, statusMessage: 'Empty upload' })
  }
  db.prepare('INSERT INTO files (id, link_id, enc, size, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, link.id, encHeader, size, Date.now())
  // Receipt: the client compares `size` with what it sent before calling the transfer a success.
  return { ok: true, id, size }
})
