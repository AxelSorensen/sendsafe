// Loads ../.env (KEY=value lines) into process.env without overriding values already set.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function loadEnv() {
  const file = resolve(import.meta.dirname, '..', '.env')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
