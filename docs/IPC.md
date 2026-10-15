# Kex - Backend IPC surface

All Tauri commands registered in `src-tauri/src/lib.rs` via `tauri::generate_handler![]`. The WebView calls them via `invoke()` from `src/lib/native.ts` - never use `invoke()` directly in components or hooks.

Adding a new command requires three steps: `Cargo.toml` dependency (if a new plugin), `.plugin(...)` call in `lib.rs` `run()`, and a capability entry in `src-tauri/capabilities/default.json`.

---

## `pty::*` - PTY sessions

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
| `pty_list_shells` | Shells found on this machine: `name`, `path` and `integrated` (whether Kex injects OSC 7/133 integration for it). Feeds the shell selector in Terminal settings |
| `pty_metrics(pty_ids)` | Sample CPU% and resident memory of each terminal's shell process tree (shell PID + all descendants). Returns `{ pty_id, pid, cpu_percent, mem_bytes, shell_name }[]`. CPU is normalized 0..=100 (per-core sum divided by logical CPU count) via a persistent `sysinfo::System` kept in `ProcessMonitor` managed state, so the value is a real delta between calls, not an instantaneous snapshot. Sessions with an unknown shell PID or no active session are skipped. `shell_name` is the shell process name, used when no foreground command is running. |

Shell integration scripts (`scripts/`) are injected at spawn time. Platform detection happens in `pty/shell_init.rs` with `#[cfg(unix)]` / `#[cfg(windows)]` split.

---

## `fs::*` - Filesystem

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
| `fs_watch_add` | Start watching a directory for changes (emits `fs:changed`). Events carry canonical paths; each one is also emitted under the spelling the directory was requested with, so a path that goes through a symlink (e.g. `~/Hub/Data`) still matches. Any existing directory is accepted (no workspace authorization), like `fs_read_dir`. At most 2048 distinct directories are watched at once; going over returns an error and adds none of the batch |
| `fs_watch_remove` | Stop watching a path |
| `fs_search` | Fuzzy file name search via `nucleo-matcher` + `ignore` |
| `fs_list_files` | List all files in a tree (respects `.gitignore`) |
| `fs_grep` | Content search via `grep-*` crates |
| `fs_grep_interactive` | Streaming grep for command palette content search |
| `fs_glob` | Glob pattern matching |
| `notes_read_dirs(root, folders, workspace)` | Read one vault level per requested folder, in a single call. Per folder returns `notes` (direct markdown children: `relPath`, `title` (frontmatter `title:` > first H1 > file stem), `snippet` (120 chars), `mtime`, `created` (frontmatter `created:` > btime > mtime)), `subfolders` (`name`, `noteCount` of direct markdown children, `hasSubfolders`), `missing` when the folder is gone or the path is unsafe, and `error` when the folder exists but could not be read. One `ignore` walk of depth 2 per folder: gitignore-aware, skips dot entries and the same pruned dir set as `fs_search`. Reads only the first 2 KB of each note of the folder itself, and never opens a file inside a subfolder. Backs the Notes sidebar view |
| `notes_read_heads(root, relPaths, workspace)` | Title and snippet for the given vault-relative notes, for Quick Access. `missing: true` (with the file stem as title) when a path is absent or unsafe |
| `notes_paths_exist(root, relPaths, workspace)` | Per path, `file`, `dir` or `absent`. Drives the automatic repair of the `notes` namespace in `kex.json`. An unsafe path answers `absent`, so a hand-edited file gets cleaned rather than resolved |
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

## `git::*` - Source control

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
| `git_list_branches` | Local and remote branches (`name`, `isCurrent`, `isRemote`, `remote`, `upstream`, `worktree`, `ahead`, `behind`) |
| `git_checkout_branch` | Check out an existing branch |
| `git_create_branch` | Create a branch |
| `git_list_remotes` | Configured remotes |
| `git_add_remote(name, url)` | Add a remote |
| `git_fetch_remote` | Fetch a single named remote |
| `git_list_worktrees` | Worktrees of the repo (path and metadata) |
| `git_worktree_status` | `{ worktreeName, worktreeCount }` for the repo |

---

## `shell::*` - Command execution

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

## `history::*` - Shell history

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
| `open_settings_window` | Open (or focus) the Settings window, optionally deep-linking a section (`section?: string`) |
| `open_main_window` | Open a new main window with a fresh `w-<hex>` label |
| `window_get_state` | Return the saved `WindowEntry` (workspaces + geometry + optional `sidebar` chrome) for a given window label, reconstructed from the `workspaces.json` index plus the per-workspace `workspaces/<id>.json` bodies |
| `window_save_workspace_state` | Persist workspace list and active index for a window label; writes the lean `workspaces.json` index plus one `workspaces/<id>.json` per changed workspace |
| `window_save_sidebar(label, open, side, width)` | Persist the per-window sidebar chrome (open, dock side, width percentage) into the `workspaces.json` index only, without rewriting the workspace bodies. The active view is per workspace and travels in the workspace body, not here. Lightweight so it can fire on every toggle or resize (the frontend debounces it ~250ms) |
| `window_save_workspace_bar(label, width)` | Persist the workspace bar pixel width for a given window label into the `workspaces.json` index. Called on every drag resize (debounced in the frontend); separate from the sidebar state persisted by `window_save_sidebar` so the two can change independently. |
| `get_launch_dir` | Return the CLI launch directory (drained on first call) |
| `get_build_info` | Return `{ hash, branch }`, both baked in at compile time by `build.rs` (`env!("KEX_GIT_HASH")` / `env!("KEX_GIT_BRANCH")`), each `"unknown"` if unavailable at build time (no `.git`, or a detached `HEAD` for `branch`). Shown in Settings > About; the branch is only displayed there in dev builds (`productName` "Kex Dev") |
| `agent_enable_claude_hooks` | Atomically install Claude Code terminal hooks (also installs session persistence hooks) |
| `agent_disable_claude_hooks` | Remove Kex hooks from `~/.claude/settings.json` (inverse of enable; idempotent) |
| `agent_claude_hooks_status` | Query whether hooks (notification + session) are installed |
| `agent_session_restore_plan` | Return `Vec<RestorePlan>` - one entry per tab that had a running agent session at last close |
| `agent_session_preview_cmd(tabId)` | Return `Option<RestorePlan>` for a single tab, computed live and read-only (never mutates `agent-sessions.json`). Used by the "Run on start" menu to preview the resume command that will actually run next launch, and by the blocked-start modal's "Try again" |
| `check_launch_dir(path)` | Async (the filesystem checks run on `spawn_blocking`, so a slow mount does not stall the runtime). Return `Option<String>`: why `path` cannot be the working directory of a restored terminal (`Directory not found`, `Not a directory`, `Cannot access directory`), or `None` when it is fine |
| `agent_session_set_snapshot(tabId, sessionId, title, notification)` | Store the tab name and the kind of its unread notification (`attention`, `finished`, `error`; empty or unknown clears it) in the tab's `agent-sessions.json` record. An empty `title` keeps the stored one. Scoped to the session the caller captured: returns `false` and writes nothing when the tab's record belongs to another `sessionId` (an in-flight flush of the previous session after `/clear` cannot land on the new one). Also returns `false` (and writes nothing) if the tab has no record yet, the file cannot be read or parsed, or the write fails, so the caller sends the tab again on its next change; skipped without writing when nothing changed. `RestorePlan` carries both back as `title` / `notification` |
| `agent_detach_session(tabId)` | Detach the stored agent session from a tab (`session_store::detach_session`) |
| `editor_scan` | Detect installed external editors (runs on a blocking thread) |
| `editor_open(binary, argsBeforePath, path)` | Launch an external editor on a file or folder |
| `window_save_groups(label, groups)` | Persist the workspace groups (`WorkspaceGroup[]`) of a window |
| `window_save_collapsed_groups(label, ids)` | Persist which workspace groups are collapsed in a window |
| `restore_window_geometry` | Restore the window size on startup (physical pixels; position is not restored) |
| `sync_menu(state)` | Sync the native menu with the frontend (`autosave`, `sidebarOpen`, `activeView`, `sidebarSide`, `showHidden`) |
| `confirm_quit` | Called once the frontend has flushed editors and workspace state after `kex:before-quit`, so the deferred quit proceeds |
| `enter_windowless_mode` | Called before destroying the last window so the app stays alive in the Dock without windows (macOS) |
| `agent_os_notify` | Send an OS notification `{ window_label, workspace_id, tab_id, title, body }`. On macOS a click on the notification (and only that) focuses the window and emits `kex:activate-tab` to it. |
| `float_browser_open(tabId, url, originWindowLabel, workspaceId)` | Open a floating `WebviewUrl::External` window for the given browser tab. If the window already exists, focuses it instead of opening a second one. State is inserted only after successful window build. |
| `float_browser_close(tabId)` | Destroy the floating window without docking (no `kex:float-dock` event emitted). Removes from state unconditionally. |
| `float_browser_focus(tabId)` | Bring the floating window to front via `set_focus`. |
| `float_browser_dock(tabId)` | Emit `kex:float-dock` to the origin window, then destroy the floating window (same path as the X-button close handler). |
| `float_browser_navigate(tabId, url)` | Navigate the floating window to `url`. Used by the address bar shown in the docked placeholder so the user can drive the floating window from inside Kex. Triggers `kex:float-navigated` on load completion, which syncs `tab.url`. |

### Float browser Tauri events

Events emitted by `float_browser.rs` to the **origin window** (not broadcast):

| Event | Payload | Trigger |
|---|---|---|
| `kex:float-dock` | `{ tabId, currentUrl }` | Floating window closed via X button, `float_browser_dock` command, or the "Dock Browser" / "Dock All Browsers" Window menu items |
| `kex:float-navigated` | `{ tabId, url }` | Each page load completion (`PageLoadEvent::Finished`) in the floating window |

---

## Terminal agent notification protocol

Kex monitors terminal panels for coding agents (Claude Code, Codex, etc.) via two complementary channels:

**OSC 133 C (shell integration)** - the PTY reader detects the sequence `OSC 133;C;<cmd> ST` emitted by the shell init scripts at each prompt. This arms the `AgentDetector` and produces the `started` signal, but only when a segment of the line has an agent as its command word (`cd ~/claude-docs` or `echo claude` do not arm); `Started.cmd_string` carries that segment, not the whole line (see `AGENT_SESSION_RESTORE.md`, *Which part of the line is kept*). This path is always active once shell integration is loaded.

**Unix socket IPC (hook events)**: Claude Code hooks call `trigger-event.sh` on each hook event. The script sends the raw JSON payload to a per-session Unix domain socket at `kex-ipc-{pid}-{pty_id}.sock`, where `pid` is the Kex process id so concurrent instances never share a path (path exposed via `KEX_IPC` env var). The socket lives under `XDG_RUNTIME_DIR` when available, otherwise under an owner-only (0700) `kex-ipc-{uid}` subdirectory of the system temp dir that Kex creates itself, and the socket file itself is forced to 0600; this keeps another local user on a shared machine from pre-creating the path (denial of service) or connecting to inject forged agent events. The Rust listener (`pty/ipc.rs`) reads the JSON and emits Tauri events:

| Hook event | Tauri event | Notes |
|---|---|---|
| `SessionStart` | `kex:agent-session-meta` (does not arm the detector; the frontend creates the tab's session if missing) | Payload: `tabId`, `sessionId`, `cwdLaunch`, `sessionTitle`, `model`, `transcriptPath`, `launchKnown` |
| `SessionEnd` | `kex:agent-signal` kind=`SessionEnd` | |
| `UserPromptSubmit` | `kex:agent-signal` kind=`UserPromptSubmit` | Includes `prompt` |
| `Notification` | `kex:agent-signal` kind=`Notification` | Includes `message` |
| `Stop` | `kex:agent-signal` kind=`Stop` | Includes `last_assistant_message` as `message`, and `backgroundSubagents` (`{ id, agentType, description }[]`): the `background_tasks` entries with `type == "subagent"` and `status == "running"` |
| `SubagentStart` | `kex:agent-signal` kind=`SubagentStart` | Includes `agent_id` as `agentId` and `agent_type` as `agentType`; dropped without an `agent_id` |
| `SubagentStop` | `kex:agent-signal` kind=`SubagentStop` | Same fields as `SubagentStart` |
| `StopFailure` | `kex:agent-signal` kind=`StopFailure` | Includes `error_message` as `message` |
| `PermissionRequest` | `kex:agent-signal` kind=`PermissionRequest` | Includes `tool_name` as `toolName` |
| `MessageDisplay` | `kex:agent-signal` kind=`MessageDisplay` | Only on `final: true` chunks; `delta` as `message` |

Every hook event that carries a non-empty `cwd` (all but `SessionEnd`, `SubagentStart` and `SubagentStop`, whose `cwd` is not the main agent's) also emits `kex:agent-cwd` (`{ tabId, cwd }`). `AgentNotificationsBridge` resolves it with `git_resolve_repo`; when it is a linked worktree the root is stored in the session as `meta.worktreeCwd`. F4 and autofocus on that terminal tab then target the worktree instead of the shell cwd (which does not change when the agent enters a worktree), and fall back to the shell cwd when the agent leaves it or its session ends.

Independent of agents, the PTY reader emits `kex:shell-ready` (`{ id }`, the PTY id) once per PTY, on the first `OSC 133;B` (`AgentDetector` -> `Transition::ShellReady`, handled in `session.rs` before the agent-signal plumbing). The frontend (`shellReadyWaiter.ts`) uses it to know when it is safe to inject a "Run on start" command.

The socket is created in `session::spawn()` before the child process starts, so `KEX_IPC` is always set when the shell reads its environment. The socket file is removed when the `IpcGuard` drops (PTY session closed). The first time a socket path is built, `kex-ipc-<pid>-*.sock` files whose pid no longer exists (`kill(pid, 0)` returns ESRCH) are deleted; sockets of live pids are never touched.

Hooks must be installed via "Set up Claude Code" (notification bell popover). See `docs/NOTIFICATIONS.md` for the detector state machine and `docs/AGENT_SESSION_RESTORE.md` for session persistence.

### OS notification deep-link

When the app is not focused and an agent event requires an OS notification, the frontend calls `agent_os_notify`. On macOS, Rust sends it with `mac-notification-sys` on a dedicated thread that waits for the user's response. A `Click` response focuses the target window (`unminimize`, `show`, `set_focus`) and emits `kex:activate-tab` with payload `{ workspaceId, tabId }`; any other response, and window focus gained by other means, does nothing.

Each main window's `App.tsx` listens for `kex:activate-tab` on startup (via `getCurrentWindow().listen(...)`) and calls `onActivateAgent(workspaceId, tabId)`, which switches the active workspace, activates the tab, and focuses the terminal with a 50 ms delay.
