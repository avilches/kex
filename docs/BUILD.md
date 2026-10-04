# Kex — Build and packaging

## Development

```bash
pnpm install
pnpm tauri dev         # frontend (Vite) + Rust (cargo run); the port is picked per checkout
pnpm dev               # frontend only (no Rust), port 1420
```

`pnpm tauri dev` goes through `scripts/tauri.mjs`, which picks the Vite port so several checkouts
(one per worktree) can run the app at the same time. The main checkout gets 1420 and each worktree
under `.claude/worktrees/` gets a port in 1421-1920 derived from its path (stable between runs, the
next free one if taken). The script prints it (`[kex] dev server on port N`) and passes it as
`KEX_DEV_PORT` to Vite (`vite.config.ts`), to the Tauri CLI as `--config` (`devUrl`) and to
`src-tauri/build.rs`, which bakes the same URL into the dev build. Exporting `KEX_DEV_PORT` yourself
overrides the choice, and a bare `pnpm dev` honors it too, defaulting to 1420.

### Theme preview page

`pnpm dev` also serves `http://localhost:1420/theme-preview.html` (on the port Vite prints if `KEX_DEV_PORT` is set; `theme-preview.html` +
`src/theme-preview/main.ts`), a vanilla-DOM page (no React tree, no Tauri `invoke`) that applies a
theme through the real `applyTheme` and shows WorkspaceBar, Header, Sidebar (Explorer, Source
Control, History, Notes), tab bar with agent chips, terminal (background, selection, cursor, 16
ANSI), a real CodeMirror editor with the theme's paired editor theme, buttons/badges, and every CSS
token. It is dev only and not part of `pnpm build`.

- URL params: `?theme=<id>&mode=light|dark&scheme=vscode|jetbrains&view=swatches|app|markdown&terminal=auto|<theme id>&editor=auto|<editor theme id>`.
  `terminal` mirrors the "Terminal theme" preference: the terminal panes use that theme's palette
  while the rest of the page keeps `theme`. `editor` mirrors the "Editor theme" preference the same way
  (`auto` is the app theme's own pairing, an id sets the editor background and text color like Settings does).
  A user theme can be pasted as JSON in the textarea (validated with `validateTheme`). The selector
  lists every theme twice ("Nord dark", "Nord light"), so there is no separate dark/light button.
- A third view, `markdown`, puts Rich (the Live Preview editor) and Preview (the read-only view) side by
  side on `src/theme-preview/live-preview-demo.md`. Both documents have the same number of lines (Preview
  turns the frontmatter into a yaml fence of the same height), so line n of one is line n of the other:
  `kexThemePreview.markdown.rich` and `.preview` are the two `EditorView`s, to compare line classes and
  computed styles. Use it to check that a change to the Live Preview extensions keeps both modes looking alike.
- Two views, both static: every state is on screen at once, nothing needs a click. `swatches` lists
  every surface plus a terminal and an editor pane each in focused and unfocused state. `app` stacks
  two approximations of the real window (WorkspaceBar, Sidebar, Header, a terminal pane and an editor
  pane side by side, status strip): one with the terminal focused, one with the editor focused. An
  unfocused pane is drawn like `PaneView` does: a black overlay at the theme's
  `inactivePaneDim[kind]` opacity (each pane prints its `data-dim`), and only the focused pane's
  tab gets the `tab-focus-indicator` bar. Terminal panes show prompt, command output in ANSI colors,
  a selection and the cursor (filled when focused, hollow when not); editor panes are a real
  CodeMirror with the theme's paired editor theme, a selection and the active line.
- Colors are verifiable without screenshots (Dark Reader rewrites backgrounds in screenshots): each
  swatch prints its hex as text and carries `data-token` / `data-hex`, and
  `window.kexThemePreview.dump()` returns every token plus the git status colors as a
  `{name: "#rrggbb"}` object (`set({themeId, mode, scheme})` switches from code).
- Agent workflow: edit `src/modules/theme/themes/*.ts`, Vite reloads the page, then read
  `kexThemePreview.dump()` (or the `data-hex` attributes) to confirm the result. Surface layouts are
  approximations that mirror the real components' classes; the colors come from the same tokens.
- Vite's watcher ignores only this checkout's own `.claude/` (`vite.config.ts`), so hot reload also
  works when running from `.claude/worktrees/<branch>`.

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
TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/kex-local.key) \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<password from your secret manager> \
pnpm tauri build
```

The build requires `TAURI_SIGNING_PRIVATE_KEY` because `tauri.conf.json` has an updater public key configured. Without it, Tauri aborts with "A public key has been found, but no private key." This key only signs the updater artifact (the auto-updater's signature check), it has nothing to do with Gatekeeper or Apple code signing.

**First time:** generate a local key pair with a password (needs a TTY — run in your terminal), then back up both the key file and the password in your secret manager, since losing either makes the key unusable:

```bash
pnpm tauri signer generate -w ~/.tauri/kex-local.key -p "<a strong password>"
```

Artifacts land in `src-tauri/target/release/bundle/`:

| Path | Description |
|---|---|
| `bundle/macos/Kex.app` | App bundle, drag to `/Applications` |
| `bundle/dmg/Kex_<ver>_aarch64.dmg` | Installer DMG |

**Gatekeeper:** first launch of an unsigned build requires right-click > Open to bypass the "unidentified developer" warning.

### Fast local install (no signing key, no dmg)

`pnpm build:local` (runs `scripts/build-local-app.sh`, macOS only) builds just the `.app` bundle and installs it straight into `/Applications`, replacing whatever is there. It skips the signing key entirely by disabling updater artifacts for that one build (`tauri build -b app -c '{"bundle":{"createUpdaterArtifacts":false}}'`), and skips the dmg step, so it's a much faster loop for trying a local change than the full production build. It does not quit or relaunch Kex: this script may itself be running inside a Kex terminal tab, so killing the app would kill the shell running it. Quit and reopen Kex yourself once it prints that the copy is done.

### Version mismatch gotcha

If `pnpm tauri build` fails with "Found version mismatched Tauri packages", the Rust crate and the NPM package for a plugin resolved to different minor versions. Fix: update the NPM package to match the crate version shown in the error, e.g.:

```bash
pnpm add @tauri-apps/plugin-dialog@~2.7.0
```

Check `src-tauri/Cargo.lock` for the actual resolved version of each plugin.

## Releasing a new version

The version is hardcoded in three places that must stay in sync: `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`. `pnpm bump-version <version>` (runs `scripts/bump-version.mjs`) updates all three plus `src-tauri/Cargo.lock`'s own entry for the `kex` package (via `cargo check --offline`, so it never touches dependency resolution), then prints the commit/tag commands. It does not commit, tag or push:

```bash
pnpm bump-version 0.7.4
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "Bump version to 0.7.4"
git tag v0.7.4 && git push origin v0.7.4
```

Pushing the tag triggers `.github/workflows/release.yml` (matches `v*`), which builds all four platform targets with `tauri-action` and publishes the release, including the `latest.json` manifest the auto-updater polls.

## Bundle chunk strategy (vite.config.ts)

Manual `manualChunks` splits the bundle to keep the initial load fast:
- `react` — React, ReactDOM, scheduler, clsx, tailwind-merge, cva, Vite preload helper
- `radix` — all Radix UI primitives
- `xterm` — xterm.js and addons
- `codemirror` — CodeMirror core, themes, vim
- `cm-lang-<name>` — each CodeMirror language pack (loaded on demand by `languageResolver.ts`)
- `cm-legacy-<name>` — each legacy mode

### Markdown editor chunks

Live Preview is the only markdown engine, and both of its surfaces sit behind separate `import()` boundaries so a plain
terminal session never pays for them: the `markdown` tab shell (`src/modules/markdown/codemirror/MarkdownTab.tsx`,
which pulls in the Live Preview decorations) and the read-only preview (`MarkdownPreviewPane`, a read-only CodeMirror view). Neither loads at app startup. `TabContent.tsx` lazy-imports the tab shell for a
`markdown` tab and the preview pane for the overlay/split preview of an `editor` tab over a `.md` file.

Measured on a real `pnpm build` (2026-09-29), gzip sizes with `gzip -9`; Vite/Rolldown does not print gzip sizes by
default:

| Chunk | Trigger | Measured size (gzip / raw) |
|---|---|---|
| `MarkdownTab` (Live Preview tab shell and its decorations) | First `markdown` tab mount | 12.6 kB / 39.3 kB |
| `MarkdownPreviewPane` (read-only CodeMirror shell) | First Preview mode or editor-tab overlay/split preview of a `.md` | not re-measured after Streamdown was removed |

The eager `react` chunk measures 207.8 kB raw. Nothing under `src/modules/markdown/` is imported from the eager graph.

The `manualChunks` predicate that pins the core React packages to the eager `react` chunk is anchored to
`/node_modules/react/`, `/node_modules/react-dom/` and `/node_modules/scheduler/`. A bare `/react/` substring once also
matched `@tiptap/react` (since removed) and dragged a whole editor engine into the eager chunk, a measured +90 kB gzip
regression on every cold start; keep the anchored form so a future `*/react/*` dependency cannot do the same.

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
