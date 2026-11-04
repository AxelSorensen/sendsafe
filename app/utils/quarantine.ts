// Flags files that can run code or pretend to be something harmless. The name is checked in the list; the first bytes too when the file is opened for saving.
const RISKY_EXT = new Set([
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'dll', 'sys', 'cpl', 'msp', 'lnk', 'url', 'hta', 'reg', 'chm',
  'js', 'jse', 'vbs', 'vbe', 'wsf', 'wsh', 'ps1', 'psm1', 'jar', 'sh', 'command', 'scpt', 'workflow', 'action',
  'app', 'dmg', 'pkg', 'deb', 'rpm', 'appimage', 'apk', 'iso', 'img',
  'docm', 'xlsm', 'pptm', 'dotm', 'xlam'
])
const HARMLESS_EXT = /\.(pdf|docx?|xlsx?|pptx?|txt|rtf|csv|jpe?g|png|gif|heic|zip|mp3|mp4|mov)\s*\.[a-z0-9]{2,8}$/i

const ext = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]+)\s*$/)?.[1] ?? '')

/** Returns why a file looks risky, or null. `bytes` (optional) enables the check of the real file type. */
export function assess(name: string, bytes?: Uint8Array): string | null {
  const e = ext(name)
  if (/[‪-‮⁦-⁩]/.test(name)) return 'Its name uses hidden text-direction characters to disguise the real file type.'
  if (RISKY_EXT.has(e)) {
    if (HARMLESS_EXT.test(name)) return `It looks like a document but ends in .${e}, which runs as a program.`
    return `.${e} files can run programs or macros on your computer.`
  }
  if (bytes && bytes.length > 4) {
    const [a, b, c, d] = bytes
    const mz = a === 0x4d && b === 0x5a
    const elf = a === 0x7f && b === 0x45 && c === 0x4c && d === 0x46
    const macho = (a === 0xfe && b === 0xed && c === 0xfa) || (a === 0xcf && b === 0xfa && c === 0xed && d === 0xfe) || (a === 0xce && b === 0xfa && c === 0xed && d === 0xfe) || (a === 0xca && b === 0xfe && c === 0xba && d === 0xbe)
    const script = a === 0x23 && b === 0x21
    if (mz || elf || macho) return `The name says .${e || 'file'} but the contents are a program.`
    if (script && !['sh', 'py', 'rb', 'pl', 'txt', ''].includes(e)) return `The name says .${e} but the contents are a script.`
  }
  return null
}
