import { homedir } from 'node:os'
import { join } from 'node:path'

// Desktop app: decrypted files are saved here.
export function downloadsDir() {
  return join(homedir(), 'Downloads', 'SendSafe')
}
