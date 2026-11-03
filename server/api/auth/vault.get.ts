// Public part only. The wrapped private key is handed out by /api/auth/unlock (which can ask for a code first).
export default defineEventHandler((event) => {
  requireOwner(event)
  const owner = getOwner()!
  return { salt: owner.kdf_salt, publicKey: owner.public_key }
})
