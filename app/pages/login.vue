<script setup lang="ts">
useHead({ title: 'Log in | SendSafe' })
const ready = ref(false)
const { privateKey } = useVault()
const email = ref('')
const password = ref('')
const code = ref('')
const busy = ref(false)
const error = ref('')
const needCode = ref(false)
const success = ref(false)
// Two screens: email + password first, then the authenticator code (only when the account needs one).
const step = ref<'creds' | 'code'>('creds')
const LAST = 'sendsafe-last-email'

// Loaded after the page appears (a page that waits on data while mounting breaks hot reload and can crash on navigation).
onMounted(async () => {
  try {
    const st = await $fetch<{ setup: boolean }>('/api/status')
    const accounts = (await $fetch<{ accounts: unknown[] }>('/api/profiles')).accounts
    // Nothing to log in to yet (or only an abandoned "create account"): go to setup.
    if (!accounts.length) { location.replace('/setup'); return }
    void st
    try { email.value = localStorage.getItem(LAST) || '' } catch {}
    if (email.value) lookup().catch(() => {})
  } finally {
    ready.value = true
  }
})

// Finds the account for this email, so we know the password salt and whether a code is needed.
let found: { salt: string, requireTotp: boolean } | null = null
let foundFor = ''
async function lookup() {
  const e = email.value.trim()
  if (!e || (found && foundFor === e)) return found
  try {
    found = await $fetch<{ salt: string, requireTotp: boolean }>('/api/auth/params', { query: { email: e } })
    foundFor = e
    needCode.value = found.requireTotp
  } catch {
    found = null
    foundFor = ''
    needCode.value = false
  }
  return found
}

async function addAccount() {
  await $fetch('/api/profiles', { method: 'POST' })
  location.assign('/setup')
}

async function login() {
  error.value = ''
  busy.value = true
  let moved = false
  try {
    const f = await lookup()
    if (!f) throw new Error('bad')
    if (f.requireTotp && step.value === 'creds') { step.value = 'code'; moved = true; return }
    const { wrapKey, authSecret } = await deriveKeys(password.value, f.salt)
    const vault = await $fetch<{ wrappedPrivateKey: string, wrapIv: string }>('/api/auth/login', {
      method: 'POST',
      body: { authSecret, code: code.value, email: email.value.trim() }
    })
    privateKey.value = await unlockPrivateKey(wrapKey, vault.wrappedPrivateKey, vault.wrapIv)
    try { localStorage.setItem(LAST, email.value.trim()) } catch {}
    // A short "unlocked" moment instead of jumping straight into the app.
    success.value = true
    await new Promise(r => setTimeout(r, 1300))
    await navigateTo('/admin')
  } catch (e: any) {
    error.value = e?.data?.statusMessage === 'Too many requests' ? 'Too many attempts. Wait and retry.' : 'Invalid credentials.'
    step.value = 'creds'
    code.value = ''
  } finally {
    busy.value = false
    if (!moved) password.value = ''
  }
}

function backToCreds() {
  step.value = 'creds'
  code.value = ''
  password.value = ''
  error.value = ''
}
</script>

<template>
  <div>
  <AuthShell title="Log in" subtitle="Enter your email and password.">
    <template v-if="ready">
      <form v-if="step === 'creds'" class="space-y-4" @submit.prevent="login">
        <div>
          <label class="label" for="em">Email</label>
          <input id="em" v-model="email" type="email" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="you@example.com" class="field" required @blur="lookup">
        </div>
        <div>
          <label class="label" for="pw">Password</label>
          <input id="pw" v-model="password" type="password" autocomplete="current-password" class="field" required>
        </div>
        <p v-if="error" class="alert-error">{{ error }}</p>
        <button :disabled="busy" class="btn w-full">{{ busy ? 'Checking…' : 'Log in' }}</button>
      </form>
      <form v-else class="space-y-4" @submit.prevent="login">
        <p class="text-sm text-slate-500">Open your authenticator app and enter the 6-digit code for <span class="font-medium text-slate-700">{{ email }}</span>.</p>
        <input id="code" v-model="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456" class="field text-center tracking-[0.3em]" aria-label="Authenticator code" required autofocus>
        <p v-if="error" class="alert-error">{{ error }}</p>
        <button :disabled="busy" class="btn w-full">{{ busy ? 'Unlocking…' : 'Confirm' }}</button>
        <button type="button" class="w-full text-center text-sm text-slate-500 hover:text-slate-800" :disabled="busy" @click="backToCreds">← Back</button>
      </form>
      <p class="mt-5 text-center text-sm text-slate-500">
        New here?
        <button type="button" class="font-medium text-brand-600 hover:underline" @click="addAccount">Create an account</button>
      </p>
    </template>
  </AuthShell>
  <Transition name="ok">
    <div v-if="success" class="fixed inset-0 z-50 grid place-items-center bg-gradient-to-br from-brand-50 to-brand-100" role="status" aria-live="polite">
      <div class="flex flex-col items-center gap-5">
        <div class="ok-icon grid size-24 place-items-center rounded-full bg-white text-brand-600 shadow-sm ring-1 ring-brand-100">
          <svg viewBox="0 0 24 24" class="size-12 overflow-visible" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path class="ok-shackle" d="M8 11V8a4 4 0 118 0v3" />
            <rect x="5" y="11" width="14" height="9" rx="2" fill="currentColor" fill-opacity=".25" />
            <path class="ok-check" d="M9.5 15.5l2 2 3.5-4" />
          </svg>
        </div>
        <p class="ok-text text-base font-medium text-slate-700">Unlocked</p>
      </div>
    </div>
  </Transition>
  </div>
</template>

<style scoped>
.ok-enter-active { transition: opacity .3s ease; }
.ok-enter-from { opacity: 0; }
/* The padlock springs open, a check draws itself, then the app fades in. */
.ok-shackle { animation: ok-open .6s cubic-bezier(.3, 1.5, .5, 1) .25s both; }
@keyframes ok-open { from { transform: translateY(0); } to { transform: translateY(-4px); } }
.ok-check { stroke-dasharray: 12; animation: ok-draw .45s ease-out .6s both; }
@keyframes ok-draw { from { stroke-dashoffset: 12; } to { stroke-dashoffset: 0; } }
.ok-icon { animation: ok-pop .5s ease-out .2s both; }
@keyframes ok-pop { 0% { transform: scale(.85); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
.ok-text { animation: ok-rise .4s ease-out .7s both; }
@keyframes ok-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .ok-shackle, .ok-check, .ok-icon, .ok-text { animation: none !important; } }
</style>
