export default defineNuxtRouteMiddleware(async () => {
  const status = await $fetch<{ authed: boolean }>('/api/status')
  if (!status.authed) return navigateTo('/login')
})
