<script setup lang="ts">
// Rotating verification code (30 s). Owner side fetches its own key; the upload page passes the key it received.
// `offset` = server time minus local time, so a wrong device clock does not break the match.
const props = defineProps<{ publicKey?: string, offset?: number, hint?: string }>()
const pub = ref(props.publicKey ?? '')
const code = ref('')
const left = ref(30)
let timer: ReturnType<typeof setInterval> | undefined
let win = -1

async function tick() {
  if (!pub.value) return
  const now = Date.now() + (props.offset ?? 0)
  left.value = Math.ceil((CODE_STEP_MS - (now % CODE_STEP_MS)) / 1000)
  const w = Math.floor(now / CODE_STEP_MS)
  if (w !== win) {
    win = w
    code.value = await keyCode(pub.value, now)
  }
}

onMounted(async () => {
  if (!pub.value) {
    try { pub.value = (await $fetch<{ publicKey: string }>('/api/auth/vault')).publicKey } catch { return }
  }
  await tick()
  timer = setInterval(tick, 250)
})
onBeforeUnmount(() => clearInterval(timer))

const R = 15
const C = 2 * Math.PI * R
</script>

<template>
  <div v-if="code">
    <div class="flex items-center justify-between gap-3">
      <p class="min-w-0 font-mono text-2xl font-semibold tracking-[0.1em] text-slate-900 sm:text-3xl sm:tracking-[0.12em]">{{ code }}</p>
      <div class="relative size-11 shrink-0" :title="`Changes in ${left}s`">
        <svg viewBox="0 0 36 36" class="size-full -rotate-90">
          <circle cx="18" cy="18" :r="R" fill="none" stroke="currentColor" class="text-slate-200" stroke-width="3" />
          <circle cx="18" cy="18" :r="R" fill="none" stroke="currentColor" :class="left <= 5 ? 'text-slate-400' : 'text-brand-600'" stroke-width="3" stroke-linecap="round" :stroke-dasharray="C" :stroke-dashoffset="C * (1 - left / 30)" style="transition: stroke-dashoffset 0.25s linear" />
        </svg>
        <span class="absolute inset-0 grid place-items-center text-xs font-semibold tabular-nums text-slate-700">{{ left }}</span>
      </div>
    </div>
    <p v-if="hint" class="mt-2 text-xs leading-relaxed text-slate-600">{{ hint }}</p>
  </div>
</template>
