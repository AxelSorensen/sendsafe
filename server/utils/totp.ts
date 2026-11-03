import { createHmac, randomBytes } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(str: string): Buffer {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of str.replace(/=+$/, '').toUpperCase()) {
    const idx = ALPHABET.indexOf(ch)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', secret).update(msg).digest()
  const offset = h[h.length - 1]! & 0xf
  const code = ((h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString()
  return code.padStart(6, '0')
}

/** Returns the matching 30s step (for replay protection) or null. Window ±1 step. */
export function verifyTotp(secretB32: string, code: string, lastUsedStep = 0): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const secret = base32Decode(secretB32)
  const now = Math.floor(Date.now() / 30000)
  for (let step = now - 1; step <= now + 1; step++) {
    if (step > lastUsedStep && hotp(secret, step) === code) return step
  }
  return null
}

/** True when the code is a valid one for now (any of the 3 steps), even if it was already used. Lets us say "already used" instead of "wrong". */
export function isValidButUsed(secretB32: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false
  const secret = base32Decode(secretB32)
  const now = Math.floor(Date.now() / 30000)
  for (let step = now - 1; step <= now + 1; step++) if (hotp(secret, step) === code) return true
  return false
}

export function otpauthUri(secretB32: string, name = ''): string {
  const label = encodeURIComponent(name.trim() || 'owner')
  // `image` is read by some authenticator apps (most pick the icon from the issuer name instead).
  const base = process.env.SENDSAFE_RELAY_URL?.replace(/\/+$/, '')
  const image = base ? `&image=${encodeURIComponent(`${base}/apple-touch-icon.png`)}` : ''
  return `otpauth://totp/SendSafe:${label}?secret=${secretB32}&issuer=SendSafe&algorithm=SHA1&digits=6&period=30${image}`
}
