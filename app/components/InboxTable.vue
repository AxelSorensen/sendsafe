<script setup lang="ts">
export interface InboxFile { id: string, name: string, size: number, created_at: number, link_label: string }

const props = defineProps<{ files: InboxFile[], locked: boolean, busyId: string, savedId?: string, refreshing?: boolean, seen: string[], fresh: string[] }>()
const emit = defineEmits<{ view: [f: InboxFile], download: [f: InboxFile], remove: [f: InboxFile], refresh: [] }>()

// One quick spin per click, even when nothing new arrives.
const spins = ref(0)
function refresh() {
  spins.value++
  emit('refresh')
}

const query = ref('')

const dayLabel = (t: number) => {
  const d = new Date(t)
  const today = new Date()
  const diff = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  const rows = props.files.filter(f => !q || f.name.toLowerCase().includes(q))
  const out: { label: string, rows: InboxFile[] }[] = []
  for (const f of rows) {
    const label = dayLabel(f.created_at)
    const last = out[out.length - 1]
    if (last && last.label === label) last.rows.push(f)
    else out.push({ label, rows: [f] })
  }
  return out
})

const unread = (id: string) => !props.seen.includes(id)
const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.ceil(n / 1024))} KB`)
const cols = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 sm:grid-cols-[minmax(0,1fr)_90px_90px_160px]'
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-300 bg-white">
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-300 bg-white px-5 py-4">
      <div class="flex items-baseline gap-3">
        <h2 class="text-base font-semibold">Inbox</h2>
        <span class="text-sm text-slate-500">{{ files.length }} {{ files.length === 1 ? 'document' : 'documents' }}</span>
      </div>
      <div class="flex items-center gap-2">
        <input v-model="query" type="search" placeholder="Search" class="field max-w-60 py-2">
        <button type="button" class="btn-ghost shrink-0 !gap-2.5" :disabled="refreshing" title="Check for new documents" @click="refresh">
          <svg viewBox="0 0 24 24" class="size-4" :key="spins" :class="spins ? 'animate-[spin_0.7s_ease-in-out_1]' : ''" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16" /><path d="M8 16H3v5" /></svg>
          Refresh
        </button>
      </div>
    </div>

    <div :class="cols" class="shrink-0 border-b border-slate-300 bg-slate-100 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
      <span>Document</span>
      <span class="hidden sm:block">Size</span>
      <span class="hidden sm:block">Received</span>
      <span class="text-right">Actions</span>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
    <div v-if="!groups.length" class="px-5 py-16 text-center">
      <p class="text-sm font-medium">{{ files.length ? 'No documents match your search' : 'No documents received' }}</p>
      <p v-if="!files.length" class="mt-1 text-sm text-slate-500">Documents sent through your link will appear here.</p>
    </div>

    <template v-for="g in groups" :key="g.label">
      <div class="border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs font-semibold text-slate-600">{{ g.label }}</div>
      <div
        v-for="f in g.rows"
        :key="f.id"
        :class="cols"
        class="cursor-pointer border-b border-slate-200 px-5 py-3.5 transition last:border-b-0 hover:bg-brand-50/50"
        @click="!locked && $emit('view', f)"
      >
        <div class="flex min-w-0 items-center gap-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-lg border border-brand-100 bg-brand-50 text-brand-600">
            <svg viewBox="0 0 24 24" class="size-[18px]" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" /><path d="M14 3v5h5" /></svg>
          </span>
          <div class="min-w-0">
            <p class="flex items-center gap-2">
              <span class="truncate text-left text-sm text-slate-900" :class="unread(f.id) ? 'font-bold' : 'font-normal'">{{ f.name }}</span>
              <span v-if="assess(f.name)" class="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800" :title="assess(f.name) || ''">Risky</span>
              <span v-if="fresh.includes(f.id)" class="shrink-0 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">New</span>
            </p>
            <p class="mt-0.5 text-xs text-slate-500 sm:hidden">{{ size(f.size) }} · {{ time(f.created_at) }}</p>
          </div>
        </div>
        <span class="hidden text-sm text-slate-700 sm:block" :class="unread(f.id) && 'font-bold'">{{ size(f.size) }}</span>
        <span class="hidden text-sm text-slate-700 sm:block" :class="unread(f.id) && 'font-bold'">{{ time(f.created_at) }}</span>
        <div class="flex justify-end gap-1" @click.stop>
          <button :key="busyId === f.id ? 'busy' : savedId === f.id ? 'done' : 'idle'" :disabled="locked || busyId === f.id" class="btn-ghost gap-2" :class="[savedId === f.id ? 'dl-press text-brand-600' : busyId === f.id ? 'dl-press text-slate-500' : 'text-brand-700']" @click="$emit('download', f)">
            <svg v-if="busyId === f.id" viewBox="0 0 24 24" class="size-4 animate-spin" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 11-6.2-8.6" /></svg>
            <svg v-else-if="savedId === f.id" viewBox="0 0 24 24" class="toast-check size-4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            <svg v-else viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11" /><path d="M7 11l5 5 5-5" /><path d="M5 20h14" /></svg>
            {{ busyId === f.id ? 'Saving…' : savedId === f.id ? 'Saved' : 'Download' }}
          </button>
          <button class="btn-danger" @click="$emit('remove', f)">Delete</button>
        </div>
      </div>
    </template>
    </div>
  </div>
</template>
