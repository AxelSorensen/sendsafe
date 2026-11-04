<script setup lang="ts">
const props = defineProps<{ file: { id: string, enc: string, name: string }, privateKey: CryptoKey, saving?: boolean, saved?: boolean }>()
const emit = defineEmits<{ close: [], download: [] }>()

type Kind = 'image' | 'pdf' | 'text' | 'video' | 'audio' | 'sheet' | 'iwork' | 'docx' | 'pptx' | 'zip' | 'none'
const TYPES: Record<string, [Kind, string]> = {
  png: ['image', 'image/png'], jpg: ['image', 'image/jpeg'], jpeg: ['image', 'image/jpeg'], gif: ['image', 'image/gif'],
  webp: ['image', 'image/webp'], avif: ['image', 'image/avif'], bmp: ['image', 'image/bmp'], svg: ['image', 'image/svg+xml'],
  heic: ['image', 'heic'], heif: ['image', 'heic'],
  pages: ['iwork', ''], numbers: ['iwork', ''], key: ['iwork', ''],
  xlsx: ['sheet', ''], docx: ['docx', ''], pptx: ['pptx', ''], zip: ['zip', ''],
  pdf: ['pdf', 'application/pdf'],
  txt: ['text', ''], xml: ['text', ''], yaml: ['text', ''], yml: ['text', ''], md: ['text', ''], csv: ['text', ''], json: ['text', ''], log: ['text', ''],
  mp4: ['video', 'video/mp4'], webm: ['video', 'video/webm'], mov: ['video', 'video/quicktime'],
  mp3: ['audio', 'audio/mpeg'], wav: ['audio', 'audio/wav'], m4a: ['audio', 'audio/mp4']
}

const state = ref<'loading' | 'ready' | 'error'>('loading')
const kind = ref<Kind>('none')
const url = ref('')
const text = ref('')
const buffer = ref<ArrayBuffer | null>(null)
// PDFs are drawn with pdf.js instead of the system viewer: some webviews (Linux, and some Mac/Windows builds) cannot show them.
const pdfBox = ref<HTMLElement | null>(null)
const pdfBytes = ref<Uint8Array | null>(null)
const pdfInfo = ref('')
const pdfFailed = ref(false)
const pdfLoading = ref(true)
let pdfDoc: any = null
let gone = false

async function renderPdf() {
  const bytes = pdfBytes.value
  if (!bytes) return
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const { default: worker } = await import('pdfjs-dist/legacy/build/pdf.worker.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker
    pdfDoc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise
    await nextTick()
    const box = pdfBox.value
    if (!box) return
    const total = pdfDoc.numPages as number
    const shown = Math.min(total, 150)
    const width = Math.max(box.clientWidth - 32, 280)
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    for (let n = 1; n <= shown && !gone; n++) {
      pdfInfo.value = `Page ${n} of ${total}`
      const page = await pdfDoc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const vp = page.getViewport({ scale: Math.min(width / base.width, 2.5) * ratio })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(vp.width)
      canvas.height = Math.floor(vp.height)
      canvas.style.width = `${Math.floor(vp.width / ratio)}px`
      canvas.className = 'mx-auto mb-3 max-w-full bg-white shadow'
      box.appendChild(canvas)
      pdfLoading.value = false
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
    }
    pdfLoading.value = false
    pdfInfo.value = total > shown ? `Showing the first ${shown} of ${total} pages. Download to see all of it.` : ''
  } catch {
    pdfLoading.value = false
    pdfFailed.value = true
  }
}

// Office viewers run fully in the browser; documents are never sent anywhere.
const VueOfficeExcel = defineAsyncComponent(async () => { await import('@vue-office/excel/lib/v3/index.css'); return (await import('@vue-office/excel/lib/v3/vue-office-excel.mjs')).default as any })
const VueOfficeDocx = defineAsyncComponent(async () => { await import('@vue-office/docx/lib/v3/index.css'); return (await import('@vue-office/docx/lib/v3/vue-office-docx.mjs')).default as any })
const VueOfficePptx = defineAsyncComponent(async () => (await import('@vue-office/pptx/lib/v3/vue-office-pptx.mjs')).default as any)
const entries = ref<{ name: string, size: number }[]>([])

let closedByNav = false
const prevOverflow = { html: '', body: '' }

function onPop() {
  closedByNav = true
  emit('close')
}

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  // Lock the page behind the viewer, and make a back-swipe close the viewer instead of leaving the page.
  prevOverflow.html = document.documentElement.style.overflow
  prevOverflow.body = document.body.style.overflow
  document.documentElement.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden'
  history.pushState({ sdViewer: true }, '')
  window.addEventListener('popstate', onPop)
  try {
    const meta = await decryptMeta(props.privateKey, props.file.enc)
    const ext = meta.name.split('.').pop()?.toLowerCase() ?? ''
    let [k, mime] = TYPES[ext] ?? ['none', '']
    if (k === 'none') { // fall back to the MIME type the sender's browser reported
      const t = meta.type || ''
      if (t === 'application/pdf') [k, mime] = ['pdf', t]
      else if (/^image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml)$/.test(t)) [k, mime] = ['image', t]
      else if (/^video\/(mp4|webm|quicktime)$/.test(t)) [k, mime] = ['video', t]
      else if (/^audio\/(mpeg|wav|mp4|x-m4a)$/.test(t)) [k, mime] = ['audio', t]
      else if (t.startsWith('text/') && t !== 'text/html') k = 'text'
    }
    kind.value = k
    if (k !== 'none') {
      const cipher = await $fetch<Blob>(`/api/files/${props.file.id}`, { responseType: 'blob' })
      const plain = await decryptFile(props.privateKey, props.file.enc, await cipher.arrayBuffer())
      if (k === 'text') text.value = new TextDecoder().decode(plain.slice(0, 1_000_000))
      else if (k === 'sheet') {
        buffer.value = plain
      } else if (k === 'iwork') {
        // Apple Pages/Numbers/Keynote files are zips that embed a preview rendered by Apple's own software.
        const { unzipSync } = await import('fflate')
        const found = unzipSync(new Uint8Array(plain), { filter: f => /(^|\/)(quicklook\/)?preview\.(pdf|jpe?g|png)$/i.test(f.name) })
        const names = Object.keys(found)
        const pick = names.find(n => /\.pdf$/i.test(n)) ?? names[0]
        if (!pick) kind.value = 'none'
        else {
          const isPdf = /\.pdf$/i.test(pick)
          kind.value = isPdf ? 'pdf' : 'image'
          if (isPdf) pdfBytes.value = found[pick]!
          else url.value = URL.createObjectURL(new Blob([found[pick]!], { type: /png$/i.test(pick) ? 'image/png' : 'image/jpeg' }))
        }
      } else if (k === 'docx' || k === 'pptx') {
        buffer.value = plain
      } else if (k === 'zip') {
        const { unzipSync } = await import('fflate')
        const list: { name: string, size: number }[] = []
        unzipSync(new Uint8Array(plain), { filter: (f) => { list.push({ name: f.name, size: f.originalSize }); return false } })
        entries.value = list
      } else if (k === 'pdf') {
        pdfBytes.value = new Uint8Array(plain)
      } else if (mime === 'heic') {
        const { default: heic2any } = await import('heic2any')
        const png = (await heic2any({ blob: new Blob([plain], { type: 'image/heic' }), toType: 'image/png' })) as Blob
        url.value = URL.createObjectURL(png)
      } else url.value = URL.createObjectURL(new Blob([plain], { type: mime })) // fixed safe MIME, never from the file
    }
    state.value = 'ready'
    if (pdfBytes.value) { await nextTick(); renderPdf() }
  } catch {
    state.value = 'error'
  }
})

function onKey(e: KeyboardEvent) { if (e.key === 'Escape') emit('close') }
onBeforeUnmount(() => {
  gone = true
  pdfDoc?.destroy?.()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('popstate', onPop)
  document.documentElement.style.overflow = prevOverflow.html
  document.body.style.overflow = prevOverflow.body
  if (!closedByNav && history.state?.sdViewer) history.back()
  if (url.value) URL.revokeObjectURL(url.value)
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex h-dvh w-screen flex-col overscroll-none bg-slate-900/80 p-4 sm:p-8" style="min-height:100dvh" @click.self="emit('close')" @wheel.self.prevent @touchmove.self.prevent>
    <div class="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
      <div class="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-3">
        <p class="truncate text-sm font-semibold">{{ file.name }}</p>
        <div class="flex shrink-0 gap-1">
          <button :key="saving ? 'busy' : saved ? 'done' : 'idle'" class="btn-ghost gap-2" :class="saved ? 'dl-press text-brand-600' : saving ? 'dl-press text-slate-500' : ''" :disabled="saving" @click="emit('download')">
            <svg v-if="saving" viewBox="0 0 24 24" class="size-4 animate-spin" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 11-6.2-8.6" /></svg>
            <svg v-else-if="saved" viewBox="0 0 24 24" class="toast-check size-4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            {{ saving ? 'Saving…' : saved ? 'Saved' : 'Download' }}
          </button>
          <button class="btn-ghost" @click="emit('close')">Close</button>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-auto overscroll-contain bg-slate-100">
        <p v-if="state === 'loading'" class="grid h-full place-items-center text-sm text-slate-500">Decrypting…</p>
        <p v-else-if="state === 'error'" class="grid h-full place-items-center text-sm text-red-600">Could not open this file.</p>
        <p v-else-if="kind === 'none'" class="grid h-full place-items-center px-6 text-center text-sm text-slate-500">
          This file type can't be previewed in the app.
        </p>
        <img v-else-if="kind === 'image'" :src="url" :alt="file.name" class="mx-auto max-h-full max-w-full object-contain p-4">
        <div v-else-if="kind === 'pdf'" class="p-4">
          <p v-if="pdfFailed" class="py-16 text-center text-sm text-slate-500">This PDF could not be previewed. Use Download to open it in your PDF reader.</p>
          <template v-else>
            <p v-if="pdfLoading" class="py-16 text-center text-sm text-slate-500">Loading PDF…</p>
            <div ref="pdfBox" />
            <p v-if="pdfInfo" class="pb-2 text-center text-xs text-slate-500">{{ pdfInfo }}</p>
          </template>
        </div>
        <video v-else-if="kind === 'video'" :src="url" controls class="mx-auto max-h-full max-w-full" />
        <div v-else-if="kind === 'audio'" class="grid h-full place-items-center"><audio :src="url" controls /></div>
        <div v-else-if="kind === 'sheet' && buffer" class="relative size-full bg-white"><VueOfficeExcel :src="buffer" class="absolute inset-0 !h-full" style="height:100%" /></div>
        <VueOfficeDocx v-else-if="kind === 'docx' && buffer" :src="buffer" class="min-h-full" />
        <VueOfficePptx v-else-if="kind === 'pptx' && buffer" :src="buffer" class="h-full" />
        <ul v-else-if="kind === 'zip'" class="divide-y divide-slate-200 bg-white text-sm">
          <li v-for="e in entries" :key="e.name" class="flex justify-between gap-4 px-5 py-2.5"><span class="truncate">{{ e.name }}</span><span class="shrink-0 text-slate-500">{{ e.size }} B</span></li>
        </ul>
        <pre v-else-if="kind === 'text'" class="whitespace-pre-wrap break-words bg-white p-5 font-mono text-sm leading-relaxed">{{ text }}</pre>
      </div>
    </div>
  </div>
</template>
