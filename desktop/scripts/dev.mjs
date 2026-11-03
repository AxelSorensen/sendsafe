// Dev: run `nuxt dev` (hot reload) from the repo root and open it in a Tauri window.
import { spawn, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'
import net from 'node:net'
import { randomBytes } from 'node:crypto'

import { loadEnv } from './env.mjs'
loadEnv()
const root = resolve(import.meta.dirname, '..')
const appDir = process.env.SENDSAFE_APP_DIR || resolve(root, '..')
const PORT = Number(process.env.SENDSAFE_DEV_PORT || 3100)
const dataDir = process.env.SENDSAFE_DATA_DIR
  || join(homedir(), 'Library/Application Support/com.sendsafe.desktop/sendsafe')

// Tauri needs the sidecar binaries to exist at build time. Stage them once.
const triple = execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/host: (.+)/)[1].trim()
if (!existsSync(join(root, 'src-tauri/binaries', `node-${triple}`))) {
  execFileSync('node', ['scripts/prepare.mjs'], { cwd: root, stdio: 'inherit' })
}

const notifyToken = randomBytes(16).toString('hex')
const nuxt = spawn('pnpm', ['nuxt', 'dev', '--port', String(PORT), '--host', '127.0.0.1'], {
  cwd: appDir,
  stdio: 'inherit',
  env: { ...process.env, SENDSAFE_NOTIFY_TOKEN: notifyToken, PORT: String(PORT), NITRO_PORT: String(PORT), NUXT_PORT: String(PORT), SENDSAFE_DATA_DIR: dataDir, SENDSAFE_TRUST_PROXY: '1', NUXT_IGNORE_LOCK: '1' }
})

let tauri
const stop = (code = 0) => {
  nuxt.kill('SIGTERM')
  tauri?.kill('SIGTERM')
  process.exit(code)
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
nuxt.on('exit', code => stop(code ?? 1))

const waitPort = () => new Promise((ok) => {
  const t = setInterval(() => {
    const s = net.connect(PORT, '127.0.0.1')
    s.on('connect', () => { s.destroy(); clearInterval(t); ok() })
    s.on('error', () => s.destroy())
  }, 400)
})
await waitPort()

tauri = spawn('pnpm', ['tauri', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, SENDSAFE_NOTIFY_TOKEN: notifyToken, SENDSAFE_DEV_URL: `http://127.0.0.1:${PORT}` }
})
tauri.on('exit', code => stop(code ?? 0))
