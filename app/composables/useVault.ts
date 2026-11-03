// Private key lives only in memory; a page reload requires the password again.
const privateKey = shallowRef<CryptoKey | null>(null)

export function useVault() {
  return {
    privateKey,
    lock: () => { privateKey.value = null }
  }
}
