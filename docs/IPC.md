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
| `fs_delete` | Delete a file or directory |
| `fs_copy` | Copy external files/dirs into a destination directory (recursive, refuses to overwrite). Backs the explorer OS-file-drop; sources are absolute OS paths, only the destination is workspace-resolved |
| `fs_watch_add` | Start watching a path for changes (emits Tauri events) |
| `fs_watch_remove` | Stop watching a path |
| `fs_search` | Fuzzy file name search via `nucleo-matcher` + `ignore` |
| `fs_list_files` | List all files in a tree (respects `.gitignore`) |
| `fs_grep` | Content search via `grep-*` crates |
| `fs_grep_interactive` | Streaming grep for command palette content search |
| `fs_glob` | Glob pattern matching |

---

## `git::*` — Source control

All git commands are gated on the `WorkspaceRegistry`. Git is invoked as a subprocess (not via `git2`).

| Command | Description |
|---|---|
| `git_resolve_repo` | Find the git repo root for a given path |
| `git_panel_snapshot` | Fast status snapshot for the source control panel |
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
| `window_get_state` | Return the saved `WindowEntry` (workspaces + geometry) for a given window label |
| `window_save_workspace_state` | Persist workspace list and active index for a window label to `workspaces.json` |
| `get_launch_dir` | Return the CLI launch directory (drained on first call) |
| `agent_enable_claude_hooks` | Atomically install Claude Code terminal hooks (also installs session persistence hooks) |
| `agent_disable_claude_hooks` | Remove Kex hooks from `~/.claude/settings.json` (inverse of enable; idempotent) |
| `agent_claude_hooks_status` | Query whether hooks (notification + session) are installed |
| `agent_session_restore_plan` | Return `Vec<RestorePlan>` — one entry per panel that had a running agent session at last close |

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
