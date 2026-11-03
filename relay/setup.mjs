// One-shot relay setup/deploy. Usage: `pnpm run setup` (first time) or `pnpm run redeploy` (update code only).
// Needs a free Cloudflare account. Run `npx wrangler login` once first.
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const here = import.meta.dirname
const app = resolve(here, '..')
const deployOnly = process.argv.includes('--deploy-only')
const BUCKET = 'sendsafe-files'
const DB = 'sendsafe-relay'

const run = (args, opts = {}) => spawnSync('npx', ['wrangler', ...args], { cwd: here, encoding: 'utf8', ...opts })
const must = (r, what) => {
  if (r.status !== 0) {
    console.error(`\n${what} failed:\n${(r.stderr || '') + (r.stdout || '')}`)
    process.exit(1)
  }
  return (r.stdout || '') + (r.stderr || '')
}

const who = run(['whoami'])
if (who.status !== 0 || /not authenticated/i.test(who.stdout + who.stderr)) {
  console.error('Not logged in to Cloudflare. Run:  npx wrangler login   then try again.')
  process.exit(1)
}

console.log('Building the web app…')
execFileSync('pnpm', ['generate'], { cwd: app, stdio: 'inherit' })
rmSync(resolve(here, 'public'), { recursive: true, force: true })
cpSync(resolve(app, '.output/public'), resolve(here, 'public'), { recursive: true, dereference: true })

const cfgPath = resolve(here, 'wrangler.jsonc')
let cfg = readFileSync(cfgPath, 'utf8')

if (!deployOnly) {
  console.log('Creating the file bucket…')
  const b = run(['r2', 'bucket', 'create', BUCKET])
  const bt = b.stdout + b.stderr
  if (/10042|enable R2/i.test(bt)) {
    console.error('\nR2 is not enabled on your Cloudflare account yet.\nOpen https://dash.cloudflare.com, click "R2 Object Storage" in the left menu, and press the enable/purchase button.\nThe free plan costs nothing but asks for a card. Then run this setup again.')
    process.exit(1)
  }
  if (b.status !== 0 && !/already exists/i.test(bt)) must(b, 'Creating the R2 bucket')

  console.log('Creating the database…')
  let id = cfg.match(/"database_id":\s*"([0-9a-f-]{36})"/)?.[1]
  if (!id) {
    const out = run(['d1', 'create', DB])
    const text = out.stdout + out.stderr
    id = text.match(/"?database_id"?\s*[:=]\s*"?([0-9a-f-]{36})/)?.[1]
    if (!id) {
      const list = must(run(['d1', 'list', '--json']), 'Listing databases')
      id = JSON.parse(list).find(d => d.name === DB)?.uuid
    }
    if (!id) { console.error('Could not determine the database id.'); process.exit(1) }
    cfg = cfg.replace(/"database_id":\s*"[^"]*"/, `"database_id": "${id}"`)
    writeFileSync(cfgPath, cfg)
  }
}

console.log('Applying database migrations…')
must(run(['d1', 'migrations', 'apply', DB, '--remote']), 'Migrations')

console.log('Deploying…')
const dep = run(['deploy'])
const out = (dep.stdout || '') + (dep.stderr || '')
const url = out.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)?.[0]
if (!url && /workers\.dev subdomain/i.test(out)) {
  console.error(`
Your Cloudflare account has no workers.dev name yet. This is a one-time question that needs a real terminal:
  1. Open the Terminal app and run:  cd ${here} && npx wrangler deploy
  2. Answer "yes" to registering a workers.dev subdomain and pick a name (letters and numbers).
  3. Then run:  pnpm run setup   again from here.`)
  process.exit(1)
}
if (dep.status !== 0) must(dep, 'Deploy')

// Write the address where the desktop build picks it up. Users sign themselves up; there is no shared secret.
let saved = false
if (url) {
  const desktop = process.env.SENDSAFE_DESKTOP_DIR || resolve(app, 'desktop')
  if (existsSync(desktop)) {
    writeFileSync(resolve(desktop, '.env'), `SENDSAFE_RELAY_URL=${url}\n`, { mode: 0o600 })
    saved = true
    console.log(`Saved to ${resolve(desktop, '.env')}. Rebuild the desktop app to use it.`)
  }
}

console.log('\nDone.')
if (url) console.log(`Relay address: ${url}`)
if (!saved) console.log('Put this line in the desktop app\'s .env file:  SENDSAFE_RELAY_URL=' + (url ?? ''))
