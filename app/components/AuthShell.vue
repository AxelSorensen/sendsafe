<script setup lang="ts">
defineProps<{ title: string, subtitle?: string }>()
</script>

<template>
  <main class="fade-in grid min-h-screen place-items-center px-4 py-12">
    <div class="w-full max-w-md">
      <div class="mb-8 flex justify-center"><BrandLogo /></div>
      <div class="card p-7 sm:p-8">
        <h1 class="text-xl font-semibold tracking-tight">{{ title }}</h1>
        <p v-if="subtitle" class="mt-1.5 text-sm leading-relaxed text-slate-500">{{ subtitle }}</p>
        <div class="mt-6"><slot /></div>
      </div>
      <p class="mt-6 text-center text-xs text-slate-400">End-to-end encrypted · zero-knowledge server</p>
      <UpdateLine />
    </div>
  </main>
</template>
