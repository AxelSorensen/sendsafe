<script setup lang="ts">
// First-run walkthrough, kept short: a welcome, then the three things worth knowing. Re-openable from Settings.
const emit = defineEmits<{ done: [] }>()
const step = ref(0)
const steps = [
  { title: 'Welcome to SendSafe', body: 'Receive files privately. Everything is encrypted, and only you can open it.' },
  { title: 'Share your link', body: 'Copy your link from the Inbox and send it to the person with files for you. Only the link goes out, never the files.' },
  { title: 'Files arrive here', body: 'They upload through your link, encrypted in their browser. New files land in your Inbox and you get a notification. Keep SendSafe running to receive them.' },
  { title: 'Safe even if your computer is stolen', body: 'Your files are encrypted with a key that only your password unlocks, so whoever has the computer sees nothing readable. We cannot reset your password, so keep it somewhere safe.' }
]
const last = computed(() => step.value === steps.length - 1)
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 grid h-dvh w-screen place-items-center bg-slate-900/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div class="mx-6 mt-6 grid h-40 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-50 to-slate-50 text-brand-600">
          <Transition name="ob" mode="out-in">
          <!-- 0: welcome: the plain logo, no motion -->
          <svg v-if="step === 0" viewBox="100 100 824 824" class="size-20" aria-hidden="true">
            <rect x="100" y="100" width="824" height="824" rx="185" fill="#2563eb" />
            <path d="M512 232a190 190 0 0 1 112 344l44 218a30 30 0 0 1-30 36H386a30 30 0 0 1-30-36l44-218A190 190 0 0 1 512 232z" fill="#fff" transform="translate(512 512) scale(0.76) translate(-512 -531)" />
          </svg>
          <!-- 1: your link goes out as a message -->
          <svg v-else-if="step === 1" viewBox="0 0 300 120" class="h-full w-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <g class="text-slate-400"><rect x="20" y="30" width="72" height="52" rx="8" fill="white" /><path d="M10 92h92" /></g>
            <g><rect x="32" y="50" width="48" height="14" rx="7" fill="currentColor" stroke="none" /><path d="M42 57h28" stroke="white" /></g>
            <path class="flow" d="M104 57h60" stroke-dasharray="4 6" />
            <g class="pop"><rect x="178" y="26" width="104" height="58" rx="12" fill="white" /><path d="M200 82l-8 12 20-12" fill="white" /><rect x="194" y="42" width="72" height="10" rx="5" fill="currentColor" stroke="none" opacity=".25" /><rect x="194" y="58" width="44" height="10" rx="5" fill="currentColor" stroke="none" /></g>
          </svg>
          <!-- 2: new file lands in the inbox, bell rings -->
          <svg v-else-if="step === 2" viewBox="0 0 300 120" class="h-full w-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <g class="text-slate-300"><rect x="50" y="22" width="200" height="82" rx="10" fill="white" /><path d="M50 42h200" /></g>
            <g class="text-slate-300"><rect x="64" y="52" width="130" height="10" rx="5" fill="currentColor" stroke="none" opacity=".5" /><rect x="64" y="72" width="100" height="10" rx="5" fill="currentColor" stroke="none" opacity=".5" /></g>
            <g class="slide"><rect x="64" y="86" width="150" height="10" rx="5" fill="currentColor" stroke="none" /><rect x="222" y="86" width="20" height="10" rx="5" fill="currentColor" stroke="none" opacity=".35" /></g>
            <g class="bell"><circle cx="246" cy="22" r="14" fill="currentColor" stroke="none" /><path d="M240 27h12l-2-3v-4a4 4 0 00-8 0v4z" fill="white" stroke="white" stroke-width="1.5" /></g>
          </svg>
          <!-- 3: a locked laptop; nobody else gets in -->
          <svg v-else viewBox="0 0 300 120" class="h-full w-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <g class="text-slate-400"><rect x="92" y="22" width="116" height="70" rx="8" fill="white" /><path d="M78 100h144" /></g>
            <g class="pop"><rect x="132" y="50" width="36" height="26" rx="5" fill="currentColor" stroke="none" /><path d="M139 50v-6a11 11 0 0122 0v6" /></g>
            <g class="spark text-slate-400"><circle cx="52" cy="60" r="14" fill="white" /><circle cx="52" cy="55" r="4" /><path d="M44 70a8 8 0 0116 0" /><path class="flow" d="M72 60h14" stroke-dasharray="2 4" /></g>
            <g class="shake text-slate-400"><circle cx="248" cy="60" r="14" /><path d="M238 70l20-20" /></g>
          </svg>
          </Transition>
        </div>

        <div class="px-8 pt-6 text-center">
          <Transition name="ob" mode="out-in">
            <div :key="step">
              <h2 id="ob-title" class="text-xl font-semibold tracking-tight">{{ steps[step]!.title }}</h2>
              <p class="mx-auto mt-2 min-h-24 max-w-sm text-sm leading-relaxed text-slate-500">{{ steps[step]!.body }}</p>
            </div>
          </Transition>
        </div>

        <div class="flex justify-center gap-1.5 pt-1" aria-hidden="true">
          <span v-for="(_, i) in steps" :key="i" class="size-1.5 rounded-full transition" :class="i === step ? 'bg-brand-600' : 'bg-slate-200'" />
        </div>

        <div class="flex items-center gap-2 px-6 pb-6 pt-5">
          <button v-if="step > 0" type="button" class="btn-ghost" @click="step--">Back</button>
          <button v-else type="button" class="btn-ghost" @click="emit('done')">Skip</button>
          <button type="button" class="btn ml-auto min-w-28" @click="last ? emit('done') : step++">{{ last ? 'Get started' : step === 0 ? 'Start' : 'Next' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.flow { animation: flow 1s linear infinite; }
@keyframes flow { to { stroke-dashoffset: -20; } }
.pop { transform-box: fill-box; transform-origin: center; animation: pop 2.4s ease-in-out infinite; }
@keyframes pop { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
.slide { animation: slide 2.4s ease-out infinite; }
@keyframes slide { 0% { transform: translateX(40px); opacity: 0; } 35%, 100% { transform: translateX(0); opacity: 1; } }
.bell { transform-box: fill-box; transform-origin: center; animation: pop 1.6s ease-in-out infinite; }
.spark { animation: fade 2.4s ease-in-out infinite; }
@keyframes fade { 0%, 100% { opacity: .5; } 50% { opacity: 1; } }
.shake { transform-box: fill-box; transform-origin: center; animation: shake 2.4s ease-in-out infinite; }
@keyframes shake { 0%, 60%, 100% { transform: translateX(0); } 68% { transform: translateX(-3px); } 76% { transform: translateX(3px); } 84% { transform: translateX(-2px); } 92% { transform: translateX(2px); } }
.ob-enter-active, .ob-leave-active { transition: opacity .18s ease, transform .18s ease; }
.ob-enter-from { opacity: 0; transform: translateY(6px); }
.ob-leave-to { opacity: 0; transform: translateY(-6px); }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
