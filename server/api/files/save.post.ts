import { existsSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join, parse } from 'node:path'

// Desktop app only: saves an already decrypted file into ~/Downloads/SendSafe and says where it went.

export default defineEventHandler(async (event) => {
  requireOwner(event)
  rateLimit(`save:${clientIp(event)}`, 120, 15 * 60 * 1000)
  let name = ''
  try { name = decodeURIComponent(String(getHeader(event, 'x-name') ?? '')) } catch { /* bad header */ }
  // Keep a plain file name: no folders, no control characters, no leading dots.
  name = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^[.\s]+/, '').slice(0, 150) || 'file'
  const body = await readRawBody(event, false)
  if (!body) throw createError({ statusCode: 400, statusMessage: 'No file data.' })
  const dir = downloadsDir()
  mkdirSync(dir, { recursive: true })
  const { name: base, ext } = parse(name)
  let path = join(dir, name)
  for (let n = 2; existsSync(path); n++) path = join(dir, `${base} (${n})${ext}`)
  await writeFile(path, body, { flag: 'wx' })
  return { path, dir }
})
