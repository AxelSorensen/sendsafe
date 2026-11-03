export default defineEventHandler((event) => {
  requireOwner(event)
  useDb().prepare('UPDATE owner SET sharing_enabled = 0 WHERE id = 1').run()
  stopTunnel()
  return { ...tunnelState(), enabled: false }
})
