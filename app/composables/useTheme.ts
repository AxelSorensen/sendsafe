// Light, dark, or follow the system. Remembered in this browser; the class on <html> switches every colour (see main.css).
export type Theme = 'light' | 'dark' | 'system'
const KEY = 'sendsafe-theme'
const theme = ref<Theme>('system')

function apply() {
  // Dark mode belongs to the desktop app only; web pages (upload links) always stay light.
  const inApp = !!(window as any).__TAURI_INTERNALS__
  const dark = inApp && (theme.value === 'dark' || (theme.value === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches))
  document.documentElement.classList.toggle('dark', dark)
}

let started = false
export function useTheme() {
  function init() {
    if (started || !import.meta.client) return
    started = true
    try { const t = localStorage.getItem(KEY); if (t === 'light' || t === 'dark' || t === 'system') theme.value = t } catch { /* storage unavailable */ }
    apply()
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply)
  }
  function set(t: Theme) {
    theme.value = t
    try { localStorage.setItem(KEY, t) } catch { /* storage unavailable */ }
    apply()
  }
  return { theme, init, set }
}
