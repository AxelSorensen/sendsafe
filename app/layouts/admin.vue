<script setup lang="ts">
const { privateKey, lock } = useVault()
const unlockPw = ref('')
const unlockCode = ref('')
const needUnlockCode = ref(false)
const error = ref('')
const { tunnel, init: initTunnel, retry: retryTunnel } = useTunnel()
const showTour = ref(false)
// When the login time runs out, lock the screen (the unlocked key only lives in this window's memory).
let expiryTimer: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  expiryTimer = setInterval(async () => {
    if (!privateKey.value) return
    try {
      const st = await $fetch<{ authed: boolean }>('/api/status')
      if (!st.authed) { lock(); location.assign('/login') }
    } catch { /* offline: try again next tick */ }
  }, 5000)
  initTunnel()
  try { showTour.value = !(await $fetch<{ onboarded: boolean }>('/api/settings')).onboarded } catch {}
})
async function finishTour() {
  showTour.value = false
  await $fetch('/api/settings', { method: 'PATCH', body: { onboarded: true } }).catch(() => {})
}
onBeforeUnmount(() => clearInterval(expiryTimer))
provide('openTour', () => (showTour.value = true))
// ---- Auto-lock after inactivity, with a short warning ----
const autoLockMin = ref(0)
const countdown = ref(0) // seconds left in the warning; 0 = no warning showing
let lastActive = Date.now()
let idleTimer: ReturnType<typeof setInterval> | undefined
let warnTimer: ReturnType<typeof setInterval> | undefined
const WARN_SECONDS = 5
const loadAutoLock = async () => {
  try { autoLockMin.value = (await $fetch<{ autoLockMinutes: number }>('/api/settings')).autoLockMinutes } catch { /* keep current */ }
}
const markActive = () => { if (!countdown.value) lastActive = Date.now() }
function stopWarning() { clearInterval(warnTimer); countdown.value = 0 }
function keepUsing() { stopWarning(); lastActive = Date.now() }
function lockNow() { stopWarning(); lastActive = Date.now(); lock() }
function startWarning() {
  countdown.value = WARN_SECONDS
  warnTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) lockNow()
  }, 1000)
}
const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const
onMounted(() => {
  loadAutoLock()
  ACTIVITY.forEach(e => window.addEventListener(e, markActive, { passive: true }))
  idleTimer = setInterval(() => {
    if (!privateKey.value || !autoLockMin.value || countdown.value) return
    if (Date.now() - lastActive >= autoLockMin.value * 60_000 - WARN_SECONDS * 1000) startWarning()
  }, 1000)
})
onBeforeUnmount(() => {
  clearInterval(idleTimer)
  clearInterval(warnTimer)
  ACTIVITY.forEach(e => window.removeEventListener(e, markActive))
})
// Settings may have changed the delay: pick it up when you leave the settings page.
const route = useRoute()
watch(() => route.path, loadAutoLock)

// Locking forgets the key in this window but keeps you logged in; unlock with your password.
function lockSafe() { lock() }
// Planned sections, shown greyed out until they exist.
const soon = [
  { label: 'Messages', icon: ['M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z'] },
  { label: 'Connections', icon: ['M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2', 'M9 11a4 4 0 100-8 4 4 0 000 8z', 'M23 21v-2a4 4 0 00-3-3.87', 'M16 3.13a4 4 0 010 7.75'] }
]
const isSettings = computed(() => useRoute().path.startsWith('/admin/settings'))

// When the safe is locked, find out whether this account wants a code to unlock it.
watch(privateKey, async (k) => {
  if (k) return
  try { needUnlockCode.value = (await $fetch<{ unlockTotp: boolean }>('/api/settings')).unlockTotp } catch { needUnlockCode.value = false }
}, { immediate: true })

async function unlock() {
  error.value = ''
  try {
    const v = await $fetch<{ salt: string, wrappedPrivateKey: string, wrapIv: string }>('/api/auth/unlock', { method: 'POST', body: { code: unlockCode.value } })
    const { wrapKey } = await deriveKeys(unlockPw.value, v.salt)
    privateKey.value = await unlockPrivateKey(wrapKey, v.wrappedPrivateKey, v.wrapIv)
    unlockPw.value = ''
    unlockCode.value = ''
  } catch (e: any) {
    error.value = e?.data?.statusMessage === 'Invalid code' ? 'That code is not right.' : 'Wrong password.'
  }
}

// Show a short "Signing out" screen so the switch to the login page is not abrupt.
const signingOut = ref(false)
async function logout() {
  signingOut.value = true
  await Promise.all([$fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}), new Promise(r => setTimeout(r, 900))])
  lock()
  // Signing out means a clean login screen: forget the remembered email too.
  try { localStorage.removeItem('sendsafe-last-email') } catch { /* storage unavailable */ }
  location.assign('/login')
}
provide('signOut', logout)

</script>

<template>
  <!-- Locked: a soft blue screen with a padlock that clicks shut when you arrive here. -->
  <main v-if="!privateKey" class="lock-screen fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-gradient-to-br from-brand-50 to-brand-100 px-4 py-10">
    <div class="w-full max-w-sm">
      <div class="lock-icon mx-auto mb-6 grid size-20 place-items-center rounded-full bg-white text-brand-600 shadow-sm ring-1 ring-brand-100">
        <svg viewBox="0 0 24 24" class="size-10 overflow-visible" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path class="shackle" d="M8 11V8a4 4 0 118 0v3" />
          <rect class="lock-body" x="5" y="11" width="14" height="9" rx="2" fill="currentColor" fill-opacity=".25" />
        </svg>
      </div>
      <div class="lock-card rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-brand-600/5">
        <h1 class="text-xl font-semibold tracking-tight">Safe locked</h1>
        <p class="mt-1.5 text-sm leading-relaxed text-slate-500">Enter your password to unlock your documents.</p>
        <form class="mt-6 space-y-4" @submit.prevent="unlock">
          <div>
            <label class="label" for="unlock-pw">Password</label>
            <input id="unlock-pw" v-model="unlockPw" type="password" autocomplete="current-password" class="field" autofocus required>
          </div>
          <div v-if="needUnlockCode">
            <label class="label" for="unlock-code">Authenticator code</label>
            <input id="unlock-code" v-model="unlockCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456" class="field tracking-[0.3em]" required>
          </div>
          <p v-if="error" class="alert-error">{{ error }}</p>
          <button class="btn w-full">Unlock</button>
          <button type="button" class="btn-ghost w-full" @click="logout">Log out</button>
        </form>
      </div>
      <p class="mt-6 text-center text-xs text-slate-400">SendSafe · end-to-end encrypted</p>
    </div>
  </main>

  <div v-else class="fade-in flex h-[calc(100dvh-var(--titlebar,0px))] flex-col overflow-hidden lg:flex-row">
    <aside v-if="!isSettings" class="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 bg-slate-100 px-3 py-2 lg:w-60 lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-4 lg:p-4">
      <div class="shrink-0 px-2 py-1"><BrandLogo /></div>
      <!-- Narrow window: tabs become a phone-style bar fixed to the bottom. -->
      <nav class="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:static lg:flex-1 lg:flex-col lg:gap-1 lg:border-0 lg:bg-transparent lg:pb-0">
        <NuxtLink to="/admin" class="btn-ghost flex-1 flex-col !gap-0.5 !rounded-none !py-2 !text-[11px] lg:flex-none lg:flex-row lg:!justify-start lg:!gap-3 lg:!rounded-lg lg:!py-2.5 lg:!text-sm border-t-2 border-brand-600 !bg-brand-100 !text-brand-700 font-semibold lg:border-t-0" aria-current="page">
          <svg viewBox="0 0 24 24" class="size-5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.5-6.9A2 2 0 0016.8 4H7.2a2 2 0 00-1.7 1.1z" /></svg>
          Inbox
        </NuxtLink>
        <span
          v-for="t in soon" :key="t.label"
          class="btn-ghost cursor-not-allowed border-t-2 border-transparent lg:border-t-0 flex-1 flex-col !gap-0.5 !rounded-none !py-2 !text-[11px] lg:flex-none lg:flex-row lg:!justify-start lg:!gap-3 lg:!rounded-lg lg:!py-2.5 lg:!text-sm !text-slate-400 hover:!bg-transparent hover:!text-slate-400"
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
        <button type="button" class="btn !gap-1.5 !px-3 !py-1.5" title="Lock safe" @click="lockSafe">
          <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 118 0v3" /></svg>
          Lock
        </button>
      </div>
      <!-- Wide window: full buttons in the sidebar. -->
      <div class="hidden shrink-0 flex-col gap-2 lg:flex">
        <NuxtLink to="/admin/settings" class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50" active-class="!bg-brand-100 !text-brand-700">Settings</NuxtLink>
        <button class="btn w-full !gap-2" @click="lockSafe"><svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 118 0v3" /></svg>Lock safe</button>
      </div>
    </aside>
    <Onboarding v-if="showTour && privateKey" @done="finishTour" />
    <Transition name="so">
      <div v-if="countdown > 0 && privateKey" class="fixed inset-0 z-[65] grid place-items-center bg-slate-900/60 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="al-title">
        <div class="w-full max-w-xs rounded-2xl bg-white p-7 text-center shadow-2xl">
          <div class="relative mx-auto grid size-20 place-items-center">
            <svg viewBox="0 0 80 80" class="absolute inset-0 -rotate-90" aria-hidden="true">
              <circle cx="40" cy="40" r="35" fill="none" stroke="currentColor" stroke-width="4" class="text-slate-100" />
              <circle cx="40" cy="40" r="35" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" class="al-ring text-brand-600" :style="{ animationDuration: WARN_SECONDS + 's' }" />
            </svg>
            <span class="text-3xl font-semibold tabular-nums text-brand-600">{{ countdown }}</span>
          </div>
          <h2 id="al-title" class="mt-4 text-lg font-semibold tracking-tight">Locking your safe</h2>
          <p class="mt-1 text-sm text-slate-500">You have been away for a while. Locking in {{ countdown }}…</p>
          <div class="mt-6 flex flex-col gap-2">
            <button type="button" class="btn w-full" autofocus @click="keepUsing">Keep using</button>
            <button type="button" class="btn-ghost w-full" @click="lockNow">Lock now</button>
          </div>
        </div>
      </div>
    </Transition>
    <Transition name="so">
      <div v-if="signingOut" class="fixed inset-0 z-[60] grid place-items-center bg-white" role="status" aria-live="polite">
        <div class="flex flex-col items-center gap-4">
          <svg viewBox="0 0 24 24" class="size-9 animate-spin text-brand-600" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3a9 9 0 109 9" /></svg>
          <p class="text-sm font-medium text-slate-600">Signing out…</p>
        </div>
      </div>
    </Transition>
    <main class="flex min-h-0 min-w-0 flex-1 flex-col p-4 lg:p-6" :class="!isSettings && 'pb-20 lg:pb-6'">
      <div class="flex min-h-0 flex-1 flex-col gap-6">
        <NuxtLink v-if="isSettings" to="/admin" class="btn-ghost shrink-0 self-start !bg-slate-100 !px-3 hover:!bg-slate-200">
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

<style scoped>
.lock-screen { animation: lock-bg .35s ease-out both; }
@keyframes lock-bg { from { opacity: 0; } to { opacity: 1; } }
/* The shackle drops into the body, then the whole lock gives a small bounce. */
.shackle { animation: shackle .6s cubic-bezier(.3, 1.5, .5, 1) .3s both; }
@keyframes shackle { from { transform: translateY(-4px); } to { transform: translateY(0); } }
.lock-icon { animation: lock-pop .45s ease-out .85s both; }
@keyframes lock-pop { 0% { transform: scale(1); } 50% { transform: scale(1.12); } 100% { transform: scale(1); } }
.lock-card { animation: lock-card .5s ease-out .1s both; }
@keyframes lock-card { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
.al-ring { stroke-dasharray: 220; animation: al-run linear forwards; }
@keyframes al-run { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 220; } }
.so-enter-active { transition: opacity .25s ease; }
.so-enter-from { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .lock-screen, .shackle, .lock-icon, .lock-card { animation: none !important; } }
</style>
