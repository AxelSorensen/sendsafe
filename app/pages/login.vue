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
  <AuthShell title="Log in" subtitle="Enter your email and password.">
    <template v-if="ready">
      <form v-if="step === 'creds'" class="space-y-4" @submit.prevent="login">
        <div>
          <label class="label" for="em">Email</label>
          <input id="em" v-model="email" type="email" autocomplete="username" placeholder="you@example.com" class="field" required @blur="lookup">
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
</template>
