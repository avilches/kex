## Project

**Kex** — this fork of [Terax](https://github.com/crynta/terax-ai). Open-source terminal emulator. Tauri 2 + Rust
(`portable-pty`) backend, React 19 + TypeScript + xterm.js (webgl) client.

The upstream project is **Terax** (`crynta/terax-ai`). All env vars, config paths, and OSC signals in this fork use
the `KEX_` prefix and `~/.config/kex/` / `~/.cache/kex/` paths to avoid conflicts with upstream installations. See
`docs/FORK.md` for the full list of divergences and the upstream sync log.

- Bundle id: `app.betauer.kex`
- Package manager: **pnpm**
- Platforms: macOS, Linux, Windows
- Frontend checks: `pnpm lint`, `pnpm check-types`, `pnpm test`
- Rust checks: `cd src-tauri && cargo clippy && cargo test --locked`

## Quality bar

Production-grade or it does not ship. Every change is judged against all of these, not just "it works":

- **Correctness**: edge cases, failure modes, concurrent access. No "works for now".
- **Performance**: ultra-lightweight is the product. ~7-8 MB bundle, high-performance terminal. For every change ask:
  how much RAM it costs, whether it adds IPC round-trips or redundant requests, whether it triggers extra re-renders or
  wasted work, whether it pulls a heavy dependency. Unused features consume zero resources.
- **Security**: no critical security holes. Validate at every boundary (IPC, fs, network).
- **UI/UX**: polished, professional, premium. Every state and detail considered.
- **Architecture**: new or changed logic lives in pure, dependency-light functions (functional core); tauri commands and
  React components stay thin (imperative shell). Keeps it testable without a later rewrite.

Verify before claiming done: `pnpm lint`, `pnpm check-types`, `pnpm test`, `cargo clippy`, `cargo test --locked`. A
change to a core subsystem (terminal/shell spawn, workspace auth, git, fs, IPC) needs a test that locks the invariant.

## Conventions

- **Comments**: default to none, the code should explain itself. If genuinely needed, 1-2 lines on *why*, never *what*.
  No AI-generic filler.
- **No em-dash** anywhere: code, comments, commits, docs.
- **No emojis** anywhere.
- **Imports**: always `@/...` on the frontend, never relative across modules.
- **pnpm only**, never npm/npx/yarn.

## Architecture

### Two-process model

**Rust (`src-tauri/`)** owns all OS access. The webview never touches the FS, processes, or shells directly — everything
goes through `invoke()` calls to commands registered in `src-tauri/src/lib.rs`:

- `pty::pty_*` — long-lived interactive PTY sessions (xterm ↔ portable-pty), managed by `PtyState` (
  `RwLock<HashMap<id, Session>>`). Output streams via a Tauri `Channel<PtyEvent>`.
- `fs::tree::*` (`fs_read_dir`, `list_subdirs`), `fs::file::*` (`fs_read_file`, `fs_write_file`, `fs_stat`,
  `fs_canonicalize`), `fs::mutate::*` (`fs_create_file`, `fs_create_dir`, `fs_rename`, `fs_delete`): file explorer +
  editor IO.
- `fs::search::*` (`fs_search`, `fs_list_files`), `fs::grep::*` (`fs_grep`, `fs_glob`): fuzzy file finder + content
  search (powered by `ignore` + `grep-*` crates).
- `git::commands::*`: full source-control surface (`git_status`, `git_diff`, `git_diff_content`, `git_stage`,
  `git_unstage`, `git_discard`, `git_commit`, `git_fetch`, `git_pull_ff_only`, `git_push`, `git_log`, `git_show_commit`,
  `git_commit_files`, `git_commit_file_diff`, `git_panel_snapshot`, `git_resolve_repo`, `git_remote_url`). All gated
  through the workspace authorization registry.
- `shell::shell_run_command`: one-shot subshell exec. On Windows via PowerShell (`-NoProfile -Command`), on Unix via
  `$SHELL -lc`. Shared helper `build_oneshot_command`.
- `shell::shell_session_*`: persistent shell session with state across calls. `shell::shell_bg_*` (`spawn`, `logs`,
  `kill`, `list`): long-running background processes (dev servers etc.) with bounded ring-buffer log capture.
- `workspace::*`: `workspace_authorize` / `workspace_current_dir` (the spawn/git cwd authorization registry) plus the
  WSL bridge (`wsl_list_distros`, `wsl_default_distro`, `wsl_home`).
- `open_settings_window`: separate webview window for Settings (optional `tab` arg deep-links a section).
- `agent::agent_enable_claude_hooks` / `agent_claude_hooks_status`: atomically install Claude Code terminal hooks; gated
  on `KEX_TERMINAL`.

### PTY shell integration

PTY shells are bootstrapped via injected init scripts in `src-tauri/src/modules/pty/scripts/`:

- **Unix** (`zshenv.zsh`, `zprofile.zsh`, `zlogin.zsh`, `zshrc.zsh`, `bashrc.bash`) — installed via `ZDOTDIR` (zsh) or
  `--rcfile` (bash). Emit OSC 7 (cwd) and OSC 133 A/B/C/D (prompt boundaries + exit code) so the host can track cwd and
  detect command boundaries without re-parsing the prompt.
- **Windows** (`profile.ps1`) — passed via `pwsh -NoLogo -NoExit -ExecutionPolicy Bypass -File <path>`. Wraps the user's
  existing `prompt` function (after their `$PROFILE` runs) to emit OSC 7 + OSC 133 A/B/D. Shell priority: `pwsh.exe` (PS
  7+) → `powershell.exe` (PS 5.1) → `cmd.exe` (no integration). cwd is normalized to backslashes before being passed to
  ConPTY (`CreateProcessW` misbehaves with forward-slash cwd).

`pty/shell_init.rs` is split into `#[cfg(unix)]` / `#[cfg(windows)]` modules — keep new platform-specific code in the
right cfg arm.

ConPTY on Windows requires `SPAWN_LOCK` (Mutex) around `openpty + spawn_command` in `session.rs`. Concurrent spawns
leave one of the resulting PTYs with a stalled output pipe. Don't remove the lock without verifying first-tab stability
under fast tab spam.

Each ConPTY child is also assigned to a per-session **Job Object** with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` (
`pty/job.rs`). When the Job HANDLE drops — clean shutdown, panic, or even SIGKILL'd Kex process — the kernel kills
every descendant of the shell (e.g. `npm run dev` spawned from inside pwsh). Without this Windows orphans the entire
process subtree because `TerminateProcess` only kills the immediate child. macOS/Linux rely on
`Drop for Session → killer.kill()`; on dev-`Ctrl-C` of `cargo run` destructors don't fire and orphans are possible there
too — acceptable for now since dev only.

### Frontend (`src/`)

Multi-window React app: the user can open several main OS windows (File > New Window, Cmd+Shift+N), each running its
own React instance. Main windows have a `w-<id>` label; the Settings window has the fixed `settings` label. Per-window
state (geometry + Workspaces + active index) is persisted by Rust in `{app_data_dir}/workspaces.json` (index) plus
`{app_data_dir}/workspaces/<id>.json` (bodies), keyed by window label, and restored on startup. Path alias `@/*` →
`src/*`. The layout is a 3-column shell: a narrow (52px) `WorkspaceBar`
on the left, a resizable center content area, and a collapsible right panel (Explorer / Source Control / Git History).
Content is organized as Workspaces → Panes → Panels. Panels are a tagged union (`kind`: `terminal` | `editor` |
`browser` | `markdown` | `git-diff` | `git-history` | `git-commit-file`) and **not** unmounted on switch — they're
hidden via `invisible pointer-events-none` so PTYs and dev servers keep streaming in the background.

`App.tsx` wires modules together — keep it a coordinator. New features go inside the appropriate `modules/<area>/`.

### Module layout (`src/modules/`)

Each module is self-contained, exports a thin barrel via `index.ts`, and owns its hooks under `lib/`.

- **terminal/** — `useTerminalSession` + `pty-bridge` keep one mounted xterm per panel (panels are never unmounted).
  `osc-handlers.ts` parses OSC 7 (with Windows drive-letter normalization: `/C:/Users/foo` → `C:/Users/foo`) and OSC 133
  markers. The xterm color palette is driven by the central theme engine (`modules/theme`), not a local table.
- **editor/** — CodeMirror 6 stack (`EditorStack` mirrors `TerminalStack`). `extensions.ts` configures language modes;
  supports prebuilt themes (Tokyo Night, Nord, GitHub, Atom One, Aura, Copilot, Xcode, Gruvbox Dark).
- **explorer/** — file tree with Material/Catppuccin icons (`iconResolver.ts`), fuzzy search, keyboard nav, inline
  rename, context actions. Backslash-aware `basename`.
- **browser/** — web browser tab (address bar + navigation, `browser` panel kind); also surfaces the auto-detected
  dev-server tab (status-bar pill suggests opening when a localhost URL is detected).
- **header/** — top bar + inline search (`SearchInline` adapts to terminal vs editor via `SearchTarget`).
  `WindowControls` rendered when `USE_CUSTOM_WINDOW_CONTROLS` is true (Linux + Windows; macOS uses native traffic
  lights).
- **shortcuts/** — keymap registry (`shortcuts.ts`) + `useGlobalShortcuts`. Handlers live in `App.tsx` and are passed in
  by id (`tab.new`, …). `metaKey || ctrlKey` for cross-platform Cmd/Ctrl.
- **settings/** — settings store (`store.ts` via `tauri-plugin-store`), preferences hook, settings window opener.
- **workspaces/** — source of truth for the Workspace/Pane/Panel model. `useWorkspaces` owns state; `splitNode.ts` is
  the pure tree-operation library (split, remove, find, flatten). Rendering: `WorkspaceView` → `SplitNodeView` (
  recursive binary tree) → `PaneView` → `PanelContent` (switches on `panel.kind`). State persisted to
  `workspace-state.json` via `tauri-plugin-store`, debounced 300ms on every change.
- **sidebar/** — residual module; exports `SidebarViewId` type used by right-panel tab routing.
- **source-control/** — git status / stage / commit panel and diff workflow.
- **git-history/** — commit graph rail, refs, per-commit file diffs.
- **markdown/** — markdown preview renderer (backs the `markdown` tab kind).
- **workspace/** — workspace environment switching (Local + WSL distros).
- **theme/** — custom theme engine (no `next-themes`). `ThemeProvider` + `applyTheme` write CSS variables; built-in
  presets in `themes/` (kex-default, nord, tide, catppuccin, tokyo-night, caffeine, claude, gruvbox, sage, rose-pine),
  user themes via `customThemes.ts` + `validateTheme.ts`, optional background image via `bgImageStore.ts` +
  `SurfaceLayer`.
- **updater/** — auto-updater UI built on `tauri-plugin-updater`.
- **agents/** — terminal coding-agent notifications (Claude Code; Codex later). Shared store (`store/agentStore.ts`:
  terminal `sessions` + `notifications`) and a shared router (`lib/route.ts`: suppress when focused-and-visible,
  OS-notify when unfocused, in-app Sonner toast when focused-but-hidden) feed the header `NotificationBell`. Terminal
  detection is Rust-side (`pty/agent_detect.rs`) on the PTY reader's byte filter, armed on `OSC 133;C;<cmd>`, emitting
  `kex:agent-signal` transitions (`started`/`working`/`attention`/`finished`/`exited`) driven only by OSC sequences (
  never raw output, so a repainting TUI never flaps) — zero cost when no agent runs. Terminal signals arrive via Claude
  Code hooks (`UserPromptSubmit`/`Notification`/`Stop`) returning an `OSC 777` marker through the `terminalSequence`
  field (hooks lost `/dev/tty` access in v2.1.139); `agent_enable_claude_hooks` installs them (atomic write, never
  clobbers invalid JSON, prunes empty groups), gated on `KEX_TERMINAL`, and the marker self-arms the detector so it
  works in bash/Windows/tmux without shell preexec.

### UI conventions

- **shadcn/ui** is configured (`components.json`, style `radix-luma`, base `mist`, icon lib **hugeicons**). Primitives
  in `src/components/ui/` — don't hand-edit; re-run `pnpm dlx shadcn add` to upgrade.
- **Tailwind v4** — no `tailwind.config.*`, config is in `src/App.css` via `@theme`. Use `cn()` from `@/lib/utils`.
- **Small inline action buttons** (reset, clear, edit within a row or table): use a plain `<button>` with `title` for the
  tooltip (native, no Tooltip component), `size-[22px]`, `flex items-center justify-center rounded
  text-muted-foreground transition-colors hover:text-foreground`. Icon size 11-12px. The `ActionButton` in
  `ShortcutsSection.tsx` is the reference implementation.
- Animation: `motion` (Framer Motion successor). Resizable layout: `react-resizable-panels`.
- Path imports: always `@/…`, never relative across modules.
- Cross-platform paths: anywhere a path may originate from OSC 7, the explorer, or the OS, normalize separators with
  `.split(/[\\/]/)` rather than `.split("/")`.
- Canonical path form on the frontend is **forward-slash**. `homeDir()` returns backslashes on Windows; convert at the
  boundary (App.tsx setHome). OSC 7 already arrives as forward-slash. Equal canonical strings keep `useFileTree` from
  wiping its tree and flashing the explorer when `tab.cwd` first arrives.

### Window styling

- macOS: `titleBarStyle: Overlay` + `hiddenTitle: true` in `tauri.conf.json` (native traffic lights via overlay).
- Linux: `decorations: false` + `transparent: true` from `tauri.linux.conf.json`; re-asserted post-realize for
  GNOME/Mutter CSD.
- Windows: same as Linux via `tauri.windows.conf.json`. React renders custom `WindowControls`.

### Tauri capabilities

`src-tauri/capabilities/default.json` is the allowlist for plugin APIs available to the webview. New plugins (dialog,
autostart, updater, window-state, store, opener, os, log are wired in `lib.rs`) typically need:

1. `Cargo.toml` dependency
2. `.plugin(...)` call in `lib.rs` `run()`
3. capability entry in `default.json`

### Cross-platform conventions

- HOME / cache dirs: use the `dirs` crate (`dirs::home_dir()`, `dirs::cache_dir()`), never raw `$HOME` /
  `%USERPROFILE%`.
- Shell init scripts: gate Unix-only logic behind `#[cfg(unix)]`; Windows arm in `pty::shell_init::windows`.
- Terminal input: send `\r` (CR) for Enter, not `\n` (LF) — PowerShell on Windows requires CR.

### Bundle config

- `bundle.targets: "all"` plus per-platform sections in `tauri.conf.json`:
    - **macOS**: `minimumSystemVersion: 10.15`.
    - **Linux**: deb depends `libwebkit2gtk-4.1-0`, `libgtk-3-0`; rpm `webkit2gtk4.1`, `gtk3`; AppImage bundles its
      media framework.
    - **Windows**: NSIS installer in `currentUser` mode (no admin required), WebView2 via `embedBootstrapper` (offline
      install).
- Auto-updater configured with a public minisign key; release artifacts at
  `https://github.com/crynta/terax-ai/releases/latest/download/latest.json`.

## Living documentation

Two files must stay in sync with the codebase at all times. Update them in the same commit as the code change, never as
a follow-up.

### `docs/ARCHITECTURE.md` · `docs/IPC.md` · `docs/BUILD.md`

Three complementary files — read the one that matches your task:

- **`docs/ARCHITECTURE.md`** — design overview, Workspace/Pane/Panel model, technical decisions with user-visible
  effects, known limitations, tech stack, frontend module map, security model. Read this first whenever you touch any
  subsystem.
- **`docs/IPC.md`** — full Tauri command surface (`pty::*`, `fs::*`, `git::*`, `shell::*`, `workspace::*`, `history::*`,
  misc) and the terminal agent notification protocol. Consult when adding, removing, or modifying Tauri commands.
- **`docs/BUILD.md`** — dev setup, quality checks, production build, bundle strategy, platform targets, auto-updater.
  Consult when touching CI, packaging, or the Vite/Cargo build config.

Update the relevant file(s) whenever:

- A module is added, removed, or significantly restructured.
- The Workspace/Pane/Panel data model changes.
- A new Tauri command is registered or an existing one is removed.
- A technical decision with user-visible effects changes (rendering strategy, persistence, path handling, etc.).
- A known limitation is resolved or a new one is discovered.

Do not restate what the code already makes obvious. The doc covers the *why* and the *non-obvious what*.

### `docs/WORKSPACES.md` · `docs/WORKSPACES_GOTCHAS.md`

Deep-dive into the workspace rendering stack and terminal slot pool:

- **`docs/WORKSPACES.md`** — Workspace/Pane/Panel data model, render tree (WorkspaceView → PaneView → PanelContent),
  terminal session lifecycle, renderer slot pool (slot acquire/bind/unbind/reap, WebGL context management, dormant ring
  buffer), drag-and-drop architecture, resize handle constraints. Update whenever the rendering strategy, pool
  constants, visibility semantics, or drag-and-drop wiring changes.
- **`docs/WORKSPACES_GOTCHAS.md`** — bugs that were non-obvious to diagnose, with root cause, failed attempts, and
  confirmed fix. Add an entry whenever a bug in this subsystem takes more than one attempt to fix, so it is not
  re-discovered.

### `docs/FORK.md`

Documents every significant divergence from the upstream repo ([crynta/terax-ai](https://github.com/crynta/terax-ai)):
features removed, features added, architectural departures, and the planned roadmap. Update it whenever:

- A feature present in the upstream is removed from this fork.
- A feature that does not exist in the upstream is added to this fork.
- A new phase or roadmap item is completed or added.

Keep entries factual and grouped by phase or theme. The goal is a clear answer to "what is this fork and why does it
exist."

### Known gotchas

- **React 19 strict mode** double-mounts `useEffect` in dev → terminals spawn twice on first render. The first PTY is
  cleaned up almost immediately. The `SPAWN_LOCK` mutex serializes this; don't be alarmed by `pty opened id=1` followed
  by `pty closed id=1` in dev logs.
- **Windows PowerShell process lifecycle**: `killer.kill()` from `portable-pty` only kills the immediate child.
  Descendants (e.g. `npm run dev` started inside pwsh) survive unless something else takes them down. The Job Object in
  `pty/job.rs` handles this for the Kex-process-death case; an explicit `pty_close` from JS also kills only the
  immediate child + relies on the Job to take the rest. Don't disable the Job without a replacement.
- **Panel `cwd` storage**: comes from OSC 7 with forward slashes (after `parseOsc7` strips `/C:` → `C:`). Anything that
  consumes `panel.cwd` and passes it to a Rust fs command on Windows must normalize separators or accept both forms —
  `apply_common` in `pty::shell_init` handles this for PTY spawn; other call sites must do their own.
