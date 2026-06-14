# Terax — Backend IPC surface

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
| `agent_claude_hooks_status` | Query whether hooks (notification + session) are installed |
| `agent_session_restore_plan` | Return `Vec<RestorePlan>` — one entry per panel that had a running agent session at last close |

---

## Terminal agent notification protocol

Terax passively monitors terminal panels for coding agents (Claude Code, Codex, etc.) using OSC sequences. No configuration is required — detection arms itself automatically once a compatible agent is detected.

### How it works

1. Claude Code (or a compatible agent) installs Terax hooks via `agent_enable_claude_hooks`. These hooks emit an `OSC 777` marker through the hook's `terminalSequence` field (hooks lost `/dev/tty` access in Claude Code v2.1.139).
2. The OSC 777 marker self-arms `agent_detect.rs` in the PTY byte reader. The detector tracks the agent's state via subsequent OSC sequences.
3. OSC 133;C (command prompt shown) arms the detector. Subsequent hook events transition the state machine: `started` / `working` / `attention` (needs user input) / `finished` / `exited`.
4. The frontend `AgentNotificationsBridge.tsx` maps these state transitions to the notification router (`lib/route.ts`):
   - Panel is focused and visible: suppress (user is already watching)
   - Window is not focused: send an OS notification
   - Window is focused but the panel is hidden: show a Sonner toast
5. The `NotificationBell` in the header aggregates status across all active terminal agent sessions.

### Zero cost when idle

The detection logic runs entirely on the PTY byte filter. When no agent is running, no extra work is done. There are no polling timers or background requests.

### Installing hooks

Hooks can be installed from within the app (the notification bell popover shows a "Set up Claude Code" prompt if hooks are not yet installed). The installer (`agent_enable_claude_hooks`):
- Reads the existing Claude Code `settings.json` atomically
- Injects the `terax:agent-signal` hook entries without overwriting unrelated settings
- Also injects `SessionStart` and `SessionEnd` hooks that write to `~/.config/terax/agent-sessions.json` (see below)
- Is idempotent — re-running it on an already-configured installation is safe

### Agent session persistence

In addition to the live notification hooks, `agent_enable_claude_hooks` installs two Claude Code lifecycle hooks:

- **`SessionStart`**: writes `{ panelId, agent, sessionId, cwd, state: "running" }` to `~/.config/terax/agent-sessions.json` (atomic `mktemp` + `mv`; uses `jq` if available, raw JSON otherwise).
- **`SessionEnd`**: updates `state` to `"exited"` for the matching `panelId`.

The hook script reads `TERAX_PANEL_ID` from the environment — a UUID injected into every PTY shell environment at spawn time (see `pty_open`).

On the next Terax launch, `agent_session_restore_plan` reads the store, skips exited sessions, locates the agent's JSONL transcript (e.g. `~/.claude/projects/*/<sessionId>.jsonl`) to read the session's recorded `cwd`, verifies the directory still exists, and returns one `RestorePlan` per recoverable session. The frontend then types the appropriate resume command (e.g. `claude --resume '<id>'`) into the terminal 200ms after the PTY opens.

`CLAUDE_CONFIG_DIR` is respected: if set, the hook writes there instead of `~/.config/terax/`, and the restore logic searches for transcripts under that directory.

See `docs/AGENT_SESSION_RESTORE.md` for the complete design.
