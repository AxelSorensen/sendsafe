<script setup lang="ts">
// First-run walkthrough, kept short: a welcome, then the three things worth knowing. Re-openable from Settings.
const emit = defineEmits<{ done: [] }>()
const step = ref(0)
const steps = [
  { welcome: true, title: 'Welcome to SendSafe', body: 'Receive files privately. Everything is encrypted, and only you can open it.' },
  { icon: 'link', title: 'Share your link', body: 'Copy your link from the Inbox and send it to the person with files for you. Only the link goes out, never the files.' },
  { icon: 'inbox', title: 'Files arrive here', body: 'They upload through your link, encrypted in their browser. New files land in your Inbox and you get a notification. Keep SendSafe running to receive them.' },
  { icon: 'lock', title: 'Only you can open them', body: 'Your password and authenticator code unlock your files. We cannot reset your password, so keep it somewhere safe.' }
]
const current = computed(() => steps[step.value]!)
const last = computed(() => step.value === steps.length - 1)
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 grid h-dvh w-screen place-items-center bg-slate-900/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div class="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl sm:p-8">
        <div class="grid h-28 place-items-center">
          <svg v-if="current.welcome" viewBox="100 100 824 824" class="size-20" aria-hidden="true">
            <rect x="100" y="100" width="824" height="824" rx="185" fill="#2563eb" />
            <path d="M512 232a190 190 0 0 1 112 344l44 218a30 30 0 0 1-30 36H386a30 30 0 0 1-30-36l44-218A190 190 0 0 1 512 232z" fill="#fff" transform="translate(512 512) scale(0.76) translate(-512 -531)" />
          </svg>
          <div v-else class="grid size-20 place-items-center rounded-full bg-brand-50 text-brand-600">
            <svg viewBox="0 0 24 24" class="size-9" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <template v-if="current.icon === 'link'"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></template>
              <template v-else-if="current.icon === 'inbox'"><path d="M3 13l3-8h12l3 8v6a1 1 0 01-1 1H4a1 1 0 01-1-1z" /><path d="M3 13h5l1 3h6l1-3h5" /></template>
              <template v-else><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 118 0v3" /></template>
            </svg>
          </div>
        </div>

        <h2 id="ob-title" class="mt-2 text-xl font-semibold tracking-tight">{{ current.title }}</h2>
        <p class="mx-auto mt-2 min-h-24 max-w-xs text-sm leading-relaxed text-slate-500">{{ current.body }}</p>

        <div class="mt-4 flex justify-center gap-1.5" aria-hidden="true">
          <span v-for="(_, i) in steps" :key="i" class="size-1.5 rounded-full transition" :class="i === step ? 'bg-brand-600' : 'bg-slate-200'" />
        </div>

        <div class="mt-6 flex items-center gap-2">
          <button v-if="step > 0" type="button" class="btn-ghost" @click="step--">Back</button>
          <button v-else type="button" class="btn-ghost" @click="emit('done')">Skip</button>
          <button type="button" class="btn ml-auto min-w-28" @click="last ? emit('done') : step++">{{ last ? 'Get started' : step === 0 ? 'Start' : 'Next' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
