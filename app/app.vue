<script setup lang="ts">
// Inside the Tauri desktop app the native title bar is an overlay: paint our own blue strip under it.
const inDesktop = ref(false)
// The desktop window has no browser menu, so give it Cmd/Ctrl+R to reload.
function onReloadKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') { e.preventDefault(); location.reload() }
}
onMounted(() => {
  window.addEventListener('keydown', onReloadKey)
  inDesktop.value = !!(window as any).__TAURI_INTERNALS__ && /Mac/.test(navigator.platform)
  document.documentElement.style.setProperty('--titlebar', inDesktop.value ? '2.25rem' : '0px')
})

function drag(e: MouseEvent) {
  if (e.button !== 0) return
  const t = (window as any).__TAURI_INTERNALS__
  if (e.detail === 2) t.invoke('plugin:window|toggle_maximize')
  else t.invoke('plugin:window|start_dragging')
}
</script>

<template>
  <div class="min-h-screen pt-[var(--titlebar,0px)]">
    <div v-if="inDesktop" class="fixed inset-x-0 top-0 z-40 grid h-9 select-none place-items-center bg-brand-100 text-xs font-semibold tracking-wide text-brand-700" @mousedown="drag">SendSafe</div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
