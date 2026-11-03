<script setup lang="ts">
const route = useRoute()
const token = String(route.params.token)

interface Info { label: string, ownerName: string, publicKey: string, filesLeft: number, maxFileBytes: number, expiresAt: number, now: number }
const info = ref<Info | null>(null)
// Server time minus device time, so a wrong device clock cannot break the code match.
const offset = ref(0)
type Item = { name: string, size: number, file: File, state: 'pending' | 'encrypting' | 'uploading' | 'done' | 'error', msg: string, pct: number }
const items = ref<Item[]>([])
const phase = ref<'form' | 'result'>('form')
const dragging = ref(false)

// Link state. `closed` = recipient switched sharing off, `offline` = no connection to them, `invalid` = revoked/expired.
type Status = 'ok' | 'closed' | 'offline' | 'invalid'
const status = ref<Status>('ok')
const checking = ref(false)

async function loadInfo(): Promise<Status | 'keep'> {
  try {
    const r = await fetch(`/api/upload/${token}`, { cache: 'no-store' })
    if (r.ok) {
      const i = await r.json() as Info
      info.value = i
      offset.value = i.now - Date.now()
      return 'ok'
    }
    if (r.status === 503) return 'closed'
    if (r.status === 404) return 'invalid'
    if (r.status === 429) return 'keep'
    return 'offline' // 5xx from the tunnel/edge: the recipient is not reachable
  } catch {
    return 'offline'
  }
}

let fails = 0
async function check(initial = false) {
  if (checking.value || (!initial && (document.hidden || sending.value))) return
  checking.value = true
  try {
    const s = await loadInfo()
    if (s === 'keep') return
    if (s === 'offline') {
      // One failed poll is noise; two in a row means the connection is really gone.
      if (!initial && status.value === 'ok' && ++fails < 2) return
    } else fails = 0
    status.value = s
  } finally {
    checking.value = false
  }
}


const mb = (n: number) => Math.round(n / 1024 / 1024)
const fmtSize = (n: number) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(Math.round(n / 1024), 1)} KB`

const staged = ref<File[]>([])
const barShown = computed(() => status.value === 'ok' && (phase.value === 'result' || staged.value.length > 0))
// Room reserved under the page for the fixed bottom bar (list of up to 3 rows + button), phones only.
const barSpace = computed(() => phase.value === 'result' ? '8rem' : `${9 + Math.min(staged.value.length, 3) * 2.75}rem`)
const sending = ref(false)
const expiresText = computed(() => info.value ? new Date(info.value.expiresAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '')
const slotsLeft = computed(() => (info.value?.filesLeft ?? 0) - staged.value.length)


function stage(files: FileList | File[]) {
  for (const f of Array.from(files)) staged.value.push(f)
}
function unstage(i: number) { staged.value.splice(i, 1) }

async function confirmSend() {
  if (!info.value || sending.value || !staged.value.length) return
  sending.value = true
  items.value = staged.value.map(file => reactive({ name: file.name, size: file.size, file, state: 'pending', msg: '', pct: 0 }) as Item)
  staged.value = []
  phase.value = 'result'
  await runAll()
  sending.value = false
}

async function runAll() {
  for (const it of items.value) if (it.state !== 'done') await sendOne(it)
}

async function retryFailed() {
  if (sending.value) return
  sending.value = true
  for (const it of items.value) if (it.state === 'error') { it.state = 'pending'; it.msg = ''; it.pct = 0 }
  await runAll()
  sending.value = false
}

function sendMore() {
  items.value = []
  phase.value = 'form'
}

// A file only counts as sent when the server answers 2xx with a receipt whose size matches the bytes we uploaded.
function upload(body: Blob, header: string, onPct: (n: number) => void): Promise<{ ok: boolean, id: string, size: number }> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open('POST', `/api/upload/${token}`)
    x.setRequestHeader('content-type', 'application/octet-stream')
    x.setRequestHeader('x-enc', header)
    x.timeout = 10 * 60 * 1000
    x.upload.onprogress = e => { if (e.lengthComputable) onPct(Math.round((e.loaded / e.total) * 100)) }
    x.onerror = () => reject(new Error('Connection lost. The recipient may be offline or their link was shut down.'))
    x.ontimeout = () => reject(new Error('Timed out. The recipient may be offline.'))
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) {
        try { resolve(JSON.parse(x.responseText)) } catch { reject(new Error('No confirmation from the recipient. Not delivered.')) }
        return
      }
      let msg = ''
      try { msg = JSON.parse(x.responseText).statusMessage } catch {}
      if (!msg) msg = x.status >= 500 ? 'The recipient is unreachable right now (they may have gone offline).' : `Failed (${x.status})`
      reject(new Error(msg))
    }
    x.send(body)
  })
}

async function sendOne(it: Item) {
  if (!info.value) return
  if (it.file.size > info.value.maxFileBytes) {
    it.state = 'error'
    it.msg = `Over ${mb(info.value.maxFileBytes)} MB limit`
    return
  }
  try {
    it.state = 'encrypting'
    const { cipher, header } = await encryptFile(it.file, info.value.publicKey)
    const blob = new Blob([cipher])
    it.state = 'uploading'
    const r = await upload(blob, header, n => (it.pct = n))
    if (!r?.ok || r.size !== blob.size) throw new Error('Delivery could not be confirmed. Please retry.')
    it.state = 'done'
    info.value.filesLeft = Math.max(info.value.filesLeft - 1, 0)
  } catch (e: any) {
    it.state = 'error'
    it.msg = e?.message || 'Failed'
  }
}

const doneItems = computed(() => items.value.filter(i => i.state === 'done'))
const failedItems = computed(() => items.value.filter(i => i.state === 'error'))
const busy = computed(() => items.value.some(i => ['pending', 'encrypting', 'uploading'].includes(i.state)))
const totalSize = computed(() => doneItems.value.reduce((n, i) => n + i.size, 0))

await check(true)

// Keep watching the link while the page is open: if the recipient switches sharing off (or the connection drops) this page notices.
let timer: ReturnType<typeof setInterval> | undefined
const recheck = () => { check() }
onMounted(() => {
  timer = setInterval(recheck, 6000)
  document.addEventListener('visibilitychange', recheck)
  window.addEventListener('online', recheck)
  window.addEventListener('focus', recheck)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  document.removeEventListener('visibilitychange', recheck)
  window.removeEventListener('online', recheck)
  window.removeEventListener('focus', recheck)
})

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) stage(input.files)
  input.value = ''
}
function onDrop(e: DragEvent) {
  dragging.value = false
  if (e.dataTransfer?.files) stage(e.dataTransfer.files)
}

// Latest installers (built by .github/workflows/release.yml). The GitHub repo must be public for visitors to download.
// Download page hosted by the relay (same origin), listing Mac (Apple silicon / Intel) and Windows.
const INSTALL_URL = '/download'
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-xl flex-col justify-start px-4 py-6 sm:justify-center sm:py-12" :class="barShown && 'pb-[var(--bar)] sm:pb-12'" :style="{ '--bar': barSpace }">
    <div class="mb-5 flex justify-center sm:mb-8"><BrandLogo /></div>

    <LinkStatus v-if="status !== 'ok' || !info" :kind="status === 'ok' ? 'invalid' : status" :checking="checking" @retry="check()" />

    <div v-else-if="info && phase === 'result'" class="card p-5 sm:p-8">
      <div class="text-center">
        <div
          class="mx-auto grid size-14 place-items-center rounded-full"
          :class="busy ? 'bg-slate-100 text-slate-500' : failedItems.length ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-600'"
        >
          <svg v-if="busy" viewBox="0 0 24 24" class="size-7 animate-spin" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 11-6.2-8.6" /></svg>
          <svg v-else-if="failedItems.length" viewBox="0 0 24 24" class="size-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v5m0 3.5v.01" /><path d="M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
          <svg v-else viewBox="0 0 24 24" class="size-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </div>
        <h1 class="mt-4 text-xl font-semibold tracking-tight">
          {{ busy ? 'Sending…' : failedItems.length ? (doneItems.length ? `${doneItems.length} of ${items.length} files sent` : 'Nothing was sent') : 'Delivered' }}
        </h1>
        <p class="mt-1.5 min-h-10 text-sm text-slate-500">
          <template v-if="busy">Keep this page open until it finishes.</template>
          <template v-else-if="failedItems.length">Some files did not go through. They were <strong>not</strong> delivered.</template>
          <template v-else>{{ doneItems.length }} file{{ doneItems.length > 1 ? 's' : '' }} ({{ fmtSize(totalSize) }}) safely delivered to {{ info.ownerName || info.label }}.</template>
        </p>
      </div>

      <ul class="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
        <!-- Fixed row height: the layout is identical while sending, when done and on error, so nothing jumps. -->
        <li v-for="(it, i) in items" :key="i" class="h-[4.25rem] px-4 py-3">
          <div class="flex h-5 items-center justify-between gap-4">
            <span class="truncate">{{ it.name }} <span class="text-xs text-slate-400">{{ fmtSize(it.size) }}</span></span>
            <span class="shrink-0 text-xs font-medium" :class="it.state === 'error' ? 'text-red-600' : it.state === 'done' ? 'text-brand-600' : 'text-slate-400'">
              {{ it.state === 'done' ? 'Sent ✓' : it.state === 'error' ? 'Failed' : it.state === 'uploading' ? `Uploading ${it.pct}%` : it.state === 'encrypting' ? 'Encrypting…' : 'Waiting…' }}
            </span>
          </div>
          <div class="mt-2 flex h-4 items-center">
            <p v-if="it.state === 'error'" class="truncate text-xs text-red-600" :title="it.msg">{{ it.msg }}</p>
            <div v-else class="h-1 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="[it.state === 'done' ? 'bg-brand-600' : 'bg-brand-600/80', it.state === 'encrypting' && 'animate-pulse']"
                :style="{ width: it.state === 'done' ? '100%' : it.state === 'encrypting' ? '8%' : it.state === 'uploading' ? Math.max(it.pct, 8) + '%' : '0%' }"
              />
            </div>
          </div>
        </li>
      </ul>

      <div class="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.25)] backdrop-blur sm:static sm:z-auto sm:mt-4 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none" :class="busy && 'invisible'">
        <div class="mx-auto flex max-w-xl flex-col gap-2 sm:flex-row">
          <button v-if="failedItems.length" type="button" class="btn flex-1 !py-4 !text-base sm:!py-2.5 sm:!text-sm" @click="retryFailed">Retry failed</button>
          <button type="button" class="flex-1" :class="[failedItems.length ? 'btn-ghost' : 'btn', '!py-4 !text-base sm:!py-2.5 sm:!text-sm']" @click="sendMore">Send more files</button>
        </div>
      </div>
    </div>

    <div v-else-if="info" class="card p-5 sm:p-8">
      <h1 class="text-xl font-semibold tracking-tight">Send files securely</h1>
      <p class="mt-1.5 text-sm text-slate-500">
        Sending to <span class="font-medium text-slate-800">{{ info.ownerName || info.label }}</span>
      </p>

      <dl class="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-slate-50 px-3.5 py-3 text-xs">
        <dt class="text-slate-500">Recipient</dt><dd class="font-medium text-slate-800">{{ info.ownerName || info.label }}</dd>
        <dt class="text-slate-500">Link expires</dt><dd class="text-slate-800">{{ expiresText }}</dd>
        <dt class="text-slate-500">Limits</dt><dd class="text-slate-800">{{ info.filesLeft }} file(s) left · up to {{ mb(info.maxFileBytes) }} MB each</dd>
      </dl>

      <div class="mt-4 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
        <p class="mb-1 text-xs font-medium text-brand-700">Verification code</p>
        <KeyCode :public-key="info.publicKey" :offset="offset" :hint="`Not sure this is the right person? Call ${info.ownerName || info.label} and ask them to read out their code. If it does not match, do not send.`" />
      </div>

      <label
        class="mt-6 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition sm:px-6 sm:py-12"
        :class="dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-500'"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <svg viewBox="0 0 24 24" class="size-8 text-brand-600" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0l-4 4m4-4l4 4" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></svg>
        <span class="text-sm font-medium">Drop files here or click to browse</span>
        <span class="text-xs text-slate-500">Up to {{ mb(info.maxFileBytes) }} MB each · {{ info.filesLeft }} file(s) left</span>
        <input type="file" multiple class="hidden" @change="onPick">
      </label>

      <div v-if="staged.length" class="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.25)] backdrop-blur sm:static sm:z-auto sm:mt-5 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
        <div class="mx-auto max-w-xl">
          <p class="text-xs font-medium text-slate-500">Ready to send to {{ info.ownerName || info.label }}</p>
          <ul class="mt-1 max-h-[8.25rem] divide-y divide-slate-100 overflow-y-auto text-sm sm:max-h-none">
            <li v-for="(f, i) in staged" :key="i" class="flex h-11 items-center justify-between gap-4 sm:h-auto sm:py-2.5">
              <span class="truncate">{{ f.name }} <span class="text-xs text-slate-400">{{ fmtSize(f.size) }}</span></span>
              <button type="button" class="shrink-0 px-2 py-2 text-xs text-slate-500 hover:text-red-600" @click="unstage(i)">Remove</button>
            </li>
          </ul>
          <p v-if="slotsLeft < 0" class="mt-2 text-xs text-red-600">Too many files: only {{ info.filesLeft }} allowed.</p>
          <button type="button" class="btn mt-3 w-full !py-4 !text-base sm:mt-4 sm:!py-2.5 sm:!text-sm" :disabled="sending || slotsLeft < 0" @click="confirmSend">
            Encrypt &amp; send {{ staged.length }} file{{ staged.length > 1 ? 's' : '' }}
          </button>
        </div>
      </div>


      <p class="mt-6 flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-500">
        <svg viewBox="0 0 24 24" class="mt-0.5 size-4 shrink-0 text-brand-600" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 118 0v3" /></svg>
        Files are encrypted in your browser before they leave your device. Only the recipient can open them.
      </p>
    </div>

    <div v-if="info && status === 'ok'" class="mt-4 hidden items-center justify-between gap-4 rounded-2xl border border-brand-100 bg-brand-50/60 px-5 py-4 sm:flex">
      <div>
        <p class="text-sm font-semibold text-slate-900">Want to send and receive files safely too?</p>
        <p class="mt-0.5 text-xs text-slate-500">Get SendSafe for your computer. Free, end-to-end encrypted.</p>
      </div>
      <a :href="INSTALL_URL" target="_blank" rel="noopener" class="btn shrink-0 !py-2 !text-sm">Install SendSafe</a>
    </div>
  </main>
</template>
