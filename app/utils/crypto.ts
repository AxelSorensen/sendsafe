// All WebCrypto. Files are encrypted in the uploader's browser with a per-file AES-256-GCM key,
// which is wrapped with the owner's RSA-OAEP public key. The server only stores ciphertext.
const enc = new TextEncoder()
const dec = new TextDecoder()
const subtle = () => globalThis.crypto.subtle

export const KDF_ITERATIONS = 600_000

export function b64(buf: ArrayBuffer | Uint8Array): string {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}

export function unb64(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0))
}

const rand = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n))

/** One password -> two independent secrets: a wrap key (never leaves browser) and an auth secret (sent to server). */
export async function deriveKeys(password: string, saltB64: string) {
  const base = await subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: KDF_ITERATIONS },
    base,
    512
  )
  const wrapKey = await subtle().importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt'])
  return { wrapKey, authSecret: b64(bits.slice(32)) }
}

export async function createOwnerVault(password: string) {
  const kdfSalt = b64(rand(16))
  const { wrapKey, authSecret } = await deriveKeys(password, kdfSalt)
  const pair = await subtle().generateKey(
    { name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt']
  )
  const publicKey = b64(await subtle().exportKey('spki', pair.publicKey))
  const pkcs8 = await subtle().exportKey('pkcs8', pair.privateKey)
  const iv = rand(12)
  const wrapped = await subtle().encrypt({ name: 'AES-GCM', iv }, wrapKey, pkcs8)
  return { kdfSalt, authSecret, publicKey, wrappedPrivateKey: b64(wrapped), wrapIv: b64(iv) }
}

export async function unlockPrivateKey(wrapKey: CryptoKey, wrappedPrivateKey: string, wrapIv: string) {
  const pkcs8 = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(wrapIv) }, wrapKey, unb64(wrappedPrivateKey))
  return subtle().importKey('pkcs8', pkcs8, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt'])
}

export interface EncHeader { iv: string, metaIv: string, meta: string, key: string }

export async function encryptFile(file: File, publicKeyB64: string) {
  const pub = await subtle().importKey('spki', unb64(publicKeyB64), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'])
  const aes = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
  const iv = rand(12)
  const metaIv = rand(12)
  const cipher = await subtle().encrypt({ name: 'AES-GCM', iv }, aes, await file.arrayBuffer())
  const meta = await subtle().encrypt(
    { name: 'AES-GCM', iv: metaIv },
    aes,
    enc.encode(JSON.stringify({ name: file.name, type: file.type, size: file.size }))
  )
  const key = await subtle().encrypt({ name: 'RSA-OAEP' }, pub, await subtle().exportKey('raw', aes))
  const header: EncHeader = { iv: b64(iv), metaIv: b64(metaIv), meta: b64(meta), key: b64(key) }
  return { cipher, header: btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
}

function parseHeader(h: string): EncHeader {
  return JSON.parse(atob(h.replace(/-/g, '+').replace(/_/g, '/')))
}

async function fileKey(privateKey: CryptoKey, h: EncHeader) {
  const raw = await subtle().decrypt({ name: 'RSA-OAEP' }, privateKey, unb64(h.key))
  return subtle().importKey('raw', raw, 'AES-GCM', false, ['decrypt'])
}

export async function decryptMeta(privateKey: CryptoKey, encHeader: string) {
  const h = parseHeader(encHeader)
  const aes = await fileKey(privateKey, h)
  const plain = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(h.metaIv) }, aes, unb64(h.meta))
  return JSON.parse(dec.decode(plain)) as { name: string, type: string, size: number }
}

export async function decryptFile(privateKey: CryptoKey, encHeader: string, cipher: ArrayBuffer) {
  const h = parseHeader(encHeader)
  const aes = await fileKey(privateKey, h)
  return subtle().decrypt({ name: 'AES-GCM', iv: unb64(h.iv) }, aes, cipher)
}

export async function encryptToken(publicKeyB64: string, token: string) {
  const pub = await subtle().importKey('spki', unb64(publicKeyB64), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'])
  return b64(await subtle().encrypt({ name: 'RSA-OAEP' }, pub, enc.encode(token)))
}

export async function decryptToken(privateKey: CryptoKey, tokenEnc: string) {
  return dec.decode(await subtle().decrypt({ name: 'RSA-OAEP' }, privateKey, unb64(tokenEnc)))
}

export function randomToken() {
  return b64(rand(32)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const CODE_STEP_MS = 30_000

/** 6-digit verification code, rotating every 30 s. Derived from the public key + time window, so sender and owner see the same code only for the same key. */
export async function keyCode(publicKeyB64: string, nowMs = Date.now()) {
  const window = Math.floor(nowMs / CODE_STEP_MS)
  const d = new Uint8Array(await subtle().digest('SHA-256', new TextEncoder().encode(`${publicKeyB64}:${window}`)))
  const n = ((d[0]! << 24) | (d[1]! << 16) | (d[2]! << 8) | d[3]!) >>> 0
  const c = String(n % 1_000_000).padStart(6, '0')
  return `${c.slice(0, 3)} ${c.slice(3)}`
}
