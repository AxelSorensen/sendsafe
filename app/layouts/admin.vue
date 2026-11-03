<script setup lang="ts">
const { privateKey, lock } = useVault()
const unlockPw = ref('')
const error = ref('')
const { tunnel, init: initTunnel, retry: retryTunnel } = useTunnel()
const showTour = ref(false)
onMounted(async () => {
  initTunnel()
  try { showTour.value = !(await $fetch<{ onboarded: boolean }>('/api/settings')).onboarded } catch {}
})
async function finishTour() {
  showTour.value = false
  await $fetch('/api/settings', { method: 'PATCH', body: { onboarded: true } }).catch(() => {})
}
provide('openTour', () => (showTour.value = true))
const isSettings = computed(() => useRoute().path.startsWith('/admin/settings'))

async function unlock() {
  error.value = ''
  try {
    const v = await $fetch<{ salt: string, wrappedPrivateKey: string, wrapIv: string }>('/api/auth/vault')
    const { wrapKey } = await deriveKeys(unlockPw.value, v.salt)
    privateKey.value = await unlockPrivateKey(wrapKey, v.wrappedPrivateKey, v.wrapIv)
    unlockPw.value = ''
  } catch {
    error.value = 'Wrong password.'
  }
}

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  lock()
  await navigateTo('/login')
}

</script>

<template>
  <AuthShell v-if="!privateKey" title="Safe locked" subtitle="Enter your password to unlock your documents.">
    <form class="space-y-4" @submit.prevent="unlock">
      <div>
        <label class="label" for="unlock-pw">Password</label>
        <input id="unlock-pw" v-model="unlockPw" type="password" autocomplete="current-password" class="field" autofocus required>
      </div>
      <p v-if="error" class="alert-error">{{ error }}</p>
      <button class="btn w-full">Unlock</button>
      <button type="button" class="btn-ghost w-full" @click="logout">Log out</button>
    </form>
  </AuthShell>

  <div v-else class="flex min-h-[calc(100vh-var(--titlebar,0px))] flex-col md:h-[calc(100vh-var(--titlebar,0px))] md:flex-row md:overflow-hidden">
    <aside v-if="!isSettings" class="flex shrink-0 flex-col gap-2 bg-slate-100 p-3 md:gap-4 md:p-4 md:sticky md:top-[var(--titlebar,0px)] md:h-[calc(100vh-var(--titlebar,0px))] md:w-60">
      <div class="px-2 py-1"><BrandLogo /></div>
      <nav class="flex flex-row gap-1 md:flex-1 md:flex-col">
        <NuxtLink to="/admin" class="btn-ghost !justify-start gap-3 " active-class="!bg-brand-100 !text-brand-700 font-semibold" exact>
          <svg viewBox="0 0 24 24" class="size-5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.5-6.9A2 2 0 0016.8 4H7.2a2 2 0 00-1.7 1.1z" /></svg>
          Inbox
        </NuxtLink>
      </nav>
      <div class="flex items-center gap-2 px-2 text-xs text-slate-600" :title="tunnel.status === 'running' ? tunnel.url : tunnel.error">
        <span class="size-2 shrink-0 rounded-full" :class="!tunnel.enabled ? 'bg-slate-400' : tunnel.status === 'running' ? 'bg-green-500' : tunnel.status === 'error' ? 'bg-red-500' : 'animate-pulse bg-amber-500'" />
        <span v-if="!tunnel.enabled">Sharing server off</span>
        <span v-else-if="tunnel.status === 'running'">Public link online</span>
        <span v-else-if="tunnel.status === 'error'">Public link failed · <button class="underline" @click="retryTunnel">retry</button></span>
        <span v-else>Connecting public link…</span>
      </div>
      <div class="flex flex-row gap-2 md:flex-col">
          <NuxtLink to="/admin/settings" class="inline-flex w-full flex-1 items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50" active-class="!bg-brand-100 !text-brand-700">Settings
          </NuxtLink>
          <button class="btn w-full flex-1" @click="logout">Log out</button>
      </div>
    </aside>
    <Onboarding v-if="showTour && privateKey" @done="finishTour" />
    <main class="flex min-h-0 min-w-0 flex-1 flex-col p-4 md:p-6">
      <div class="flex min-h-0 flex-1 flex-col gap-6" :class="isSettings ? 'mx-auto w-full max-w-2xl' : ''">
        <NuxtLink v-if="isSettings" to="/admin" class="btn-ghost shrink-0 self-start !px-3">
          <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          Back to inbox
        </NuxtLink>
        <!-- Padding + negative margin give the flashing ring room inside the scroll container so it is not clipped. -->
        <div v-if="isSettings" class="-mx-3 min-h-0 flex-1 overflow-y-auto px-3 py-2"><slot /></div>
        <slot v-else />
      </div>
    </main>
  </div>
</template>
