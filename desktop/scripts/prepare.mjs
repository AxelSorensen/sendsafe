// Builds the web app in the repo root and stages the Nitro server, and a Node runtime for bundling.
import { execFileSync } from 'node:child_process'
import { cpSync, rmSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs'
import { resolve, join } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const appDir = process.env.SENDSAFE_APP_DIR || resolve(root, '..')
const tauri = join(root, 'src-tauri')

const triple = execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/host: (.+)/)[1].trim()
const exe = triple.includes('windows') ? '.exe' : ''
console.log('target triple:', triple)

console.log('building web app…')
execFileSync('pnpm', ['build'], { cwd: appDir, stdio: 'inherit', shell: process.platform === 'win32' })

const serverDest = join(tauri, 'resources', 'server')
rmSync(serverDest, { recursive: true, force: true })
mkdirSync(serverDest, { recursive: true })
cpSync(join(appDir, '.output'), serverDest, { recursive: true, dereference: true })

const bin = join(tauri, 'binaries')
mkdirSync(bin, { recursive: true })
copyFileSync(process.execPath, join(bin, `node-${triple}${exe}`))

chmodSync(join(bin, `node-${triple}${exe}`), 0o755)
console.log('sidecars ready')
