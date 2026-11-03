<script setup lang="ts">
useHead({ title: 'Set up | SendSafe' })
const status = ref({ setup: false, needsSetupToken: false })
const hasAccounts = ref(false)
const ready = ref(false)
// Loaded after the page appears (a page that waits on data while mounting breaks hot reload and can crash on navigation).
onMounted(async () => {
  try {
    status.value = await $fetch('/api/status')
    if (status.value.setup) { location.replace('/login'); return }
    hasAccounts.value = (await $fetch<{ accounts: unknown[] }>('/api/profiles')).accounts.length > 0
  } finally {
    ready.value = true
  }
})

const email = ref('')
const password = ref('')
const confirm = ref('')
const setupToken = ref('')
const code = ref('')
const busy = ref(false)
const error = ref('')
const MIN_LEN = 12
const strength = computed(() => {
  const p = password.value
  const missing = Math.max(0, MIN_LEN - p.length)
  if (!p) return { level: 0, label: '', missing, bar: 'bg-slate-200', text: 'text-slate-500' }
  if (missing > 0) return { level: 1, label: 'Too short', missing, bar: 'bg-red-500', text: 'text-red-600' }
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(p)).length
  const score = (p.length >= 16 ? 2 : 0) + (p.length >= 20 ? 1 : 0) + kinds
  if (score >= 5) return { level: 4, label: 'Strong', missing, bar: 'bg-brand-600', text: 'text-brand-600' }
  if (score >= 3) return { level: 3, label: 'Good', missing, bar: 'bg-brand-500', text: 'text-brand-500' }
  return { level: 2, label: 'Weak', missing, bar: 'bg-slate-400', text: 'text-slate-500' }
})
const totp = ref<{ secret: string, qr: string } | null>(null)
const { privateKey } = useVault()
let created: { kdfSalt: string, wrappedPrivateKey: string, wrapIv: string } | null = null

async function create() {
  error.value = ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) return (error.value = 'Please enter a valid email address.')
  if (password.value.length < 12) return (error.value = 'Use at least 12 characters.')
  if (password.value !== confirm.value) return (error.value = 'Passwords do not match.')
  busy.value = true
  try {
    const v = await createOwnerVault(password.value)
    created = v
    totp.value = await $fetch<{ secret: string, qr: string }>('/api/auth/setup', {
      method: 'POST',
      body: { ...v, setupToken: setupToken.value, email: email.value.trim() }
    })
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Setup failed.'
  } finally {
    busy.value = false
  }
}

// The password was just proven (and the code too, unless skipped): open the safe now instead of asking again.
async function openSafe() {
  if (created) {
    try {
      const { wrapKey } = await deriveKeys(password.value, created.kdfSalt)
      privateKey.value = await unlockPrivateKey(wrapKey, created.wrappedPrivateKey, created.wrapIv)
      password.value = ''
      confirm.value = ''
      await navigateTo('/admin')
      return
    } catch { /* fall back to the normal login */ }
  }
  await navigateTo('/login')
}

async function verify() {
  error.value = ''
  busy.value = true
  try {
    await $fetch('/api/auth/setup-totp', { method: 'POST', body: { code: code.value } })
    await openSafe()
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Invalid code.'
  } finally {
    busy.value = false
  }
}

// Password only: two-factor can be added later in Settings.
async function skipTotp() {
  error.value = ''
  busy.value = true
  try {
    await $fetch('/api/auth/setup-skip-totp', { method: 'POST' })
    await openSafe()
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Could not finish setup.'
  } finally {
    busy.value = false
  }
}

// Step back to the first form. The unfinished account is replaced when you press Create safe again.
function back() {
  totp.value = null
  code.value = ''
  error.value = ''
}
</script>

<template>
  <AuthShell
    :title="totp ? 'Set up two-factor' : 'Create your safe'"
    :subtitle="totp ? 'Scan the QR code with an authenticator app, then enter the 6-digit code.' : 'Your password protects the key that decrypts every file. If you lose it, files cannot be recovered.'"
  >
    <template v-if="ready">
      <form v-if="!totp" class="space-y-4" @submit.prevent="create">
        <div v-if="status.needsSetupToken">
          <label class="label">Setup token</label>
          <input v-model="setupToken" type="password" placeholder="From server environment" class="field">
        </div>
        <div>
          <label class="label" for="su-email">Email</label>
          <input id="su-email" v-model="email" type="email" maxlength="120" autocomplete="email" placeholder="you@example.com" class="field" required>
          <p class="mt-1 text-xs text-slate-500">Names your entry in the authenticator app. It is not shared with anyone.</p>
        </div>
        <div>
          <label class="label">Password</label>
          <input v-model="password" type="password" autocomplete="new-password" placeholder="At least 12 characters" class="field" required>
          <div v-if="password" class="mt-2">
            <div class="flex gap-1">
              <span v-for="i in 4" :key="i" class="h-1.5 flex-1 rounded-full" :class="i <= strength.level ? strength.bar : 'bg-slate-200'" />
            </div>
            <p class="mt-1.5 text-xs" :class="strength.text">
              {{ strength.label }}<template v-if="strength.missing"> · {{ strength.missing }} more character{{ strength.missing === 1 ? '' : 's' }} needed</template>
            </p>
          </div>
        </div>
        <div>
          <label class="label">Confirm password</label>
          <input v-model="confirm" type="password" autocomplete="new-password" class="field" required>
        </div>
        <p v-if="error" class="alert-error">{{ error }}</p>
        <button :disabled="busy" class="btn w-full">{{ busy ? 'Generating keys…' : 'Create safe' }}</button>
        <p class="text-center text-sm text-slate-500">
          Already have an account? <a href="/login" class="font-medium text-brand-600 hover:underline">Log in</a>
        </p>
      </form>

      <form v-else class="space-y-4" @submit.prevent="verify">
        <img :src="totp.qr" alt="TOTP QR code" class="mx-auto rounded-xl border border-slate-200 bg-white p-2">
        <p class="break-all rounded-lg bg-slate-100 px-3 py-2 text-center font-mono text-xs text-slate-500">{{ totp.secret }}</p>
        <input v-model="code" inputmode="numeric" maxlength="6" placeholder="123456" class="field text-center tracking-[0.3em]" required>
        <p v-if="error" class="alert-error">{{ error }}</p>
        <button :disabled="busy" class="btn w-full">Confirm and finish</button>
        <div class="flex items-center justify-between text-sm">
          <button type="button" class="text-slate-500 hover:text-slate-800" :disabled="busy" @click="back">← Back</button>
          <button type="button" class="text-slate-500 hover:text-slate-800" :disabled="busy" @click="skipTotp">Skip for now</button>
        </div>
        <p class="text-center text-xs text-slate-500">Skipping means only your password protects your login. You can turn on two-factor later in Settings.</p>
      </form>
    </template>
  </AuthShell>
</template>
