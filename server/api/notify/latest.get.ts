import { timingSafeEqual } from 'node:crypto'

// Polled by the desktop shell (Rust) to raise native notifications. Guarded by a shared secret that
// only the shell and this server know; also unreachable over the tunnel (see tunnel-guard).
export default defineEventHandler((event) => {
  const expected = process.env.SAFEDROP_NOTIFY_TOKEN
  const got = getRequestHeader(event, 'x-notify-token') ?? ''
  const ok = !!expected && got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected))
  if (!ok) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const row = useDb().prepare('SELECT COUNT(*) AS n, COALESCE(MAX(created_at), 0) AS latest FROM files').get() as { n: number, latest: number }
  return { count: row.n, latest: row.latest }
})
