export default defineNuxtRouteMiddleware(async () => {
  const status = await $fetch<{ authed: boolean, requireTotp: boolean }>('/api/status')
  if (!status.authed) return navigateTo('/login')
  // The unlocked key lives only in memory. If it is gone (app reopened or page reloaded) while the login is still valid,
  // and an authenticator code is required, do a full login again instead of a password-only unlock.
  const { privateKey } = useVault()
  if (!privateKey.value && status.requireTotp) {
    await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    return navigateTo('/login')
  }
})
