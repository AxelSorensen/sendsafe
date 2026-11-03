<script setup lang="ts">
// "v0.1.4 · Check for updates" for the signed-out screens. Only shows in the desktop app.
const { state, loadVersion, check, install, available } = useUpdater()
const show = ref(false)
onMounted(async () => {
  show.value = available()
  if (!show.value) return
  await loadVersion()
  check(true)
})
</script>

<template>
  <p v-if="show" class="mt-2 flex flex-wrap items-center justify-center gap-x-2 text-xs text-slate-400">
    <span>SendSafe {{ state.version ? 'v' + state.version : '' }}</span>
    <span aria-hidden="true">·</span>
    <template v-if="state.status === 'available'">
      <button type="button" class="font-medium text-brand-600 hover:underline" @click="install">Update to v{{ state.latest }} and restart</button>
    </template>
    <span v-else-if="state.status === 'checking'">Checking…</span>
    <span v-else-if="state.status === 'downloading'">Updating… {{ state.progress }}%</span>
    <span v-else-if="state.status === 'uptodate'">Up to date</span>
    <span v-else-if="state.status === 'error'" class="text-red-600">{{ state.error }}</span>
    <button v-else type="button" class="hover:text-slate-600 hover:underline" @click="check()">Check for updates</button>
  </p>
</template>
