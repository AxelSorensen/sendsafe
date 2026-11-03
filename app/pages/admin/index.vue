<script setup lang="ts">
useHead({ title: 'Inbox | SendSafe' })
definePageMeta({ layout: 'admin', middleware: 'auth' })

interface FileRow { id: string, enc: string, size: number, created_at: number, link_label: string }

const { privateKey } = useVault()
const { tunnel } = useTunnel()
const links = ref<LinkRow[]>([])
const files = ref<(FileRow & { name: string })[]>([])
const error = ref('')
const copied = ref(false)
const busyId = ref('')
const creating = ref(false)
const modal = ref<'' | 'create' | 'edit'>('')
const s = reactive({ hours: 720, maxFiles: 100, maxFileMb: 100 })
const viewingId = ref('')
// Read state (like mail): ids the user has opened or downloaded, kept in this browser.
const seen = ref<string[]>([])
const SEEN_KEY = 'sendsafe-seen'
function markSeen(id: string) {
  if (seen.value.includes(id)) return
  seen.value = [...seen.value, id]
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen.value)) } catch {}
}
// "New" tag: files first shown to you just now. Cleared by any click/key, by leaving the page, or when the window loses focus.
const fresh = ref<string[]>([])
const KNOWN_KEY = 'sendsafe-known'
let known: Set<string> | null = null
function trackNew(ids: string[]) {
  if (!import.meta.client) return
  if (!known) {
    let stored: string[] | null = null
    try { const raw = localStorage.getItem(KNOWN_KEY); stored = raw ? JSON.parse(raw) : null } catch {}
    known = new Set(stored ?? ids) // first run: everything already here counts as known
  }
  const added = ids.filter(id => !known!.has(id))
  if (!added.length) return
  added.forEach(id => known!.add(id))
  fresh.value = [...fresh.value, ...added]
  try { localStorage.setItem(KNOWN_KEY, JSON.stringify([...known])) } catch {}
}
const clearFresh = () => { if (fresh.value.length) fresh.value = [] }
// The click that activates the window must not count as interaction.
let focusedAt = 0
const onPointer = () => { if (Date.now() - focusedAt > 400) clearFresh() }
function openFile(id: string) {
  markSeen(id)
  viewingId.value = id
}
const viewing = computed(() => files.value.find(f => f.id === viewingId.value))

const active = computed(() => links.value.find(l => linkState(l) === 'active' && l.token_enc))

let lastSig = ''
async function refresh(force = true) {
  links.value = await $fetch<LinkRow[]>('/api/links')
  const rows = await $fetch<FileRow[]>('/api/files')
  // Silent polls skip the (costly) decrypt when nothing changed.
  const sig = rows.map(r => r.id).join(',')
  if (!force && sig === lastSig) return
  lastSig = sig
  trackNew(rows.map(r => r.id))
  files.value = await Promise.all(rows.map(async (r) => {
    let name = 'Locked file'
    if (privateKey.value) {
      try { name = (await decryptMeta(privateKey.value, r.enc)).name } catch { name = '(undecryptable)' }
    }
    return { ...r, name }
  }))
}

// Auto-refresh: poll while the window is visible, and catch up right when it regains focus.
let autoTimer: ReturnType<typeof setInterval> | undefined
const autoRefresh = () => { if (!document.hidden) refresh(false).catch(() => {}) }
// Regaining focus: pick up anything that arrived while away. Tags are dropped on blur, not here.
const onFocus = () => { focusedAt = Date.now(); autoRefresh() }
onMounted(() => {
  try { seen.value = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') } catch {}
  autoTimer = setInterval(autoRefresh, 4000)
  window.addEventListener('focus', onFocus)
  window.addEventListener('blur', clearFresh)
  window.addEventListener('pointerdown', onPointer, true)
  window.addEventListener('keydown', clearFresh, true)
  document.addEventListener('visibilitychange', autoRefresh)
})
onBeforeUnmount(() => {
  clearInterval(autoTimer)
  window.removeEventListener('focus', onFocus)
  window.removeEventListener('blur', clearFresh)
  window.removeEventListener('pointerdown', onPointer, true)
  window.removeEventListener('keydown', clearFresh, true)
  document.removeEventListener('visibilitychange', autoRefresh)
})

const refreshing = ref(false)
async function manualRefresh() {
  refreshing.value = true
  try {
    await refresh()
  } catch {
    error.value = 'Could not refresh.'
  } finally {
    refreshing.value = false
  }
}

async function copy() {
  if (!active.value || !privateKey.value) return
  error.value = ''
  try {
    await copyLink(privateKey.value, active.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1800)
  } catch {
    error.value = 'Could not copy link.'
  }
}

async function makeLink() {
  creating.value = true
  error.value = ''
  try {
    await createLink({ label: 'Sharing link', expiresInHours: s.hours, maxFiles: s.maxFiles, maxFileMb: s.maxFileMb })
    modal.value = ''
    await refresh()
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Could not create link.'
  } finally {
    creating.value = false
  }
}

function openCreate() {
  Object.assign(s, { hours: 720, maxFiles: 100, maxFileMb: 100 })
  modal.value = 'create'
}

function openSettings() {
  if (!active.value) return
  s.hours = Math.max(1, Math.round((active.value.expires_at - Date.now()) / 3600_000))
  s.maxFiles = active.value.max_files
  s.maxFileMb = Math.round(active.value.max_bytes / 1024 / 1024)
  modal.value = 'edit'
}

async function saveSettings() {
  if (!active.value) return
  creating.value = true
  error.value = ''
  try {
    await $fetch(`/api/links/${active.value.id}`, {
      method: 'PATCH',
      body: { expiresInHours: s.hours, maxFiles: s.maxFiles, maxFileMb: s.maxFileMb }
    })
    modal.value = ''
    await refresh()
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Could not save settings.'
  } finally {
    creating.value = false
  }
}

async function disableLink() {
  if (!active.value) return
  await $fetch(`/api/links/${active.value.id}`, { method: 'DELETE' })
  modal.value = ''
  await refresh()
}

async function download(item: { id: string }) {
  const f = files.value.find(x => x.id === item.id)
  if (!f || !privateKey.value) return
  markSeen(f.id)
  busyId.value = f.id
  try {
    const cipher = await $fetch<Blob>(`/api/files/${f.id}`, { responseType: 'blob' })
    const meta = await decryptMeta(privateKey.value, f.enc)
    const plain = await decryptFile(privateKey.value, f.enc, await cipher.arrayBuffer())
    const url = URL.createObjectURL(new Blob([plain], { type: meta.type || 'application/octet-stream' }))
    const a = document.createElement('a')
    a.href = url
    a.download = meta.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } catch {
    error.value = 'Decryption failed.'
  } finally {
    busyId.value = ''
  }
}

async function remove(id: string) {
  await $fetch(`/api/files/${id}`, { method: 'DELETE' })
  await refresh()
}

const fmt = (t: number) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
const size = (n: number) => (n / 1024 / 1024 >= 1 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`)

await refresh()
watch(privateKey, () => refresh())
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-6">
    <section class="flex shrink-0 flex-col gap-4 rounded-xl border border-brand-100 bg-brand-50 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <h1 class="text-base font-semibold">Your sharing link</h1>
        <p class="mt-1 text-sm text-slate-600">
          <template v-if="!tunnel.enabled">The sharing server is off. Turn it on in <NuxtLink to="/admin/settings#sharing" class="font-medium text-brand-700 underline">Settings</NuxtLink> for your links to work or to create a link.</template>
          <template v-else-if="active">Anyone with this link can send you files. Expires {{ fmt(active.expires_at) }}.</template>
          <template v-else>Create a link, send it to someone, and their files appear below.</template>
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <NuxtLink v-if="!tunnel.enabled" to="/admin/settings#sharing" class="btn">Turn on in Settings</NuxtLink>
        <template v-else-if="active">
          <button type="button" class="mr-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline" @click="openSettings">
            <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>
            Link settings
          </button>
          <button :disabled="!privateKey" class="btn" @click="copy">{{ copied ? 'Copied' : 'Copy link' }}</button>
        </template>
        <button v-else :disabled="creating" class="btn" @click="openCreate">Create link</button>
      </div>
    </section>

    <Teleport to="body">
      <div
        v-if="modal"
        class="fixed inset-0 z-50 grid h-dvh w-screen place-items-center overscroll-none bg-slate-900/80 p-4 backdrop-blur-sm"
        @click.self="modal = ''"
        @keydown.esc="modal = ''"
      >
        <form class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl" @submit.prevent="modal === 'create' ? makeLink() : saveSettings()">
          <div class="px-6 pt-6">
            <h2 class="text-lg font-semibold tracking-tight">{{ modal === 'create' ? 'Create sharing link' : 'Link settings' }}</h2>
            <p class="mt-1 text-sm text-slate-500">
              {{ modal === 'create' ? 'Choose the limits for anyone who uses this link.' : 'Changes apply to the same link. Its URL stays the same.' }}
            </p>
          </div>
          <div class="space-y-4 px-6 py-5">
            <div>
              <label class="label" for="s-hours">Expires after</label>
              <div class="relative">
                <input id="s-hours" v-model.number="s.hours" type="number" min="1" max="2160" class="field pr-16">
                <span class="pointer-events-none absolute inset-y-0 right-3 grid items-center text-sm text-slate-400">hours</span>
              </div>
              <p class="mt-1 text-xs text-slate-500">{{ s.hours >= 24 ? `About ${Math.round(s.hours / 24)} day${Math.round(s.hours / 24) === 1 ? '' : 's'}` : 'Less than a day' }}, up to 90 days.</p>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="label" for="s-files">Max files</label>
                <input id="s-files" v-model.number="s.maxFiles" type="number" min="1" max="500" class="field">
              </div>
              <div>
                <label class="label" for="s-mb">Max file size</label>
                <div class="relative">
                  <input id="s-mb" v-model.number="s.maxFileMb" type="number" min="1" max="500" class="field pr-11">
                  <span class="pointer-events-none absolute inset-y-0 right-3 grid items-center text-sm text-slate-400">MB</span>
                </div>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
            <button v-if="modal === 'edit'" type="button" class="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50" @click="disableLink">Disable link</button>
            <span v-else />
            <div class="flex gap-2">
              <button type="button" class="btn-ghost" @click="modal = ''">Cancel</button>
              <button type="submit" class="btn" :disabled="creating">
                {{ modal === 'create' ? (creating ? 'Creating…' : 'Create link') : (creating ? 'Saving…' : 'Save') }}
              </button>
            </div>
          </div>
        </form>
      </div>
    </Teleport>

    <p v-if="error" class="alert-error">{{ error }}</p>

    <FileViewer
      v-if="viewing && privateKey"
      :file="viewing"
      :private-key="privateKey"
      @close="viewingId = ''"
      @download="download(viewing)"
    />
    <InboxTable :files="files" :locked="!privateKey" :busy-id="busyId" :refreshing="refreshing" :seen="seen" :fresh="fresh" @refresh="manualRefresh" @view="f => openFile(f.id)" @download="download" @remove="f => remove(f.id)" />
  </div>
</template>
