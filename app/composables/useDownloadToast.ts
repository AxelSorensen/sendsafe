// What the download toast shows. Lives in shared state so it appears above every screen, including the file viewer.
export interface DownloadToast { state: 'working' | 'saved', name: string, path?: string, quarantined?: boolean }

export function useDownloadToast() {
  const save = useState<DownloadToast | null>('download-toast', () => null)
  return { save }
}
