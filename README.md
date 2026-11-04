# sendsafe

Software for sending sensitive documents safely. I generate an upload link, another person uploads files through it, and I need a certain authentication to log in and access what was uploaded.

Stack: Nuxt, Tailwind CSS, TypeScript (from `nuxt-starter`).

## Development

```bash
pnpm install
pnpm dev
```

## How it works

- First visit: `/setup`. Set password (12+ chars) and scan TOTP QR. Optional env `SENDSAFE_SETUP_TOKEN` gates setup.
- Browser generates RSA keypair. Private key is encrypted with a key derived from your password (PBKDF2, 600k) and stored wrapped. Server never sees password or plaintext.
- Login = password-derived auth secret + TOTP code. Rate limited, TOTP replay blocked.
- `/admin`: create upload links (token shown once, only its hash stored; expiry, max files, max size), revoke, list/download/delete files.
- `/u/<token>`: uploader's browser encrypts each file (AES-256-GCM, key wrapped with your public key, filename encrypted too) before upload.
- Data in `.data/sendsafe` (override `SENDSAFE_DATA_DIR`). Set `SENDSAFE_TRUST_PROXY=1` behind a reverse proxy. Serve over HTTPS.
- Forgot password = files unrecoverable (by design).

Production: `pnpm build && node .output/server/index.mjs`

## Desktop app (installer for Mac, Windows and Linux)

`desktop/` wraps the app in a Tauri shell. It bundles its own Node runtime, so users install nothing else. Uploads arrive through the Cloudflare relay in `relay/`, so no tunnel or port forwarding is needed. The app lives in the menu bar/tray, starts on login, and shows native notifications.

**One-time:** `cd relay && pnpm install && pnpm run setup` (free Cloudflare account). Put the printed address in `desktop/.env` as `SENDSAFE_RELAY_URL=…`.

**Release (installers for Mac arm + Intel + Windows + Linux):** add the same URL as the GitHub repo secret `SENDSAFE_RELAY_URL`, then `git tag v0.1.0 && git push --tags`. The *Release desktop app* workflow attaches `.dmg`, `.exe`, `.deb` and `.AppImage` installers to a release.

**Local build:** install Rust, then `cd desktop && pnpm install && pnpm run build`.

Unsigned builds show an "unidentified developer" / SmartScreen warning on first open (Mac: right-click, Open). Signing needs an Apple Developer account and a Windows certificate.
