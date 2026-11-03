<script setup lang="ts">
useHead({ title: 'Log in | SendSafe' })
type Account = { id: string, name: string }
const profiles = await $fetch<{ current: string, accounts: Account[] }>('/api/profiles')
const accounts = ref(profiles.accounts)
const current = ref(profiles.current)
const status = ref(await $fetch<{ setup: boolean, requireTotp: boolean }>('/api/status'))
// This account was never finished (e.g. an abandoned "create account"): fall back to one that exists, or to setup.
if (!status.value.setup) {
  if (accounts.value.length) {
    await $fetch('/api/profiles/select', { method: 'POST', body: { id: accounts.value[0]!.id } })
    current.value = accounts.value[0]!.id
    status.value = await $fetch('/api/status')
  } else await navigateTo('/setup', { replace: true })
}

const { privateKey } = useVault()
const password = ref('')
const code = ref('')
const busy = ref(false)
const error = ref('')

async function pick(id: string) {
  if (id === current.value) return
  await $fetch('/api/profiles/select', { method: 'POST', body: { id } })
  current.value = id
  password.value = ''
  code.value = ''
  error.value = ''
  status.value = await $fetch('/api/status')
}

async function addAccount() {
  await $fetch('/api/profiles', { method: 'POST' })
  await navigateTo('/setup')
}

async function login() {
  error.value = ''
  busy.value = true
  try {
    const { salt } = await $fetch<{ salt: string }>('/api/auth/params')
    const { wrapKey, authSecret } = await deriveKeys(password.value, salt)
    const vault = await $fetch<{ wrappedPrivateKey: string, wrapIv: string }>('/api/auth/login', {
      method: 'POST',
      body: { authSecret, code: code.value }
    })
    privateKey.value = await unlockPrivateKey(wrapKey, vault.wrappedPrivateKey, vault.wrapIv)
    await navigateTo('/admin')
  } catch (e: any) {
    error.value = e?.data?.statusMessage === 'Too many requests' ? 'Too many attempts. Wait and retry.' : 'Invalid credentials.'
  } finally {
    busy.value = false
    password.value = ''
  }
}
</script>

<template>
  <AuthShell title="Welcome back" subtitle="Log in with your password and authenticator code. Your files are decrypted only in this browser.">
    <div v-if="accounts.length > 1" class="mb-5 space-y-1.5">
      <p class="label !mb-1">Account</p>
      <button
        v-for="a in accounts" :key="a.id" type="button"
        class="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition"
        :class="a.id === current ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'"
        @click="pick(a.id)"
      >
        <span class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{{ (a.name || '?').trim().charAt(0).toUpperCase() }}</span>
        <span class="truncate font-medium">{{ a.name || 'Unnamed account' }}</span>
      </button>
    </div>
    <form class="space-y-4" @submit.prevent="login">
      <div>
        <label class="label" for="pw">Password</label>
        <input id="pw" v-model="password" type="password" autocomplete="current-password" class="field" required>
      </div>
      <div v-if="status.requireTotp">
        <label class="label" for="code">Authenticator code</label>
        <input id="code" v-model="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456" class="field tracking-[0.3em]" :required="status.requireTotp">
      </div>
      <p v-if="error" class="alert-error">{{ error }}</p>
      <button :disabled="busy" class="btn w-full">{{ busy ? 'Unlocking…' : 'Log in' }}</button>
    </form>
    <p class="mt-5 text-center text-sm text-slate-500">
      Someone else?
      <button type="button" class="font-medium text-brand-600 hover:underline" @click="addAccount">Create a new account</button>
    </p>
  </AuthShell>
</template>
