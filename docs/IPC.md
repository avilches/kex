# Kex — Backend IPC surface

All Tauri commands registered in `src-tauri/src/lib.rs` via `tauri::generate_handler![]`. The WebView calls them via `invoke()` from `src/lib/native.ts` — never use `invoke()` directly in components or hooks.

Adding a new command requires three steps: `Cargo.toml` dependency (if a new plugin), `.plugin(...)` call in `lib.rs` `run()`, and a capability entry in `src-tauri/capabilities/default.json`.

---

## `pty::*` — PTY sessions

State: `PtyState = RwLock<HashMap<id, Session>>`

| Command | Description |
|---|---|
| `pty_open` | Spawn a new PTY session, returns a Tauri `Channel<PtyEvent>` for streaming output |
| `pty_write` | Write bytes to a PTY (keyboard input) |
| `pty_resize` | Resize PTY (columns / rows) |
| `pty_close` | Close PTY and kill the shell process |
| `pty_close_all` | Close all PTYs (used on app exit) |
| `pty_has_foreground_process` | Whether a process other than the shell itself is in the foreground |
| `pty_shell_name` | Detected shell name for the PTY session |
| `pty_metrics(pty_ids)` | Sample CPU% and resident memory of each terminal's shell process tree (shell PID + all descendants). Returns `{ pty_id, pid, cpu_percent, mem_bytes, shell_name }[]`. CPU is normalized 0..=100 (per-core sum divided by logical CPU count) via a persistent `sysinfo::System` kept in `ProcessMonitor` managed state, so the value is a real delta between calls, not an instantaneous snapshot. Sessions with an unknown shell PID or no active session are skipped. `shell_name` is the shell process name, used when no foreground command is running. |

Shell integration scripts (`scripts/`) are injected at spawn time. Platform detection happens in `pty/shell_init.rs` with `#[cfg(unix)]` / `#[cfg(windows)]` split.

---

## `fs::*` — Filesystem

| Command | Description |
|---|---|
| `fs_read_dir` | Directory listing (one level). Optional `git_decorations` flag adds a per-entry `gitignored` bool (gated to a real repo) for the explorer git decorations |
| `list_subdirs` | List only subdirectories (for the explorer tree) |
| `fs_read_file` | Read file contents as UTF-8 string |
| `fs_write_file` | Write file contents |
| `fs_stat` | File metadata (size, mtime, is_dir) |
| `fs_canonicalize` | Resolve symlinks and normalize path |
| `fs_create_file` | Create a new file |
| `fs_create_dir` | Create a new directory (recursive) |
| `fs_rename` | Rename or move a file/directory |
| `fs_delete` | Delete a file or directory permanently |
| `fs_trash` | Move a file or directory to the system trash (recoverable); mirrors `fs_delete`. Best-effort: errors on WSL/UNC paths where the Windows Recycle Bin is unavailable (caller falls back to an error toast, never data loss) |
| `fs_copy` | Copy external files/dirs into a destination directory (recursive, refuses to overwrite). Backs the explorer OS-file-drop; sources are absolute OS paths, only the destination is workspace-resolved |
| `fs_watch_add` | Start watching a path for changes (emits Tauri events) |
| `fs_watch_remove` | Stop watching a path |
| `fs_search` | Fuzzy file name search via `nucleo-matcher` + `ignore` |
| `fs_list_files` | List all files in a tree (respects `.gitignore`) |
| `fs_grep` | Content search via `grep-*` crates |
| `fs_grep_interactive` | Streaming grep for command palette content search |
| `fs_glob` | Glob pattern matching |
| `fs_duplicate(source, dest, workspace)` | Copy a file or directory from `source` to `dest` (both workspace-resolved). Emits progress as the global app event `kex:duplicate-progress` (see Events below). Only one duplication can run at a time; a second call returns an error while one is in progress. If the destination already exists the command returns an error without touching it. On cancel or IO error, any partially created destination is deleted. When a quit is pending (deferred because a copy was running), emits `kex:before-quit` on completion so the app can proceed with the exit. |
| `fs_duplicate_cancel` | Signal the active duplication to abort. The copy loop checks the flag before each chunk and directory entry; cleanup of the partial destination runs inside the blocking task and is reported via the final `kex:duplicate-progress` event (`active: false`). No-op if no duplication is running. |
| `cancel_quit` | Clear the deferred-quit flag set when the user tries to quit during an active duplication ("Keep app open" action), then emit `kex:duplicate-quit-dismissed` to close the modal in all windows. The dismiss event is always emitted; if no quit was pending it harmlessly closes a modal that is not open. |

### Duplication Tauri events

Events emitted globally (all windows) by `fs::duplicate`:

| Event | Payload | Trigger |
|---|---|---|
| `kex:duplicate-progress` | `{ name, copied, total, active }` | Emitted periodically during a copy. `active: false` on the final event (copy finished, cancelled, or errored). |
| `kex:duplicate-quit-prompt` | `{ name, copied, total }` | Emitted when the user requests quit (Cmd+Q / Ctrl+Q) while a duplication is running; the frontend shows a modal with wait / keep-open / cancel-and-quit. |
| `kex:duplicate-quit-dismissed` | _(none)_ | Emitted by `cancel_quit`; closes the modal in all windows without quitting. |

---

## `git::*` — Source control

All git commands are gated on the `WorkspaceRegistry`. Git is invoked as a subprocess (not via `git2`).

| Command | Description |
|---|---|
| `git_resolve_repo` | Find the nearest git repo root for a given path (accepts a file path, resolving from its parent dir) |
| `git_panel_snapshot` | Fast status snapshot for the source control panel (accepts a file path, resolving from its parent dir) |
| `git_status` | Full porcelain status |
| `git_diff` | Diff of staged or unstaged changes |
| `git_diff_content` | Full diff content for a specific file |
| `git_stage` / `git_unstage` | Stage/unstage a file |
| `git_discard` | Discard unstaged changes for a file |
| `git_commit` | Create a commit |
| `git_fetch` | Fetch from remote |
| `git_pull_ff_only` | Fast-forward pull |
| `git_push` | Push to remote |
| `git_log` | Commit history (used by git history pane) |
| `git_show_commit` | Commit details and changed files |
| `git_commit_files` | Files changed in a specific commit |
| `git_commit_file_diff` | Diff of a specific file in a specific commit |
| `git_remote_url` | Remote URL for the repo (used for remote links) |
| `git_mv` | Move or rename a tracked file/dir; automatically stages the rename |

---

## `shell::*` — Command execution

| Command | Description |
|---|---|
| `shell_run_command` | One-shot subshell exec. Unix: `$SHELL -lc`. Windows: `pwsh -NoProfile -Command` |
| `shell_session_open` | Open a persistent named shell session (state across calls) |
| `shell_session_run` | Run a command in an open session and return combined output |
| `shell_session_close` | Close a persistent session |
| `shell_bg_spawn` | Spawn a background process (dev server etc.), returns a handle |
| `shell_bg_logs` | Read recent output from a background process's ring buffer |
| `shell_bg_kill` | Kill a background process |
| `shell_bg_list` | List all running background processes |

---

## `workspace::*`

| Command | Description |
|---|---|
| `workspace_authorize` | Grant access to a directory for git/shell operations |
| `workspace_current_dir` | Query the authorized current directory |
| `wsl_list_distros` | List installed WSL distributions (Windows only) |
| `wsl_default_distro` | Get the default WSL distro |
| `wsl_home` | Get the home directory of a WSL distro |

---

## `history::*` — Shell history

| Command | Description |
|---|---|
| `history_suggest` | Fuzzy-match a prefix against shell history |
| `history_record` | Record a command execution to history |
| `history_list` | Return recent history entries |
| `history_commands` | Return all history entries |

---

## Misc

| Command | Description |
|---|---|
| `open_settings_window` | Open (or focus) the Settings window, optionally deep-linking a tab |
| `open_main_window` | Open a new main window with a fresh `w-<hex>` label |
| `window_get_state` | Return the saved `WindowEntry` (workspaces + geometry + optional `sidebar` chrome) for a given window label, reconstructed from the `workspaces.json` index plus the per-workspace `workspaces/<id>.json` bodies |
| `window_save_workspace_state` | Persist workspace list and active index for a window label; writes the lean `workspaces.json` index plus one `workspaces/<id>.json` per changed workspace |
| `window_save_sidebar(label, open, view, side, width)` | Persist the per-window sidebar chrome (open, active view, dock side, width percentage) into the `workspaces.json` index only, without rewriting the workspace bodies. Lightweight so it can fire on every view switch or resize (the frontend debounces it ~250ms) |
| `window_save_workspace_bar(label, width)` | Persist the workspace bar pixel width for a given window label into the `workspaces.json` index. Called on every drag resize (debounced in the frontend); separate from the sidebar state persisted by `window_save_sidebar` so the two can change independently. |
| `get_launch_dir` | Return the CLI launch directory (drained on first call) |
| `agent_enable_claude_hooks` | Atomically install Claude Code terminal hooks (also installs session persistence hooks) |
| `agent_disable_claude_hooks` | Remove Kex hooks from `~/.claude/settings.json` (inverse of enable; idempotent) |
| `agent_claude_hooks_status` | Query whether hooks (notification + session) are installed |
| `agent_session_restore_plan` | Return `Vec<RestorePlan>` — one entry per panel that had a running agent session at last close |
| `agent_queue_nav` | Store a pending OS-notification navigation target `{ window_label, workspace_id, panel_id }` with a 5-second TTL. Called by the frontend before sending an OS notification so that when the user clicks the notification and any main window gains focus, Rust can redirect to the correct window and emit `kex:activate-panel` to it. |
| `float_browser_open(panelId, url, originWindowLabel, workspaceId)` | Open a floating `WebviewUrl::External` window for the given browser panel. If the window already exists, focuses it instead of opening a second one. State is inserted only after successful window build. |
| `float_browser_close(panelId)` | Destroy the floating window without docking (no `kex:float-dock` event emitted). Removes from state unconditionally. |
| `float_browser_focus(panelId)` | Bring the floating window to front via `set_focus`. |
| `float_browser_dock(panelId)` | Emit `kex:float-dock` to the origin window, then destroy the floating window (same path as the X-button close handler). |
| `float_browser_navigate(panelId, url)` | Navigate the floating window to `url`. Used by the address bar shown in the docked placeholder so the user can drive the floating window from inside Kex. Triggers `kex:float-navigated` on load completion, which syncs `panel.url`. |

### Float browser Tauri events

Events emitted by `float_browser.rs` to the **origin window** (not broadcast):

| Event | Payload | Trigger |
|---|---|---|
| `kex:float-dock` | `{ panelId, currentUrl }` | Floating window closed via X button, `float_browser_dock` command, or the "Dock Browser" / "Dock All Browsers" Window menu items |
| `kex:float-navigated` | `{ panelId, url }` | Each page load completion (`PageLoadEvent::Finished`) in the floating window |

---

## Terminal agent notification protocol

Kex monitors terminal panels for coding agents (Claude Code, Codex, etc.) via two complementary channels:

**OSC 133 C (shell integration)** — the PTY reader detects the sequence `OSC 133;C;<cmd> ST` emitted by the shell init scripts at each prompt. This arms the `AgentDetector` and produces the `started` signal. This path is always active once shell integration is loaded.

**Unix socket IPC (hook events)** — Claude Code hooks call `trigger-event.sh` on each hook event. The script sends the raw JSON payload to a per-session Unix domain socket at `/tmp/kex-ipc-{pty_id}.sock` (path exposed via `KEX_IPC` env var). The Rust listener (`pty/ipc.rs`) reads the JSON and emits Tauri events:

| Hook event | Tauri event | Notes |
|---|---|---|
| `SessionStart` | `kex:agent-session-meta` + arms detector | Includes `source`, `sessionTitle`, `model` |
| `SessionEnd` | `kex:agent-signal` kind=`SessionEnd` | |
| `UserPromptSubmit` | `kex:agent-signal` kind=`UserPromptSubmit` | Includes `prompt` |
| `Notification` | `kex:agent-signal` kind=`Notification` | Includes `message` |
| `Stop` | `kex:agent-signal` kind=`Stop` | Includes `last_assistant_message` as `message` |
| `StopFailure` | `kex:agent-signal` kind=`StopFailure` | Includes `error_message` as `message` |
| `PermissionRequest` | `kex:agent-signal` kind=`PermissionRequest` | Includes `tool_name` as `toolName` |
| `MessageDisplay` | `kex:agent-signal` kind=`MessageDisplay` | Only on `final: true` chunks; `delta` as `message` |

The socket is created in `session::spawn()` before the child process starts, so `KEX_IPC` is always set when the shell reads its environment. The socket file is removed when the `IpcGuard` drops (PTY session closed).

Hooks must be installed via "Set up Claude Code" (notification bell popover). See `docs/NOTIFICATIONS.md` for the detector state machine and `docs/AGENT_SESSION_RESTORE.md` for session persistence.

### OS notification deep-link

When the app is not focused and an agent event requires an OS notification, the frontend calls `agent_queue_nav` to register a navigation target before calling `sendNotification`. Rust stores it in `PendingNavState` (a `Mutex<Option<PendingNav>>`) with a 5-second TTL.

On every `WindowEvent::Focused(true)` for a main window (`w-*` label), Rust checks for a fresh pending nav. If found, it:

1. Focuses the target window via `WebviewWindow::set_focus()`.
2. Emits `kex:activate-panel` to that window with payload `{ workspaceId, panelId }`.
3. Clears the pending nav.

Each main window's `App.tsx` listens for `kex:activate-panel` on startup (via `getCurrentWindow().listen(...)`) and calls `onActivateAgent(workspaceId, panelId)`, which switches the active workspace, activates the panel, and focuses the terminal with a 50 ms delay.

**Limitation:** only the most recent navigation target is kept. If two agents finish while the app is unfocused, clicking either OS notification navigates to the panel of whichever agent finished last.
