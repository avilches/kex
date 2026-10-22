# Platform notes

Integracion del PTY con las shells, ventanas, capabilities de Tauri y estructura del frontend. Movido desde `CLAUDE.md`.

## PTY shell integration

PTY shells are bootstrapped via injected init scripts in `src-tauri/src/modules/pty/scripts/`:

- **Unix** (`zshenv.zsh`, `zprofile.zsh`, `zlogin.zsh`, `zshrc.zsh`, `bashrc.bash`, `init.fish`) - installed via `ZDOTDIR` (zsh),
  `--rcfile` (bash) or an init command (fish). Emit OSC 7 (cwd) and OSC 133 A/B/C/D (prompt boundaries + exit code) so the host can track cwd and
  detect command boundaries without re-parsing the prompt.
- **Windows** (`profile.ps1`) - passed via `pwsh -NoLogo -NoExit -ExecutionPolicy Bypass -File <path>`. Wraps the user's
  existing `prompt` function (after their `$PROFILE` runs) to emit OSC 7 + OSC 133 A/B/D. Shell priority: `pwsh.exe` (PS
  7+) → `powershell.exe` (PS 5.1) → `cmd.exe` (no integration). cwd is normalized to backslashes before being passed to
  ConPTY (`CreateProcessW` misbehaves with forward-slash cwd).

`pty/shell_init.rs` is split into `#[cfg(unix)]` / `#[cfg(windows)]` modules - keep new platform-specific code in the
right cfg arm.

ConPTY on Windows requires `CONPTY_LIFECYCLE_LOCK` (Mutex) around both create (`openpty + spawn_command`) and close
(`drop_session`) in `session.rs`. Overlapping pseudoconsole lifecycle calls corrupt the new console so its shell never
pumps output (issue #356). Don't remove the lock without verifying first-tab stability under fast tab spam.

Each ConPTY child is also assigned to a per-session **Job Object** with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` (
`pty/job.rs`). When the Job HANDLE drops - clean shutdown, panic, or even SIGKILL'd Kex process - the kernel kills
every descendant of the shell (e.g. `npm run dev` spawned from inside pwsh). Without this Windows orphans the entire
process subtree because `TerminateProcess` only kills the immediate child. macOS/Linux rely on
`Drop for Session → killer.kill()`; on dev-`Ctrl-C` of `cargo run` destructors don't fire and orphans are possible there
too - acceptable for now since dev only.

## Frontend (`src/`)

Multi-window React app: the user can open several main OS windows (File > New Window, Cmd+Shift+N), each running its
own React instance. Main windows have a `w-<id>` label; the Settings window has the fixed `settings` label. Per-window
state (geometry + Workspaces + active index) is persisted by Rust in `{app_data_dir}/workspaces.json` (index) plus
`{app_data_dir}/workspaces/<id>.json` (bodies), keyed by window label, and restored on startup. Path alias `@/*` →
`src/*`. The layout is a 3-column shell: a narrow (52px) `WorkspaceBar`
on the left, a resizable center content area, and a collapsible `Sidebar` (Explorer / Source Control / Git History /
Notes, the last conditional on the workspace having a `workspaceRoot`).
Content is organized as Workspaces → Panes → Tabs. Tabs are a tagged union (`kind`: `terminal` | `editor` |
`browser` | `markdown` | `git-diff` | `git-history` | `git-commit-file`) and **not** unmounted on switch - they're
hidden via `invisible pointer-events-none` so PTYs and dev servers keep streaming in the background.

`App.tsx` wires modules together - keep it a coordinator. New features go inside the appropriate `modules/<area>/`.

## Window styling

- macOS: `titleBarStyle: Overlay` + `hiddenTitle: true` in `tauri.conf.json` (native traffic lights via overlay).
- Linux: `decorations: false` + `transparent: true` from `tauri.linux.conf.json`; re-asserted post-realize for
  GNOME/Mutter CSD.
- Windows: same as Linux via `tauri.windows.conf.json`. React renders custom `WindowControls`.

## Tauri capabilities

`src-tauri/capabilities/default.json` is the allowlist for plugin APIs available to the webview. New plugins (dialog,
autostart, updater, window-state, store, opener, os, log are wired in `lib.rs`) typically need:

1. `Cargo.toml` dependency
2. `.plugin(...)` call in `lib.rs` `run()`
3. capability entry in `default.json`

`drag:default` (plugin `tauri-plugin-drag`) lets the webview start a native OS drag. It is the only IPC the drag-out feature adds (`plugin:drag|start_drag`, no Kex command); see the "Drag out to the OS" paragraph of `ARCHITECTURE.md`.
