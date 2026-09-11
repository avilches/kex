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

Three markdown surfaces exist behind separate `import()` boundaries so a plain terminal session, and a markdown tab
on one engine, never pay for the other two: the legacy Streamdown preview (the `streamdown` chunk above), the default
TipTap rich editor (`src/modules/markdown/tiptap/`), and the evaluation-stage Milkdown Crepe editor
(`src/modules/markdown/milkdown/`, added by this branch; see `docs/FORK.md`). None load at app startup; each loads
only once a tab actually resolves to that engine.

Numbers below are from a real `pnpm build` of this branch (tree at commit `9002930b`, 2026-09-11), gzip sizes measured
with `gzip -9`; Vite/Rolldown does not print gzip sizes by default. `TabContent.tsx` lazy-imports each tab shell
(`MarkdownTab` for tiptap, `MilkdownTab` for milkdown) directly, gated on the tab's resolved `markdownEngine`, so
opening a non-markdown tab or a markdown tab on the other engine requests neither shell chunk. `RichMarkdownEditor`
and `MilkdownEditor` are each pulled into their own chunk, separate from their tab shell, because each is imported
from two places: its own tab shell, and `MarkdownRenderPane` (the editor-tab overlay/split preview). Rolldown
extracts a module into its own chunk once it is reachable from more than one dynamic-import entry point, rather than
duplicating it into both.

| Chunk | Trigger | Measured size (gzip / raw) |
|---|---|---|
| `MarkdownTab` (tiptap tab shell: `MarkdownTab.tsx`, the Rich/Source toggle plumbing) | First tiptap-engine markdown tab mount (`import("@/modules/markdown/tiptap/MarkdownTab")`) | 12.7 kB / 41.8 kB |
| `RichMarkdownEditor` (+ its CSS) (the heavy part: `@tiptap/react` + `@tiptap/core` + ProseMirror engine, TipTap extension packages, `markdown-it` + plugins, `lowlight`/`highlight.js`) | First tiptap editor instance mount, from either the tab shell above or the editor-tab preview | 198.4 kB / 591.0 kB JS + 3.3 kB / 17.2 kB CSS |
| `MilkdownTab` (milkdown tab shell: `MilkdownTab.tsx`, same Rich/Source plumbing plus the outline toggle) | First milkdown-engine markdown tab mount (`import("@/modules/markdown/milkdown/MilkdownTab")`) | 2.9 kB / 7.5 kB |
| `MilkdownEditor` (+ its CSS) (the heavy part: `@milkdown/crepe` + `@milkdown/kit` and the ProseMirror engine underneath Crepe) | First milkdown editor instance mount, from either the tab shell above or the editor-tab preview | 190.9 kB / 623.0 kB JS + 15.7 kB / 82.7 kB CSS |
| `useMarkdownTabController` (shared mode/save/shortcut controller pulled out from the tab shells) | Loaded alongside either tab shell | 2.5 kB / 6.6 kB |
| `MarkdownRenderPane` (the read-only render-switch shell) | First markdown-shaped editor-tab preview (overlay or split) | 1.1 kB / 2.1 kB |
| `katex` (+ `katex.css`) | First math node encountered in the tiptap engine (`import("katex")` in `tiptap/extensions/math.ts`) | 76.0 kB / 259.2 kB JS + 7.9 kB / 28.8 kB CSS |
| `mermaid` core | First mermaid fence rendered in the tiptap engine (`import("mermaid")` in `tiptap/extensions/mermaid.ts`) | 11.4 kB / 33.5 kB |

Milkdown's own bundle (`MilkdownEditor` above, 623.0 kB raw) is bigger raw than TipTap's (591.0 kB raw) but compresses
slightly better (190.9 kB vs 198.4 kB gzip); at this point in the evaluation neither is a clear bundle-size winner.
Mermaid was deliberately **not** wired into the milkdown engine (see `docs/FORK.md`): there is no `import("mermaid")`
anywhere under `src/modules/markdown/milkdown/`, and a fresh build confirms no chunk reachable from that directory's
code pulls in `mermaid` or any of its per-diagram-type chunks. The `mermaid` core chunk above, and the diagram-type
chunks below it, exist solely because the tiptap engine's `mermaid` extension still uses the real package; a session
that only ever opens milkdown-engine tabs never fetches any of them. `@milkdown/plugin-diagram`, which briefly pulled
in a second, older mermaid major (10.9.8, alongside the existing 11.15.0) was removed for this reason; `pnpm-lock.yaml`
resolves a single mermaid major again.

Mermaid further splits per diagram type internally (flowchart, sequence, class, gantt, C4, git-graph, ER, etc. each in
their own chunk); only the syntax actually present in a note's fences is fetched.

The eager `react` chunk measured 206.6 kB raw / 64.3 kB gzip on this same build, within noise of the 207.76 kB / 65.78
kB this file already recorded before this branch (below): adding the milkdown module did not grow the chunk every
session pays for at startup, because both `@milkdown/crepe` and `@milkdown/kit` are only ever imported from the lazy
`milkdown/` module, same as `@tiptap/*` before them.

The `manualChunks` predicate that pins the core React packages to the eager `react` chunk originally matched on the
bare substring `/react/`, which also matched `@tiptap/react`'s node_modules path (`.../node_modules/@tiptap/react/dist/...`).
That dragged `@tiptap/react`, `@tiptap/core`, and the full ProseMirror engine (`prosemirror-view`, `-state`, `-model`,
`-transform`, `-commands`, `-schema-list`, `-keymap`) into the eager `react` chunk even though the only importer is the
lazy `tiptap/` module, a measured +90.44 kB gzip regression on every cold start (66.19 kB pre-plan baseline to 156.63 kB
broken), including terminal-only sessions. Fixed by anchoring the check to `/node_modules/react/`,
`/node_modules/react-dom/`, and `/node_modules/scheduler/` so it only matches the real packages' own files, not any
other package with `react`/`react-dom`/`scheduler` as a trailing path segment. The eager `react` chunk is now
207.76 kB raw / 65.78 kB gzip, within noise of the 208.62 kB / 66.19 kB pre-plan baseline; the ~90 kB moved into the
lazy `MarkdownTab` chunk where it belongs (198.15 kB to 287.42 kB gzip above). The `@tiptap/extension-*` packages,
`markdown-it`, and `lowlight` were already unaffected and stay correctly lazy in `MarkdownTab`.

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
