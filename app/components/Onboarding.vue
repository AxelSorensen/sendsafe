<script setup lang="ts">
// First-run walkthrough: the actual things you do. Re-openable from Settings.
const emit = defineEmits<{ done: [] }>()
const step = ref(0)
const steps = [
  { title: 'Share your SendSafe link', body: 'Copy your link from the Inbox page and send it to the person who has files for you, by text, chat or email. Only the link goes out, never the files. Keep SendSafe open and the sharing server on so the link works.' },
  { title: 'They upload through the link', body: 'They open the link, pick their files and press send. Everything is encrypted in their browser before it leaves their device. If they want to be sure it is really you, they can call and compare the verification code in Settings.' },
  { title: 'It shows up in your inbox', body: 'New files land in your Inbox and you get a notification. Open or download them any time. Nothing is ever emailed or left in a shared cloud folder.' },
  { title: 'It stays only on your computer', body: 'Files are never sent by email or left in a shared folder. If you use the Cloudflare relay, they wait there encrypted and unreadable until this app downloads them, then they are deleted. After that they live only on this computer.' },
  { title: 'Safe even if your laptop is stolen', body: 'Your files can only be opened with your password and your authenticator code. Without them, whoever has the laptop sees nothing readable. We cannot reset your password, so keep it somewhere safe.' }
]
const last = computed(() => step.value === steps.length - 1)
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 grid h-dvh w-screen place-items-center bg-slate-900/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div class="flex gap-1.5 px-6 pt-5">
          <span v-for="(_, i) in steps" :key="i" class="h-1 flex-1 rounded-full transition" :class="i <= step ? 'bg-brand-600' : 'bg-slate-200'" />
        </div>

        <div class="mx-6 mt-5 grid h-36 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-50 to-slate-50 text-brand-600">
          <!-- 0: link -> message to a friend -->
          <svg v-if="step === 0" viewBox="0 0 300 120" class="h-full w-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <g class="text-slate-400"><rect x="20" y="30" width="72" height="52" rx="8" fill="white" /><path d="M10 92h92" /></g>
            <g><rect x="32" y="50" width="48" height="14" rx="7" fill="currentColor" stroke="none" /><path d="M42 57h28" stroke="white" /></g>
            <path class="flow" d="M104 57h60" stroke-dasharray="4 6" />
            <g class="pop"><rect x="178" y="26" width="104" height="58" rx="12" fill="white" /><path d="M200 82l-8 12 20-12" fill="white" /><rect x="194" y="42" width="72" height="10" rx="5" fill="currentColor" stroke="none" opacity=".25" /><rect x="194" y="58" width="44" height="10" rx="5" fill="currentColor" stroke="none" /></g>
            <text x="56" y="108" class="fill-slate-500" font-size="9" stroke="none" text-anchor="middle">Your link</text>
            <text x="230" y="108" class="fill-slate-500" font-size="9" stroke="none" text-anchor="middle">Sent as a message</text>
          </svg>
          <!-- 1: phone uploads, encrypted on the way -->
          <svg v-else-if="step === 1" viewBox="0 0 300 120" class="h-full w-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <g class="text-slate-400"><rect x="28" y="12" width="56" height="96" rx="10" fill="white" /><path d="M48 98h16" /></g>
            <g><path d="M56 48V34m0 0l-7 7m7-7l7 7" /><rect x="42" y="56" width="28" height="22" rx="4" fill="currentColor" stroke="none" opacity=".2" /><path d="M48 64h16M48 70h10" /></g>
            <path class="flow" d="M96 60h48" stroke-dasharray="4 6" />
            <g class="pop"><circle cx="168" cy="60" r="22" fill="white" /><rect x="158" y="58" width="20" height="14" rx="3" fill="currentColor" stroke="none" /><path d="M162 58v-4a6 6 0 0112 0v4" /></g>
            <path class="flow" d="M194 60h40" stroke-dasharray="4 6" />
            <g class="text-slate-400"><rect x="240" y="38" width="44" height="34" rx="6" fill="white" /><path d="M232 80h60" /></g>
            <text x="56" y="116" class="fill-slate-500" font-size="8" stroke="none" text-anchor="middle">They send</text>
            <text x="168" y="100" class="fill-slate-500" font-size="8" stroke="none" text-anchor="middle">Encrypted first</text>
            <text x="262" y="96" class="fill-slate-500" font-size="8" stroke="none" text-anchor="middle">You</text>
          </svg>
          <!-- 2: inbox + notification -->
          <svg v-else-if="step === 2" viewBox="0 0 300 120" class="h-full w-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <g class="text-slate-300"><rect x="50" y="22" width="200" height="82" rx="10" fill="white" /><path d="M50 42h200" /></g>
            <g class="text-slate-300"><rect x="64" y="52" width="130" height="10" rx="5" fill="currentColor" stroke="none" opacity=".5" /><rect x="64" y="72" width="100" height="10" rx="5" fill="currentColor" stroke="none" opacity=".5" /></g>
            <g class="slide"><rect x="64" y="86" width="150" height="10" rx="5" fill="currentColor" stroke="none" /><rect x="222" y="86" width="20" height="10" rx="5" fill="currentColor" stroke="none" opacity=".35" /></g>
            <g class="bell"><circle cx="246" cy="22" r="14" fill="currentColor" stroke="none" /><path d="M240 27h12l-2-3v-4a4 4 0 00-8 0v4z" fill="white" stroke="white" stroke-width="1.5" /></g>
          </svg>
          <!-- 3: stays on your computer, not in mail or cloud -->
          <svg v-else-if="step === 3" viewBox="0 0 300 120" class="h-full w-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <g class="text-slate-300"><path d="M44 70a14 14 0 012-27 18 18 0 0134 3 12 12 0 012 24z" fill="white" /><rect x="198" y="44" width="48" height="34" rx="5" fill="white" /><path d="M198 48l24 17 24-17" /></g>
            <g class="text-red-400"><path d="M36 40l56 40M36 80l56-40" opacity="0" /><circle cx="64" cy="58" r="22" fill="none" stroke-width="2.5" /><path d="M48 74l32-32" stroke-width="2.5" /><circle cx="222" cy="58" r="30" fill="none" stroke-width="2.5" /><path d="M201 79l42-42" stroke-width="2.5" /></g>
            <g class="pop"><rect x="118" y="30" width="64" height="44" rx="6" fill="white" /><path d="M108 84h84" /><rect x="138" y="44" width="24" height="16" rx="3" fill="currentColor" stroke="none" /><path d="M143 44v-3a7 7 0 0114 0v3" /></g>
            <text x="64" y="106" class="fill-slate-500" font-size="8" stroke="none" text-anchor="middle">No cloud drive</text>
            <text x="150" y="106" class="fill-slate-500" font-size="8" stroke="none" text-anchor="middle">Ends up here</text>
            <text x="222" y="106" class="fill-slate-500" font-size="8" stroke="none" text-anchor="middle">No email</text>
          </svg>
          <!-- 4: stolen laptop stays locked -->
          <svg v-else viewBox="0 0 300 120" class="h-full w-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <g class="text-slate-400"><rect x="92" y="22" width="116" height="70" rx="8" fill="white" /><path d="M78 100h144" /></g>
            <g class="pop"><rect x="132" y="50" width="36" height="26" rx="5" fill="currentColor" stroke="none" /><path d="M139 50v-6a11 11 0 0122 0v6" /></g>
            <g class="spark"><circle cx="52" cy="60" r="14" fill="white" class="text-slate-300" /><circle cx="52" cy="55" r="4" class="text-slate-400" /><path d="M44 70a8 8 0 0116 0" class="text-slate-400" /><path d="M72 60h8" stroke-dasharray="2 4" class="text-slate-400" /><circle cx="248" cy="60" r="14" fill="none" class="text-red-400" stroke-width="2.5" /><path d="M238 70l20-20" class="text-red-400" stroke-width="2.5" /></g>
            <text x="150" y="114" class="fill-slate-500" font-size="8" stroke="none" text-anchor="middle">Password + authenticator only</text>
          </svg>
        </div>

        <div class="min-h-56 px-6 pb-2 pt-5">
          <p class="text-xs font-medium text-slate-500">Step {{ step + 1 }} of {{ steps.length }}</p>
          <h2 class="mt-1 text-lg font-semibold tracking-tight">{{ steps[step]!.title }}</h2>
          <p class="mt-2 text-sm leading-relaxed text-slate-600">{{ steps[step]!.body }}</p>
        </div>
        <div class="flex items-center justify-between gap-3 px-6 pb-6 pt-4">
          <button v-if="!last" type="button" class="text-sm text-slate-500 hover:text-slate-800" @click="emit('done')">Skip</button>
          <span v-else />
          <div class="flex gap-2">
            <button v-if="step > 0" type="button" class="btn-ghost" @click="step--">Back</button>
            <button type="button" class="btn" @click="last ? emit('done') : step++">{{ last ? 'Get started' : 'Next' }}</button>
          </div>
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
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
