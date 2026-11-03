export interface LinkRow {
  id: string
  token_enc: string | null
  label: string
  expires_at: number
  max_files: number
  max_bytes: number
  revoked: number
  file_count: number
}

/** Public tunnel base URL (empty = use current origin). */
export const tunnelUrl = ref('')
const base = () => tunnelUrl.value || location.origin

export const linkState = (l: LinkRow) => (l.revoked ? 'revoked' : l.expires_at < Date.now() ? 'expired' : 'active')

export async function createLink(opts: { label: string, expiresInHours: number, maxFiles: number, maxFileMb: number }) {
  const { publicKey } = await $fetch<{ publicKey: string }>('/api/auth/vault')
  const token = randomToken()
  const tokenEnc = await encryptToken(publicKey, token)
  await $fetch('/api/links', { method: 'POST', body: { ...opts, token, tokenEnc } })
  return `${base()}/u/${token}`
}

export async function copyLink(privateKey: CryptoKey, l: LinkRow) {
  if (!l.token_enc) throw new Error('not recoverable')
  const token = await decryptToken(privateKey, l.token_enc)
  const url = `${base()}/u/${token}`
  await navigator.clipboard.writeText(url)
  return url
}
