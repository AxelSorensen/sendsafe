import { randomUUID } from 'node:crypto'

export default defineEventHandler(async (event) => {
  requireOwner(event)
  const b = (await readBody(event)) ?? {}
  const label = String(b.label ?? '').trim().slice(0, 120)
  const hours = Math.min(Math.max(Number(b.expiresInHours) || 24, 1), 24 * 90)
  const maxFiles = Math.min(Math.max(Math.floor(Number(b.maxFiles) || 10), 1), 500)
  const maxMb = Math.min(Math.max(Number(b.maxFileMb) || 100, 1), 500)
  if (!label) throw createError({ statusCode: 400, statusMessage: 'Label required' })

  // Token is generated in the browser; server stores its hash plus a copy encrypted to the owner's public key.
  const token = String(b.token ?? '')
  const tokenEnc = String(b.tokenEnc ?? '')
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !tokenEnc || tokenEnc.length > 2000) throw createError({ statusCode: 400 })
  const id = randomUUID()
  useDb().prepare(
    `INSERT INTO links (id, token_hash, token_enc, label, expires_at, max_files, max_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, sha256(token), tokenEnc, label, Date.now() + hours * 3600_000, maxFiles, Math.floor(maxMb * 1024 * 1024), Date.now())
  return { id }
})
