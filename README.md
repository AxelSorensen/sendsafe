# safedrop

Software for sending sensitive documents safely. I generate an upload link, another person uploads files through it, and I need a certain authentication to log in and access what was uploaded.

Stack: Nuxt, Tailwind CSS, TypeScript (from `nuxt-starter`).

## Development

```bash
pnpm install
pnpm dev
```

## How it works

- First visit: `/setup`. Set password (12+ chars) and scan TOTP QR. Optional env `SAFEDROP_SETUP_TOKEN` gates setup.
- Browser generates RSA keypair. Private key is encrypted with a key derived from your password (PBKDF2, 600k) and stored wrapped. Server never sees password or plaintext.
- Login = password-derived auth secret + TOTP code. Rate limited, TOTP replay blocked.
- `/admin`: create upload links (token shown once, only its hash stored; expiry, max files, max size), revoke, list/download/delete files.
- `/u/<token>`: uploader's browser encrypts each file (AES-256-GCM, key wrapped with your public key, filename encrypted too) before upload.
- Data in `.data/safedrop` (override `SAFEDROP_DATA_DIR`). Set `SAFEDROP_TRUST_PROXY=1` behind a reverse proxy. Serve over HTTPS.
- Forgot password = files unrecoverable (by design).

Production: `pnpm build && node .output/server/index.mjs`
