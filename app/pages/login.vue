<script setup lang="ts">
const status = await $fetch<{ setup: boolean, requireTotp: boolean }>('/api/status')
if (!status.setup) await navigateTo('/setup', { replace: true })

const { privateKey } = useVault()
const password = ref('')
const code = ref('')
const busy = ref(false)
const error = ref('')

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
  </AuthShell>
</template>
