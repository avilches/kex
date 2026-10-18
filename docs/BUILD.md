# Kex - Build and packaging

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

When `pnpm tauri dev` runs inside a Claude Code session (`CLAUDECODE` is set), the script also drops every
`CLAUDE*` variable from the environment before starting the app (`scripts/devEnv.mjs`). Kex Dev would otherwise
hand them to each `claude` opened in its terminals, and `CLAUDE_CODE_CHILD_SESSION` makes those stop saving
transcripts ("Transcript saving is off"), so session restore never finds a JSONL and always falls back to
`--session-id`. Variables you export in your shell rc still reach each tab, because the tab's shell re-reads it.

### Theme preview page

`pnpm dev` also serves `http://localhost:1420/theme-preview.html` (on the port Vite prints if `KEX_DEV_PORT` is set; `theme-preview.html` +
`src/theme-preview/main.ts`), a vanilla-DOM page (no React tree, no Tauri `invoke`) that applies a
theme through the real `applyTheme` and shows WorkspaceBar, Header, Sidebar (Explorer, Source
Control, History, Notes), tab bar with agent chips, terminal (background, selection, cursor, 16
ANSI), a real CodeMirror editor with the theme's paired editor theme, buttons/badges, and every CSS
token. It is dev only and not part of `pnpm build`.

- URL params: `?theme=<id>&mode=light|dark&scheme=vscode|jetbrains&view=swatches|app&terminal=auto|<theme id>&editor=auto|<editor theme id>`.
  `terminal` mirrors the "Terminal theme" preference: the terminal panes use that theme's palette
  while the rest of the page keeps `theme`. `editor` mirrors the "Editor theme" preference the same way
  (`auto` is the app theme's own pairing, an id sets the editor background and text color like Settings does).
  A user theme can be pasted as JSON in the textarea (validated with `validateTheme`).
- The theme selector is a row of one button per theme, each with a dot of the theme's `primary`.
  `ArrowLeft` / `ArrowRight` cycle themes and `ArrowUp` / `ArrowDown` switch dark / light, so a theme can be
  stepped through without opening anything. The two git color schemes (vs code / jetbrains) stay as buttons.
- Two views, both static: every state is on screen at once, nothing needs a click. `swatches` lists
  every surface plus a terminal and an editor pane each in focused and unfocused state. `app` stacks
  two approximations of the real window: the WorkspaceBar (group header, workspace chips, one expanded
  with its tab list and a focused tab, one hibernated), an Explorer Sidebar and a Source Control sidebar
  side by side, the Header, the tab bar with agent chips, the terminal and editor panes, and below them
  the Live Preview pair. The Explorer uses the real Catppuccin file and folder icons
  (`iconResolver.ts`) and the same row classes as `TreeRow.tsx` (normal, gitignored, selected). The
  Source Control panel mirrors `SourceControlPanel.tsx` (commit box with the "to commit" hint, staged
  line, Commit / Push, the changed header, the changes list with file icons and status letters), so
  switching the git color scheme changes those letters. Panes are at least 360 px wide (what their text
  needs), so when the frame is narrow they wrap onto more rows instead of clipping text. An unfocused
  pane is drawn like `PaneView` does: a black overlay at the theme's `inactivePaneDim[kind]` opacity
  (each pane prints its `data-dim`), and only the focused pane's tab gets the `tab-focus-indicator`
  bar. Terminal panes show prompt, command output in ANSI colors, a selection and the cursor (filled when
  focused, hollow when not); editor panes are a real CodeMirror with the theme's paired editor theme, a
  selection and the active line.
- The Live Preview pair (Rich, the Live Preview editor, and Preview, the read-only view) sits under the
  panes on `src/theme-preview/live-preview-demo.md`. Both get the same text (Preview shows the frontmatter
  as the same monospace lines as Rich, not as a fence), so line n of one is line n of the other:
  `kexThemePreview.markdown.rich` and `.preview` are the two `EditorView`s, to compare line classes and
  computed styles. Use it to check that a change to the Live Preview extensions keeps both modes looking alike.
- The tuner adjusts the background lightness and hue, and the alpha of the normal and the ignored explorer
  rows (what `text-foreground/85` and `text-muted-foreground/85` resolve to). The two alphas feed CSS vars
  the rows read, so the explorer follows live; the readout prints the composited hex and the WCAG ratio
  against the sidebar. Each control has its own "reset", and "Reset all" clears the sliders and the token
  overrides. Values are saved per theme and mode in `localStorage` and survive a reload.
- Every token can be overridden by hand (open the "Any token" disclosure): a color picker plus a hex field
  per token, which covers the buttons too (`primary`, `secondary`, `accent`, `destructive` and their
  `-foreground` pairs) and the terminal palette. "reset" on a row drops that one override.
- "Export changes (copy)" puts only what differs from the theme on the clipboard: the slider values that
  moved and the tokens that were overridden, plus the resolved hexes. That is the shape to hand back so the
  value can be baked into the theme. "Export full theme (copy)" writes the whole theme with the on-screen
  values baked in, which is also valid input for the custom-theme box.
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

**First time:** generate a local key pair with a password (needs a TTY - run in your terminal), then back up both the key file and the password in your secret manager, since losing either makes the key unusable:

```bash
pnpm tauri signer generate -w ~/.tauri/kex-local.key -p "<a strong password>"
```

Artifacts land in `src-tauri/target/release/bundle/`:

| Path | Description |
|---|---|
| `bundle/macos/Kex.app` | App bundle, drag to `/Applications` |
| `bundle/dmg/Kex_<ver>_aarch64.dmg` | Installer DMG |

**Web inspector:** the `tauri` crate is built with the `devtools` feature, so release builds also show "Inspect Element" in the right-click menu. It adds nothing at runtime until it is opened. On macOS it relies on a private WebKit API, which only matters for a Mac App Store submission (Kex does not ship there).

**Gatekeeper:** first launch of an unsigned build requires right-click > Open to bypass the "unidentified developer" warning.

### Fast local install (no signing key, no dmg)

`pnpm buildlocal` (runs `scripts/build-local-app.sh`, macOS only) builds just the `.app` bundle and installs it straight into `/Applications`, replacing whatever is there. It skips the signing key entirely by disabling updater artifacts for that one build (`tauri build -b app -c '{"bundle":{"createUpdaterArtifacts":false}}'`), and skips the dmg step, so it's a much faster loop for trying a local change than the full production build. It does not quit or relaunch Kex: this script may itself be running inside a Kex terminal tab, so killing the app would kill the shell running it. Quit and reopen Kex yourself once it prints that the copy is done.

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
- `react` - React, ReactDOM, scheduler, clsx, tailwind-merge, cva, Vite preload helper
- `radix` - all Radix UI primitives
- `xterm` - xterm.js and addons
- `codemirror` - CodeMirror core, themes, vim
- `cm-lang-<name>` - each CodeMirror language pack (loaded on demand by `languageResolver.ts`)
- `cm-legacy-<name>` - each legacy mode

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
