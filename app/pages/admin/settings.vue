<script setup lang="ts">
useHead({ title: 'Settings | SendSafe' })
definePageMeta({ layout: 'admin', middleware: 'auth' })

const form = reactive({ displayName: '', requireTotp: true, sessionMinutes: 720, autoLockMinutes: 15, unlockMode: 'password' })
const saving = ref(false)
const saved = ref(false)
const error = ref('')

const loaded = await $fetch<{ displayName: string, requireTotp: boolean, unlockMode: string, autoLockMinutes: number, totpConfirmed: boolean, sessionMinutes: number }>('/api/settings')
const totpConfirmed = ref(loaded.totpConfirmed)
Object.assign(form, { displayName: loaded.displayName, requireTotp: loaded.requireTotp, autoLockMinutes: loaded.autoLockMinutes, unlockMode: loaded.unlockMode, sessionMinutes: loaded.sessionMinutes })
// "Stay logged in for": three quick choices, or a custom length in minutes, hours or days.
const PRESETS = [1, 5, 30]
const UNIT_MIN = { minutes: 1, hours: 60, days: 1440 } as const
type Unit = keyof typeof UNIT_MIN
const mins = form.sessionMinutes
const mode = ref(PRESETS.includes(mins) ? String(mins) : 'custom')
const unit = ref<Unit>(mins % 1440 === 0 ? 'days' : mins % 60 === 0 ? 'hours' : 'minutes')
const customVal = ref(Math.max(1, Math.round(mins / UNIT_MIN[unit.value])))
watch([mode, customVal, unit], () => {
  form.sessionMinutes = mode.value === 'custom'
    ? Math.min(Math.max(Math.floor(Number(customVal.value) || 1), 1) * UNIT_MIN[unit.value], 60 * 24 * 30)
    : Number(mode.value)
})
// Adding two-factor later (when it was skipped at setup). Nothing changes until the first code is confirmed; Cancel leaves it as it was.
const enroll = ref<{ secret: string, qr: string } | null>(null)
const enrollCode = ref('')
const enrollBusy = ref(false)
const enrollError = ref('')
async function startEnroll() {
  enrollError.value = ''
  enrollBusy.value = true
  try { enroll.value = await $fetch('/api/auth/enroll', { method: 'POST' }) } catch (e: any) { enrollError.value = e?.data?.statusMessage || 'Could not start.' } finally { enrollBusy.value = false }
}
function cancelEnroll() { enroll.value = null; enrollCode.value = ''; enrollError.value = '' }
async function confirmEnroll() {
  enrollError.value = ''
  enrollBusy.value = true
  try {
    await $fetch('/api/auth/enroll-confirm', { method: 'POST', body: { code: enrollCode.value } })
    totpConfirmed.value = true
    form.requireTotp = true
    snapshot.value = JSON.stringify(form)
    cancelEnroll()
  } catch (e: any) {
    enrollError.value = e?.data?.statusMessage === 'Invalid code' ? 'That code is not right. Try the current one.' : (e?.data?.statusMessage || 'Could not confirm.')
  } finally {
    enrollBusy.value = false
  }
}
// Save is only enabled once something differs from what is stored.
const snapshot = ref(JSON.stringify(form))
const dirty = computed(() => JSON.stringify(form) !== snapshot.value)

async function save() {
  saving.value = true
  error.value = ''
  saved.value = false
  try {
    await $fetch('/api/settings', { method: 'PATCH', body: { ...form } })
    snapshot.value = JSON.stringify(form)
    saved.value = true
    setTimeout(() => (saved.value = false), 2000)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Could not save settings.'
  } finally {
    saving.value = false
  }
}

const { tunnel, retry, start, stop } = useTunnel()

// Arriving via /admin/settings#sharing: scroll to the Sharing server card and flash its border.
const route = useRoute()
const sharingEl = ref<HTMLElement | null>(null)
const flash = ref(false)
function goToSharing() {
  if (route.hash !== '#sharing') return
  nextTick(() => {
    sharingEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    flash.value = false
    requestAnimationFrame(() => {
      flash.value = true
      setTimeout(() => (flash.value = false), 2400)
    })
  })
}
onMounted(() => setTimeout(goToSharing, 150))
watch(() => route.hash, goToSharing)

const openTour = inject<() => void>('openTour')
const signOut = inject<() => void>('signOut')
const toggling = ref(false)
async function toggleSharing() {
  toggling.value = true
  try { await (tunnel.value.enabled ? stop() : start()) } finally { toggling.value = false }
}
</script>

<template>
  <div class="w-full space-y-6">
  <form class="card w-full space-y-6 p-6" @submit.prevent="save">
    <div>
      <h1 class="text-lg font-semibold tracking-tight">Settings</h1>
      <p class="mt-1 text-sm text-slate-500">Preferences for your SendSafe account.</p>
    </div>

    <div>
      <label class="label" for="st-name">Your name</label>
      <input id="st-name" v-model="form.displayName" type="text" maxlength="80" class="field" placeholder="e.g. Jane Smith" required>
      <p class="mt-1 text-xs text-slate-500">Shown to people who open your sharing link.</p>
    </div>

    <div>
      <label class="label" for="st-session">Stay logged in for</label>
      <div id="st-session" role="radiogroup" aria-label="Stay logged in for" class="inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        <button
          v-for="o in [{ v: '1', l: '1 minute' }, { v: '5', l: '5 minutes' }, { v: '30', l: '30 minutes' }, { v: 'custom', l: 'Custom' }]"
          :key="o.v" type="button" role="radio" :aria-checked="mode === o.v"
          class="rounded-lg px-3.5 py-1.5 text-sm font-medium transition"
          :class="mode === o.v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
          @click="mode = o.v"
        >{{ o.l }}</button>
      </div>
      <div v-if="mode === 'custom'" class="mt-3 flex flex-wrap items-center gap-2">
        <input v-model.number="customVal" type="number" min="1" class="field w-24" aria-label="Custom length">
        <div role="radiogroup" aria-label="Unit" class="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
          <button
            v-for="u in ['minutes', 'hours', 'days']" :key="u" type="button" role="radio" :aria-checked="unit === u"
            class="rounded-lg px-3 py-1.5 text-sm font-medium transition"
            :class="unit === u ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
            @click="unit = u as Unit"
          >{{ u }}</button>
        </div>
      </div>
      <p class="mt-1 text-xs text-slate-500">Applies from your next login.</p>
    </div>

    <div>
      <p class="label">Unlock a locked safe with</p>
      <div role="radiogroup" aria-label="Unlock a locked safe with" class="inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        <button
          v-for="o in [{ v: 'password', l: 'Password' }, { v: 'code', l: 'Authenticator code' }, { v: 'both', l: 'Both' }]"
          :key="o.v" type="button" role="radio" :aria-checked="form.unlockMode === o.v"
          :disabled="o.v !== 'password' && !totpConfirmed"
          class="rounded-lg px-3.5 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
          :class="form.unlockMode === o.v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
          @click="form.unlockMode = o.v"
        >{{ o.l }}</button>
      </div>
      <p class="mt-1 text-xs text-slate-500">
        <template v-if="form.unlockMode === 'code'">Your files stay unlocked in memory behind the lock screen, so the code alone opens it again. Logging in still needs your password.</template>
        <template v-else-if="form.unlockMode === 'both'">Locking forgets your key. Unlocking needs your password and a fresh code.</template>
        <template v-else>Locking forgets your key. Unlocking needs your password.</template>
        <template v-if="!totpConfirmed"> Set up an authenticator above to use a code.</template>
      </p>
    </div>

    <div>
      <p class="label">Lock the safe after inactivity</p>
      <div role="radiogroup" aria-label="Lock the safe after inactivity" class="inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        <button
          v-for="o in [{ v: 0, l: 'Never' }, { v: 1, l: '1 min' }, { v: 5, l: '5 min' }, { v: 15, l: '15 min' }, { v: 30, l: '30 min' }, { v: 60, l: '1 hour' }]"
          :key="o.v" type="button" role="radio" :aria-checked="form.autoLockMinutes === o.v"
          class="rounded-lg px-3.5 py-1.5 text-sm font-medium transition"
          :class="form.autoLockMinutes === o.v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
          @click="form.autoLockMinutes = o.v"
        >{{ o.l }}</button>
      </div>
      <p class="mt-1 text-xs text-slate-500">You get a few seconds of warning first and can keep using the app.</p>
    </div>

<template v-if="totpConfirmed">
    <div>
      <label class="flex cursor-pointer items-start gap-3">
        <input v-model="form.requireTotp" type="checkbox" class="mt-1 size-4 accent-brand-600">
        <span>
          <span class="block text-sm font-medium text-slate-800">Require authenticator code to log in</span>
          <span class="mt-0.5 block text-xs text-slate-500">Asked every time you log in. Turn off to log in with your password only. This is less secure: anyone with your password can get in.</span>
        </span>
      </label>
      <p v-if="!form.requireTotp" class="alert-warn mt-3 text-xs">Two-factor login is off. Your password is the only thing asked when you log in.</p>
    </div>

</template>
    <div v-else class="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p class="text-sm font-medium text-slate-800">Two-factor login is off</p>
      <p class="mt-0.5 text-xs text-slate-500">Right now only your password protects your login. Add an authenticator app for a second step.</p>
      <button v-if="!enroll" type="button" class="btn-ghost mt-3 !bg-white" :disabled="enrollBusy" @click="startEnroll">Set up authenticator</button>
      <div v-else class="mt-4 space-y-3">
        <img :src="enroll.qr" alt="Authenticator QR code" class="rounded-xl border border-slate-200 bg-white p-2">
        <p class="break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-500">{{ enroll.secret }}</p>
        <input v-model="enrollCode" inputmode="numeric" maxlength="6" placeholder="123456" class="field max-w-48 tracking-[0.3em]" aria-label="Authenticator code" @keydown.enter.prevent="confirmEnroll">
        <p v-if="enrollError" class="alert-error">{{ enrollError }}</p>
        <div class="flex gap-2">
          <button type="button" class="btn" :disabled="enrollBusy || enrollCode.length < 6" @click="confirmEnroll">Confirm</button>
          <button type="button" class="btn-ghost" :disabled="enrollBusy" @click="cancelEnroll">Cancel</button>
        </div>
      </div>
      <p v-if="!enroll && enrollError" class="alert-error mt-3">{{ enrollError }}</p>
    </div>
    <p v-if="error" class="alert-error">{{ error }}</p>
    <div class="flex items-center justify-end gap-3">
      <Transition name="saved">
        <span v-if="saved" class="inline-flex items-center gap-1.5 text-sm text-slate-500" role="status">
          <svg viewBox="0 0 24 24" class="size-4 text-brand-600" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
          Saved
        </span>
      </Transition>
      <button class="btn" :disabled="saving || !dirty">{{ saving ? 'Saving…' : 'Save settings' }}</button>
    </div>
  </form>

    <section class="card p-6">
      <h2 class="text-base font-semibold">Verification code</h2>
      <p class="mt-1 text-sm text-slate-600">If a sender wants to be sure they are sending to you, they will call you. Read this out. It must match the code on their upload page.</p>
      <div class="mt-4 max-w-sm rounded-xl border border-brand-100 bg-brand-50 px-4 py-3"><KeyCode /></div>
    </section>

    <section class="flex flex-col gap-3 card p-6 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <h2 class="text-base font-semibold">Walkthrough</h2>
        <p class="mt-1 text-sm text-slate-600">A quick tour of the password, verification code and sharing server.</p>
      </div>
      <button type="button" class="btn-ghost shrink-0" @click="openTour?.()">Show again</button>
    </section>

    <section id="sharing" ref="sharingEl" class="flex flex-col gap-3 card p-6 sm:flex-row sm:items-center sm:justify-between" :class="flash && 'flash-ring'">
      <div class="min-w-0">
        <h2 class="text-base font-semibold">Sharing server</h2>
        <p class="mt-1 break-all text-sm text-slate-600">
          <template v-if="!tunnel.enabled">Off. Your sharing links do not work and nobody can send you files.</template>
          <template v-else-if="tunnel.status === 'running'">On. Live at <span class="font-mono">{{ tunnel.url }}</span>. Links you copy use this address.</template>
          <template v-else-if="tunnel.status === 'error'">{{ tunnel.error }}</template>
          <template v-else>Starting…</template>
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-3">
        <button v-if="tunnel.enabled && tunnel.status === 'error'" class="btn" @click="retry">Retry</button>
        <button
          type="button"
          role="switch"
          :aria-checked="tunnel.enabled"
          :disabled="toggling"
          class="relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60"
          :class="tunnel.enabled ? 'bg-brand-600' : 'bg-slate-300'"
          @click="toggleSharing"
        >
          <span class="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform" :class="tunnel.enabled && 'translate-x-5'" />
        </button>
      </div>
    </section>



    <section class="flex flex-col gap-3 card p-6 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <h2 class="text-base font-semibold">Log out</h2>
        <p class="mt-1 text-sm text-slate-600">Sign out of this account on this computer. To get back in you will need your password{{ form.requireTotp ? ' and authenticator code' : '' }}. Use Lock safe in the sidebar if you only want to lock it for a moment.</p>
      </div>
      <button type="button" class="btn-ghost shrink-0 !bg-slate-100 hover:!bg-slate-200" @click="signOut?.()">Log out</button>
    </section>
  </div>
</template>

<style scoped>
.flash-ring { animation: flash-ring 1.2s ease-in-out 2; }
@keyframes flash-ring {
  0%, 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); border-color: rgb(203 213 225); }
  50% { box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.35); border-color: rgb(37 99 235); }
}
@media (prefers-reduced-motion: reduce) { .flash-ring { animation: none; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.45); border-color: rgb(37 99 235); } }
</style>
