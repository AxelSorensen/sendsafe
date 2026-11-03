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
// Planned sections, shown greyed out until they exist.
const soon = [
  { label: 'Messages', icon: ['M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z'] },
  { label: 'Connections', icon: ['M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2', 'M9 11a4 4 0 100-8 4 4 0 000 8z', 'M23 21v-2a4 4 0 00-3-3.87', 'M16 3.13a4 4 0 010 7.75'] }
]
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

  <div v-else class="flex h-[calc(100dvh-var(--titlebar,0px))] flex-col overflow-hidden lg:flex-row">
    <aside v-if="!isSettings" class="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 bg-slate-100 px-3 py-2 lg:w-60 lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-4 lg:p-4">
      <div class="shrink-0 px-2 py-1"><BrandLogo /></div>
      <!-- Narrow window: tabs become a phone-style bar fixed to the bottom. -->
      <nav class="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:static lg:flex-1 lg:flex-col lg:gap-1 lg:border-0 lg:bg-transparent lg:pb-0">
        <NuxtLink to="/admin" class="btn-ghost flex-1 flex-col !gap-0.5 !rounded-none !py-2 !text-[11px] lg:flex-none lg:flex-row lg:!justify-start lg:!gap-3 lg:!rounded-lg lg:!py-2.5 lg:!text-sm" active-class="!bg-brand-100 !text-brand-700 font-semibold" exact>
          <svg viewBox="0 0 24 24" class="size-5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.5-6.9A2 2 0 0016.8 4H7.2a2 2 0 00-1.7 1.1z" /></svg>
          Inbox
        </NuxtLink>
        <span
          v-for="t in soon" :key="t.label"
          class="btn-ghost cursor-not-allowed flex-1 flex-col !gap-0.5 !rounded-none !py-2 !text-[11px] lg:flex-none lg:flex-row lg:!justify-start lg:!gap-3 lg:!rounded-lg lg:!py-2.5 lg:!text-sm !text-slate-400 hover:!bg-transparent hover:!text-slate-400"
          aria-disabled="true" :title="`${t.label}: coming soon`"
        >
          <svg viewBox="0 0 24 24" class="size-5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path v-for="d in t.icon" :key="d" :d="d" /></svg>
          <span>{{ t.label }}</span>
          <span class="ml-auto hidden rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 lg:inline">Soon</span>
        </span>
      </nav>
      <div class="ml-auto flex shrink-0 items-center gap-2 px-2 text-xs text-slate-600 lg:ml-0" :title="tunnel.status === 'running' ? tunnel.url : tunnel.error">
        <span class="size-2 shrink-0 rounded-full" :class="!tunnel.enabled ? 'bg-slate-400' : tunnel.status === 'running' ? 'bg-brand-500' : tunnel.status === 'error' ? 'bg-red-500' : 'animate-pulse bg-slate-400'" />
        <span class="hidden sm:inline" v-if="!tunnel.enabled">Sharing server off</span>
        <span class="hidden sm:inline" v-else-if="tunnel.status === 'running'">Public link online</span>
        <span class="hidden sm:inline" v-else-if="tunnel.status === 'error'">Public link failed · <button class="underline" @click="retryTunnel">retry</button></span>
        <span class="hidden sm:inline" v-else>Connecting public link…</span>
      </div>
      <!-- Narrow window: two small icon buttons in the top bar. -->
      <div class="flex shrink-0 items-center gap-0.5 lg:hidden">
        <NuxtLink to="/admin/settings" class="btn-ghost !p-2" title="Settings" aria-label="Settings">
          <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>
        </NuxtLink>
        <button type="button" class="btn-ghost !p-2" title="Log out" aria-label="Log out" @click="logout">
          <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
        </button>
      </div>
      <!-- Wide window: full buttons in the sidebar. -->
      <div class="hidden shrink-0 flex-col gap-2 lg:flex">
        <NuxtLink to="/admin/settings" class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50" active-class="!bg-brand-100 !text-brand-700">Settings</NuxtLink>
        <button class="btn w-full" @click="logout">Log out</button>
      </div>
    </aside>
    <Onboarding v-if="showTour && privateKey" @done="finishTour" />
    <main class="flex min-h-0 min-w-0 flex-1 flex-col p-4 pb-20 lg:p-6">
      <div class="flex min-h-0 flex-1 flex-col gap-6">
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
