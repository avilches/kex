# Terax — Build and packaging

## Development

```bash
pnpm install
pnpm tauri dev         # frontend (Vite, port 1420) + Rust (cargo run)
pnpm dev               # frontend only (no Rust)
```

## Quality checks

```bash
pnpm lint              # biome lint ./src
pnpm check-types       # tsc --noEmit
pnpm test              # vitest run
cd src-tauri && cargo clippy --all-targets -- -D warnings
cd src-tauri && cargo test
```

## Production build

```bash
pnpm tauri build
```

Artifacts land in `src-tauri/target/release/bundle/`.

## Bundle chunk strategy (vite.config.ts)

Manual `manualChunks` splits the bundle to keep the initial load fast:
- `react` — React, ReactDOM, scheduler, clsx, tailwind-merge, cva, Vite preload helper
- `radix` — all Radix UI primitives
- `xterm` — xterm.js and addons
- `codemirror` — CodeMirror core, themes, vim
- `cm-lang-<name>` — each CodeMirror language pack (loaded on demand by `languageResolver.ts`)
- `cm-legacy-<name>` — each legacy mode
- `streamdown` — markdown streaming renderer

## Rust release profile

`codegen-units=1`, `lto=fat`, `opt-level=s` (size-optimized), `panic=abort`, `strip=true`. Result: ~7-8 MB binary.

## Platform targets

| Platform | Format | Notes |
|---|---|---|
| macOS | `.dmg` + `.app` | `minimumSystemVersion: 13.0`, `titleBarStyle: Overlay`, entitlements.plist |
| Linux | `.deb`, `.rpm`, `.AppImage` | deb/rpm link against system webkit2gtk; AppImage bundles media framework |
| Windows | NSIS `.exe` | `currentUser` mode (no admin required), WebView2 via `downloadBootstrapper` |
| Arch Linux | AUR `terax-bin` | Tracks latest release |

## Auto-updater

Update manifest endpoint: `https://github.com/crynta/terax-ai/releases/latest/download/latest.json`

Updates are signed with a minisign key. The public key is embedded in `tauri.conf.json`. The updater verifies the signature before applying an update.
