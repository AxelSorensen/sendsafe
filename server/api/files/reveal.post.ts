import { spawn } from 'node:child_process'
import { dirname, resolve, sep } from 'node:path'

// Opens the folder of a file that was saved by this app. Only paths inside the SendSafe downloads folder are accepted.
export default defineEventHandler(async (event) => {
  requireOwner(event)
  const { path } = (await readBody(event)) ?? {}
  const root = resolve(downloadsDir())
  const p = resolve(String(path ?? ''))
  if (!p.startsWith(root + sep)) throw createError({ statusCode: 400, statusMessage: 'Not a saved file.' })
  const [cmd, args] = process.platform === 'darwin' ? ['open', ['-R', p]]
    : process.platform === 'win32' ? ['explorer.exe', [`/select,${p}`]]
      : ['xdg-open', [dirname(p)]]
  const child = spawn(cmd as string, args as string[], { detached: true, stdio: 'ignore' })
  child.on('error', () => {})
  child.unref()
  return { ok: true }
})
