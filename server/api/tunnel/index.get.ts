export default defineEventHandler((event) => {
  requireOwner(event)
  return { ...tunnelState(), enabled: !!getOwner()?.sharing_enabled }
})
