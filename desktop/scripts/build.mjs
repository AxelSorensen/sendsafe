// Release build. SENDSAFE_RELAY_URL from .env is compiled into the app.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { loadEnv } from './env.mjs'

loadEnv()
const root = resolve(import.meta.dirname, '..')
if (!process.env.SENDSAFE_RELAY_URL) {
  console.error('SENDSAFE_RELAY_URL is missing. Run `pnpm run setup` in ../relay, then put the URL in .env.')
  process.exit(1)
}
execFileSync('node', ['scripts/prepare.mjs'], { cwd: root, stdio: 'inherit' })
execFileSync('pnpm', ['tauri', 'build'], { cwd: root, stdio: 'inherit', env: process.env, shell: process.platform === 'win32' })
