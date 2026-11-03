<script setup lang="ts">
useHead({ title: 'Settings | SendSafe' })
definePageMeta({ layout: 'admin', middleware: 'auth' })

const form = reactive({ displayName: '', requireTotp: true, sessionHours: 12 })
const saving = ref(false)
const saved = ref(false)
const error = ref('')

const loaded = await $fetch<{ displayName: string, requireTotp: boolean, sessionHours: number }>('/api/settings')
Object.assign(form, loaded)
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
      <input id="st-name" v-model="form.displayName" type="text" maxlength="80" class="field" placeholder="e.g. Jane Smith">
      <p class="mt-1 text-xs text-slate-500">Shown to people who open your sharing link.</p>
    </div>

    <div>
      <label class="label" for="st-session">Stay logged in for</label>
      <div class="relative">
        <input id="st-session" v-model.number="form.sessionHours" type="number" min="1" max="720" class="field pr-16">
        <span class="pointer-events-none absolute inset-y-0 right-3 grid items-center text-sm text-slate-400">hours</span>
      </div>
      <p class="mt-1 text-xs text-slate-500">Applies from your next login.</p>
    </div>

    <div>
      <label class="flex cursor-pointer items-start gap-3">
        <input v-model="form.requireTotp" type="checkbox" class="mt-1 size-4 accent-brand-600">
        <span>
          <span class="block text-sm font-medium text-slate-800">Require authenticator code at every login</span>
          <span class="mt-0.5 block text-xs text-slate-500">Turn off to log in with your password only. This is less secure: anyone with your password can get in.</span>
        </span>
      </label>
      <p v-if="!form.requireTotp" class="alert-warn mt-3 text-xs">Two-factor login is off. Your password is the only protection for your files.</p>
    </div>

    <p v-if="error" class="alert-error">{{ error }}</p>
    <div class="flex items-center gap-3">
      <button class="btn" :disabled="saving || !dirty">{{ saving ? 'Saving…' : 'Save settings' }}</button>
      <span v-if="saved" class="text-sm text-brand-600">Saved</span>
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
