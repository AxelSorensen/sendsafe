export default defineEventHandler(() => {
  const owner = getOwner()
  if (!owner) throw createError({ statusCode: 404 })
  return { salt: owner.kdf_salt }
})
