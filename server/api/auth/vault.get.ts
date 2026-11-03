export default defineEventHandler((event) => {
  requireOwner(event)
  const owner = getOwner()!
  return { salt: owner.kdf_salt, publicKey: owner.public_key, wrappedPrivateKey: owner.wrapped_private_key, wrapIv: owner.wrap_iv }
})
