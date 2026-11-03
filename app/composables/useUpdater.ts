// In-app updates for the desktop app (Tauri updater). Does nothing in a normal browser.
type Status = 'idle' | 'checking' | 'uptodate' | 'available' | 'downloading' | 'error'
const state = reactive({ version: '', status: 'idle' as Status, latest: '', progress: 0, error: '' })
let pending: { version: string, downloadAndInstall: (cb: (e: any) => void) => Promise<void> } | null = null
let versionLoaded = false

export const inDesktopApp = () => import.meta.client && !!(window as any).__TAURI_INTERNALS__

export function useUpdater() {
  async function loadVersion() {
    if (versionLoaded || !inDesktopApp()) return
    versionLoaded = true
    try { state.version = await (await import('@tauri-apps/api/app')).getVersion() } catch { versionLoaded = false }
  }

  /** `quiet` checks in the background: no "checking" or error messages, only a result when an update exists. */
  async function check(quiet = false) {
    if (!inDesktopApp() || state.status === 'checking' || state.status === 'downloading') return
    if (!quiet) state.status = 'checking'
    state.error = ''
    try {
      const update = await (await import('@tauri-apps/plugin-updater')).check()
      if (update) { pending = update as any; state.latest = update.version; state.status = 'available' }
      else if (!quiet) state.status = 'uptodate'
      else if (state.status === 'checking') state.status = 'idle'
    } catch {
      if (!quiet) { state.status = 'error'; state.error = 'Could not check for updates. Try again in a moment.' }
      else if (state.status === 'checking') state.status = 'idle'
    }
  }

  async function install() {
    if (!pending) return
    state.status = 'downloading'
    state.progress = 0
    let total = 0
    let got = 0
    try {
      await pending.downloadAndInstall((e: any) => {
        if (e.event === 'Started') total = e.data?.contentLength ?? 0
        else if (e.event === 'Progress') { got += e.data?.chunkLength ?? 0; state.progress = total ? Math.min(100, Math.round((got / total) * 100)) : 0 }
        else if (e.event === 'Finished') state.progress = 100
      })
      await (await import('@tauri-apps/plugin-process')).relaunch()
    } catch {
      state.status = 'error'
      state.error = 'The update did not finish. Your current version still works; try again.'
    }
  }

  return { state, loadVersion, check, install, available: inDesktopApp }
}
