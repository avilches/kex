# Kex — Build and packaging

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
TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/kex-local.key) pnpm tauri build
```

The build requires `TAURI_SIGNING_PRIVATE_KEY` because `tauri.conf.json` has an updater public key configured. Without it, Tauri aborts with "A public key has been found, but no private key."

**First time:** generate a local key pair (needs a TTY — run in your terminal):

```bash
pnpm tauri signer generate -w ~/.tauri/kex-local.key
```

Leave the password blank or set one; if you set one, also export `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Artifacts land in `src-tauri/target/release/bundle/`:

| Path | Description |
|---|---|
| `bundle/macos/Kex.app` | App bundle, drag to `/Applications` |
| `bundle/dmg/Kex_<ver>_aarch64.dmg` | Installer DMG |

**Gatekeeper:** first launch of an unsigned build requires right-click > Open to bypass the "unidentified developer" warning.

### Version mismatch gotcha

If `pnpm tauri build` fails with "Found version mismatched Tauri packages", the Rust crate and the NPM package for a plugin resolved to different minor versions. Fix: update the NPM package to match the crate version shown in the error, e.g.:

```bash
pnpm add @tauri-apps/plugin-dialog@~2.7.0
```

Check `src-tauri/Cargo.lock` for the actual resolved version of each plugin.

## Bundle chunk strategy (vite.config.ts)

Manual `manualChunks` splits the bundle to keep the initial load fast:
- `react` — React, ReactDOM, scheduler, clsx, tailwind-merge, cva, Vite preload helper
- `radix` — all Radix UI primitives
- `xterm` — xterm.js and addons
- `codemirror` — CodeMirror core, themes, vim
- `cm-lang-<name>` — each CodeMirror language pack (loaded on demand by `languageResolver.ts`)
- `cm-legacy-<name>` — each legacy mode
- `streamdown` — markdown streaming renderer

### Markdown editor chunks

The rich markdown editor (`src/modules/markdown/rich/`) and its two heaviest optional features are behind separate
`import()` boundaries so a plain terminal session never pays for them. None of the three load at app startup; each
loads only when the feature it backs is actually used.

| Chunk | Trigger | Measured gzip size |
|---|---|---|
| `MarkdownTab` (rich editor: TipTap extension packages, `markdown-it` + plugins, `lowlight`/`highlight.js`, the `rich/` module code) | First rich markdown tab mount (`import("@/modules/markdown/rich/MarkdownTab")` in `TabContent.tsx`) | 198.15 kB (579.96 kB raw) |
| `katex` (+ `katex.css`) | First math node encountered (`import("katex")` in `rich/extensions/math.ts`) | 77.53 kB JS + 7.92 kB CSS (259.15 kB + 28.83 kB raw) |
| `mermaid` core | First mermaid fence rendered (`import("mermaid")` in `rich/extensions/mermaid.ts`) | 11.49 kB (33.31 kB raw) |

Mermaid further splits per diagram type internally (flowchart, sequence, class, gantt, C4, git-graph, ER, etc. each in
their own chunk) — only the syntax actually present in a note's fences is fetched.

**Known issue:** the `manualChunks` predicate that pins the core React packages to the eager `react` chunk matches on
the substring `/react/`, which also matches `@tiptap/react`'s node_modules path. That drags `@tiptap/react`,
`@tiptap/core`, and the full ProseMirror engine (`prosemirror-view`, `-state`, `-model`, `-transform`, `-commands`,
`-schema-list`, `-keymap`) into the eager `react` chunk even though the only importer is the lazy `rich/` module — a
measured ~90 kB gzip regression on every cold start, including terminal-only sessions. The `@tiptap/extension-*`
packages, `markdown-it`, and `lowlight` are unaffected and stay correctly lazy in `MarkdownTab`. Not fixed as part of
this change; needs a tighter match (e.g. an exact `node_modules/react/` path check) in the `manualChunks` function.

## Rust release profile

`codegen-units=1`, `lto=fat`, `opt-level=s` (size-optimized), `panic=abort`, `strip=true`. Result: ~7-8 MB binary.

## Platform targets

| Platform | Format | Notes |
|---|---|---|
| macOS | `.dmg` + `.app` | `minimumSystemVersion: 13.0`, `titleBarStyle: Overlay`, entitlements.plist |
| Linux | `.deb`, `.rpm`, `.AppImage` | deb/rpm link against system webkit2gtk; AppImage bundles media framework |
| Windows | NSIS `.exe` | `currentUser` mode (no admin required), WebView2 via `downloadBootstrapper` |
| Arch Linux | AUR `kex-bin` | Tracks latest release |

## Auto-updater

Update manifest endpoint: `https://github.com/avilches/kex/releases/latest/download/latest.json`

Updates are signed with a minisign key. The public key is embedded in `tauri.conf.json`. The updater verifies the signature before applying an update.
