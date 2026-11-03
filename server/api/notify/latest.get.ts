import { timingSafeEqual } from 'node:crypto'

// Polled by the desktop shell (Rust) to raise native notifications. Guarded by a shared secret that
// only the shell and this server know; also unreachable over the tunnel (see tunnel-guard).
// Counts files across every account on this computer, so a new file in any of them rings.
export default defineEventHandler((event) => {
  const expected = process.env.SENDSAFE_NOTIFY_TOKEN
  const got = getRequestHeader(event, 'x-notify-token') ?? ''
  const ok = !!expected && got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected))
  if (!ok) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  let count = 0
  let latest = 0
  for (const a of listAccounts()) {
    const row = useDb(a.id).prepare('SELECT COUNT(*) AS n, COALESCE(MAX(created_at), 0) AS latest FROM files').get() as { n: number, latest: number }
    count += row.n
    latest = Math.max(latest, row.latest)
  }
  return { count, latest }
})
