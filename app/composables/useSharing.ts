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

/** The full link for an existing sharing link (decrypted with your key). */
export async function linkUrl(privateKey: CryptoKey, l: LinkRow) {
  if (!l.token_enc) throw new Error('not recoverable')
  return `${base()}/u/${await decryptToken(privateKey, l.token_enc)}`
}

/** Put text on the clipboard. Tries the modern API, then the old selection trick (some desktop webviews refuse the first). */
export async function writeClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch { return false }
}

export async function copyLink(privateKey: CryptoKey, l: LinkRow) {
  const url = await linkUrl(privateKey, l)
  if (!(await writeClipboard(url))) throw new Error('clipboard blocked')
  return url
}
