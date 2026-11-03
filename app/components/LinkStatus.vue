<script setup lang="ts">
// Full-card state for an upload link that cannot be used right now. Same look as the rest of the app.
defineProps<{ kind: 'closed' | 'offline' | 'invalid', checking?: boolean }>()
const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="card overflow-hidden text-center">
    <div class="grid h-32 place-items-center bg-gradient-to-br from-brand-50 to-slate-50 text-brand-600">
      <!-- closed: the switch is off, the line to the recipient is cut -->
      <svg v-if="kind === 'closed'" viewBox="0 0 300 120" class="h-full w-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <g class="text-slate-400"><circle cx="64" cy="58" r="20" fill="white" /><circle cx="64" cy="52" r="6" /><path d="M52 70a12 12 0 0124 0" /></g>
        <path d="M92 58h40" stroke-dasharray="4 6" class="text-slate-300" />
        <g class="text-slate-300"><path d="M142 48l8 20M150 48l-8 20" opacity="0" /></g>
        <g><rect x="160" y="46" width="44" height="24" rx="12" fill="white" class="text-slate-300" /><circle class="knob" cx="172" cy="58" r="8" fill="currentColor" stroke="none" /></g>
        <path d="M214 58h28" stroke-dasharray="4 6" class="text-slate-300" />
        <g class="text-slate-300"><rect x="250" y="38" width="32" height="40" rx="6" fill="white" /><path d="M244 86h44" /></g>
      </svg>
      <!-- offline: connection lost -->
      <svg v-else-if="kind === 'offline'" viewBox="0 0 300 120" class="h-full w-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <g class="text-slate-300"><path d="M104 78a20 20 0 013-39 26 26 0 0150 5 17 17 0 012 34z" fill="white" /></g>
        <g class="blink"><path d="M130 86l40-52" stroke-width="3" class="text-amber-500" /></g>
        <g class="text-slate-400"><path d="M200 60h-16M250 60h-16" stroke-dasharray="3 5" /><circle cx="262" cy="60" r="4" fill="currentColor" stroke="none" /></g>
      </svg>
      <!-- invalid / expired -->
      <svg v-else viewBox="0 0 300 120" class="h-full w-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <g class="text-slate-300"><path d="M118 36a16 16 0 0132 0v14" /><rect x="108" y="50" width="52" height="38" rx="8" fill="white" /></g>
        <g class="blink"><path d="M126 62l16 16M142 62l-16 16" stroke-width="3" class="text-slate-500" /></g>
        <text x="134" y="106" class="fill-slate-500" font-size="8" stroke="none" text-anchor="middle">Expired</text>
      </svg>
    </div>

    <div class="px-6 pb-7 pt-6 sm:px-8">
      <h1 class="text-xl font-semibold tracking-tight">
        {{ kind === 'closed' ? 'This link is closed' : kind === 'offline' ? 'Cannot reach the recipient' : 'This link is invalid or expired' }}
      </h1>
      <p class="mt-2 text-sm leading-relaxed text-slate-500">
        <template v-if="kind === 'closed'">The recipient has turned sharing off for now. Nothing was sent. Keep this page open and it will reopen by itself when they turn it back on.</template>
        <template v-else-if="kind === 'offline'">The connection was lost. Any files that were still sending were not delivered. This page keeps trying and will continue when the connection is back.</template>
        <template v-else>Ask the sender for a new link.</template>
      </p>
      <template v-if="kind !== 'invalid'">
        <p class="mt-5 inline-flex items-center gap-2 text-xs text-slate-500">
          <span class="size-2 animate-pulse rounded-full bg-amber-500" />
          Checking again automatically
        </p>
        <button type="button" class="btn-ghost mx-auto mt-3 flex" :disabled="checking" @click="emit('retry')">{{ checking ? 'Checking…' : 'Check now' }}</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.knob { animation: fade 3s ease-in-out infinite; }
.blink { animation: fade 1.8s ease-in-out infinite; }
@keyframes fade { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
