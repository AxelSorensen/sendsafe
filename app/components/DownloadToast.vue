<script setup lang="ts">
const { save } = useDownloadToast()

// A finished save fades away on its own; a new file replaces the old one right away.
let timer: ReturnType<typeof setTimeout> | undefined
watch(save, (v) => {
  clearTimeout(timer)
  if (v?.state === 'saved') timer = setTimeout(() => { save.value = null }, v.quarantined ? 14000 : 9000)
})
onBeforeUnmount(() => clearTimeout(timer))

const failed = ref(false)
async function reveal() {
  if (!save.value?.path) return
  failed.value = false
  try { await $fetch('/api/files/reveal', { method: 'POST', body: { path: save.value.path } }) } catch { failed.value = true }
}
const slot = computed(() => (save.value ? `${save.value.state}|${save.value.name}|${save.value.path ?? ''}` : ''))
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex justify-center px-4 pb-[env(safe-area-inset-bottom)]" aria-live="polite">
      <Transition name="toast" mode="out-in">
        <div
          v-if="save"
          :key="slot"
          class="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border p-4 shadow-2xl"
          :class="save.state === 'working' ? 'border-slate-200 bg-white' : save.quarantined ? 'border-amber-200 bg-amber-50' : 'border-brand-100 bg-white'"
          role="status"
        >
          <span class="grid size-9 shrink-0 place-items-center rounded-full" :class="save.state === 'working' ? 'bg-slate-100 text-slate-500' : 'bg-brand-50 text-brand-600'">
            <svg v-if="save.state === 'working'" viewBox="0 0 24 24" class="size-5 animate-spin" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 11-6.2-8.6" /></svg>
            <svg v-else viewBox="0 0 24 24" class="toast-check size-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-slate-900">{{ save.state === 'working' ? 'Decrypting and saving…' : 'Saved' }}</p>
            <p class="truncate text-xs text-slate-700">{{ save.name }}</p>
            <p v-if="save.state === 'saved'" class="mt-0.5 break-all text-xs text-slate-500">
              <template v-if="failed">Could not open the folder. </template>
              <template v-if="save.path">{{ save.path }}</template>
              <template v-else>Your browser saved it to its download folder.</template>
              <template v-if="save.quarantined"> Renamed with .quarantine so it cannot run by accident.</template>
            </p>
          </div>
          <button v-if="save.state === 'saved' && save.path" type="button" class="btn-ghost shrink-0" @click="reveal">Show in folder</button>
          <button v-if="save.state === 'saved'" type="button" class="shrink-0 px-1.5 py-1.5 text-slate-400 hover:text-slate-700" aria-label="Dismiss" @click="save = null">
            <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>
