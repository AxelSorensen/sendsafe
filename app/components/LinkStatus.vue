<script setup lang="ts">
// Full-card state for an upload link that cannot be used right now. Same look as the rest of the app.
defineProps<{ kind: 'closed' | 'offline' | 'invalid', checking?: boolean }>()
const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="card p-6 text-center sm:p-8">
    <div class="mx-auto grid size-14 place-items-center rounded-full bg-brand-50 text-brand-600">
      <svg viewBox="0 0 24 24" class="size-7" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <!-- closed: power -->
        <template v-if="kind === 'closed'"><path d="M12 3v8" /><path d="M6.3 7.3a8 8 0 1011.4 0" /></template>
        <!-- offline: cloud with a slash -->
        <template v-else-if="kind === 'offline'"><path d="M7 18a4 4 0 01-.6-7.95A6 6 0 0117.7 8.6 4.5 4.5 0 0117 18z" /><path d="M4 4l16 16" /></template>
        <!-- invalid or expired: lock -->
        <template v-else><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 118 0v3" /></template>
      </svg>
    </div>

    <h1 class="mt-4 text-xl font-semibold tracking-tight">
      {{ kind === 'closed' ? 'This link is closed' : kind === 'offline' ? 'Cannot reach the recipient' : 'This link is invalid or expired' }}
    </h1>
    <p class="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
      <template v-if="kind === 'closed'">The recipient has turned sharing off for now. Nothing was sent. Keep this page open and it will reopen by itself when they turn it back on.</template>
      <template v-else-if="kind === 'offline'">The connection was lost. Any files that were still sending were not delivered. This page keeps trying and will continue when the connection is back.</template>
      <template v-else>Ask the sender for a new link.</template>
    </p>
    <template v-if="kind !== 'invalid'">
      <p class="mt-5 inline-flex items-center gap-2 text-xs text-slate-500">
        <span class="size-2 animate-pulse rounded-full bg-slate-400" />
        Checking again automatically
      </p>
      <button type="button" class="btn-ghost mx-auto mt-3 flex" :disabled="checking" @click="emit('retry')">{{ checking ? 'Checking…' : 'Check now' }}</button>
    </template>
  </div>
</template>

