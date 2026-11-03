import { existsSync } from 'node:fs'

// Pick which account on this computer a request belongs to (cookie set by the login screen). Default: the first one.
export default defineEventHandler((event) => {
  const raw = getCookie(event, 'sd_profile') ?? 'main'
  const id = validProfileId(raw) && (raw === 'main' || existsSync(profileDir(raw))) ? raw : 'main'
  enterProfile(id)
})
