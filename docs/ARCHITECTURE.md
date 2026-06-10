# Terax — Architecture and Technical Reference

Terax is a lightweight, open-source terminal emulator. ~7-8 MB on disk. No telemetry. No account.

This document is the canonical reference for understanding how Terax works — both technically and from the user's perspective. It covers architecture, feature semantics, known limitations, and technical decisions that have observable effects on usage. Read `TERAX.md` before contributing; that file contains the living coding conventions.

---

## Table of contents

1. [What Terax is and is not](#1-what-terax-is-and-is-not)
2. [High-level architecture](#2-high-level-architecture)
3. [Features — user perspective](#3-features--user-perspective)
4. [Technical decisions with user-visible effects](#4-technical-decisions-with-user-visible-effects)
5. [Known limitations](#5-known-limitations)
6. [Technology stack](#6-technology-stack)
7. [Frontend module map](#7-frontend-module-map)
8. [Backend IPC surface (Rust)](#8-backend-ipc-surface-rust)
9. [Terminal agent notifications](#9-terminal-agent-notifications)
10. [Security model](#10-security-model)
11. [Build and packaging](#11-build-and-packaging)

---

## 1. What Terax is and is not

**Is:** a fast, terminal-first development workspace with a native PTY backend, an integrated code editor, file explorer, and source control.

**Is not:**
- A full IDE replacement. No language-server integration, integrated debuggers, or refactoring engines at IDE scale.
- A general-purpose browser. The web preview pane is scoped to local dev servers and lightweight doc viewing only.
- A cloud product. No accounts, no telemetry, no managed sessions.
- A shell replacement. It runs your shell (zsh, bash, fish, pwsh) via a real PTY, it does not replace it.

---

## 2. High-level architecture

Terax uses a strict **two-process model**. The Rust process owns all OS access. The WebView (React) never touches the filesystem, processes, shells, or the network directly — everything goes through typed IPC calls (`invoke()`) to Tauri commands registered in `src-tauri/src/lib.rs`.

```
┌─────────────────────────────────────────────────────────────┐
│  Tauri process (Rust)                                       │
│                                                             │
│  pty::*         — PTY sessions (portable-pty)               │
│  fs::*          — Filesystem (read, write, search, watch)   │
│  git::*         — Git operations (subprocess)               │
│  shell::*       — Oneshot commands, persistent sessions,    │
│                   background processes                      │
│  workspace::*   — Auth registry + WSL bridge                │
│  history::*     — Shell history (suggest, record, list)     │
│  agent::*       — Claude hooks installer                    │
│                                                             │
└──────────────────────────┬──────────────────────────────────┘
                           │ invoke() / Tauri channels / events
┌──────────────────────────▼──────────────────────────────────┐
│  WebView (React + TypeScript)                               │
│                                                             │
│  terminal/      — xterm.js (WebGL), PTY bridge, OSC parsing │
│  editor/        — CodeMirror 6, diffs, vim                  │
│  explorer/      — File tree, fuzzy search                   │
│  source-control/  — Git stage/commit/push UI                │
│  git-history/   — Commit graph, per-file diffs              │
│  theme/         — CSS variable engine, presets              │
│  agents/        — Terminal agent notifications              │
│  + tabs, header, statusbar, sidebar, settings, preview…     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

There are two separate WebView windows: the main window (`index.html`) and the settings window (`settings.html`). Both run against the same Rust process state.

---

## 3. Features — user perspective

### 3.1 Terminal

**Workspace/Pane/Panel model.** The center area uses a three-level hierarchy: Workspaces (listed in a 52px vertical sidebar on the left) contain a binary pane tree; each pane holds a tab strip of panels. Panels are never unmounted when you switch between them — each PTY keeps receiving output in the background. Switching to a panel that has been running a command shows you the complete, up-to-date buffer instantly.

**Native PTY via `portable-pty`.** Not a wrapper around `script` or `expect`. Terax spawns a real pseudo-terminal, so TUI apps (vim, htop, tmux, lazygit, etc.) work correctly, including mouse input and true color.

**Shell integration.** Terax injects init scripts at shell startup that emit OSC 7 (current working directory) and OSC 133 sequences (prompt boundaries, command start, command end, exit code). This enables:
- The CWD breadcrumb in the status bar to update as you `cd` through directories.
- The file explorer to follow the active terminal's working directory.
- Command block detection for future features.

Supported shells: zsh (full), bash (full), fish (full), PowerShell 7+ (full), PowerShell 5.1 (full), cmd.exe (no integration — basic terminal only).

**Split panes.** Terminals can be split horizontally and vertically within a pane. Each panel is an independent PTY. Splitting a pane creates a second pane alongside it; each pane has its own panel tab strip.

**Inline search.** `Cmd+F` / `Ctrl+F` opens an inline search bar that searches the xterm.js buffer. Matches are highlighted in the viewport and you can jump between them.

**Link detection.** URLs in terminal output are clickable and open in the system browser.

**True color and 256-color.** The xterm.js WebGL renderer supports the full color space. The terminal color palette is driven by the active app theme, not hardcoded.

**WSL as a first-class workspace (Windows only).** Each tab can be set to run inside a specific WSL distro via the workspace switcher in the status bar. The file explorer, git operations, and AI tools all operate inside that distro's filesystem — it is not a wrapped subprocess.

### 3.2 Code editor

**CodeMirror 6.** A proper code editor, not a textarea. Syntax highlighting, bracket matching, line numbers, code folding, multi-cursor, and tab/indent handling work correctly.

**Language support.** TypeScript / JavaScript (JSX/TSX), Rust, Python, Go, HTML, CSS, JSON, Markdown, PHP, C/C++/Java/C# (via legacy modes), and more. Language is detected from the file extension and the appropriate language pack is loaded on demand.

**Vim mode.** Opt-in via settings. Uses `@replit/codemirror-vim` which implements the Vim keybinding model inside CodeMirror. Normal/insert/visual modes, motions, operators, and `:` commands work. Not a full Vim emulation, but covers the common workflow.

**Ten built-in editor themes**, independent from the app theme: Atom One Dark, Aura, Copilot, GitHub Dark, GitHub Light, Gruvbox Dark, Nord, Tokyo Night, Xcode Dark, Xcode Light.

**File sync.** The editor reads and writes files through the Rust filesystem commands. If a file changes on disk while you have it open (e.g., `git checkout`), the editor can detect the change via the file watcher.

### 3.3 File explorer

**Tree view with icons.** The Catppuccin icon theme covers the full range of file types. Folder icons are context-aware (e.g., `src/`, `.github/`, `node_modules/`).

**Keyboard navigation.** Arrow keys to move, `Enter` to open, `F2` / double-click to rename inline, right-click or context menu key for actions (new file, new folder, rename, delete, copy path, reveal in finder, open in terminal).

**Fuzzy search.** The search bar in the explorer panel searches file names across the entire workspace tree using the `nucleo-matcher` crate on the Rust side.

**Root follows active tab.** The explorer root tracks the working directory of the active terminal tab (derived from OSC 7). If you `cd ~/projects/foo` in a terminal, the explorer follows.

### 3.4 Source control

**Git status and staging.** The source control panel shows modified, staged, untracked, and conflicted files. You can stage / unstage individual files or hunks. The diff view uses the CodeMirror merge extension.

**Commit.** Type a commit message and commit with `Cmd+Enter` / `Ctrl+Enter`. No separate terminal command needed.

**Push.** Push to the remote with upstream awareness — Terax tells you if you are ahead, behind, or diverged before you push.

**Branch display.** The current branch (or detached HEAD state) is shown in the header.

**All git operations are gated on workspace authorization.** A directory must be authorized (see section 4.2) before any git command can run against it. This prevents the source control panel from operating on paths that were not explicitly opened.

### 3.5 Git history

**Commit graph.** The git history pane renders a proper commit graph with lane routing for merges and branches, similar to GitLens or Sourcetree. Refs (branches, tags, HEAD) are shown on the relevant commits.

**Per-commit diffs.** Click a commit to see its changed files. Click a file to see the full diff for that file in that commit.

**Remote links.** For commits on GitHub/GitLab/Bitbucket remotes, there is a link to open the commit page in the browser.

**Commit search and filter.** Filter the history by commit message, author, or date range.

### 3.6 Terminal coding-agent notifications

When Claude Code (or a future compatible agent) runs inside a Terax terminal, Terax detects its state via OSC sequences emitted by agent hooks. A notification bell in the header shows the agent's status (working / needs attention / done) with OS notifications when you are away from the window.

See section 9 for the full technical detail.

### 3.7 Web preview

**Auto-detected dev server.** When a localhost URL is detected in the terminal output (e.g., `http://localhost:5173`), a pill appears in the status bar offering to open a preview tab. The preview tab renders the URL in a native child webview — not an iframe inside the main webview.

**Image and PDF viewers.** The preview pane also handles images and PDFs opened from the file explorer.

**Sandboxed.** The preview runs in its own webview context. It cannot communicate with the Terax app surface.

### 3.8 Themes and customization

**App theme.** The theme engine writes CSS custom properties to the document root. All UI components consume the theme through those variables. There are 10 built-in app themes: Terax Default, Nord, Tide, Catppuccin, Tokyo Night, Caffeine, Claude, Gruvbox, Sage, Rose Pine.

**Theme editor.** You can create and edit themes in-app. Changes are live-previewed. Custom themes are persisted to the settings store and can be exported as JSON files to share.

**Background image.** A background image can be set with adjustable opacity and blur. The image sits below the UI surface layer.

**Editor theme is independent.** The editor theme is a separate setting from the app theme. You can have a Catppuccin app theme with a GitHub Light editor theme.

**Terminal palette follows app theme.** The xterm.js ANSI color palette (colors 0-15) is derived from the active app theme, so the terminal colors are consistent with the UI.

### 3.9 Command palette

`Cmd+K` / `Ctrl+K` opens the command palette. It supports multiple modes (file finder, command runner, content search) distinguished by a prefix character. Fuzzy matching. Results are ranked by recency (MRU).

### 3.10 Settings

Settings open in a separate window (not a panel in the main window). Deep-linking is supported — `openSettingsWindow("shortcuts")` opens directly to the Shortcuts section. The settings window is `always_on_top` relative to the main window.

Sections: General, Themes, Shortcuts, About.

---

## 4. Technical decisions with user-visible effects

### 4.1 Panels are never unmounted

When you switch panels or panes, the outgoing panel is hidden with CSS classes. It is never unmounted from the React tree. This means:

- PTY sessions keep streaming in the background. A running `npm run dev` in one panel continues while you work in another.
- Panel state (scroll position, xterm buffer, editor content, unsaved changes) is preserved exactly as you left it.
- Memory usage is proportional to the total number of open panels across all workspaces and panes. Each terminal panel holds a live xterm instance; each editor panel holds CodeMirror state. There is no sleep mechanism for idle panels.

### 4.2 Workspace authorization

Before any git command or file operation can run against a directory, that directory must be in the `WorkspaceRegistry`. The registry is populated automatically when you open Terax in a directory (via CLI argument or the OS file manager context menu), and when you explicitly navigate to one via the terminal (`cd` triggers an OSC 7 event that registers the new cwd). `workspace_authorize` is the IPC command for explicit authorization.

The registry lives in memory only — it does not persist across restarts. Each session builds it up as the user navigates.

The practical effect: if you open a file in the editor or try a git operation in a directory you haven't navigated to in the terminal yet, the git-related features (diff decorations, source control panel) will fail with "path is outside the authorized workspace" until you `cd` there in a terminal first.

### 4.3 Windows: ConPTY spawn serialization

On Windows, opening a new terminal tab serializes through a `SPAWN_LOCK` mutex. Concurrent ConPTY open calls leave one of the resulting PTYs with a stalled output pipe. This means: if you open several tabs very quickly on Windows, the tabs open in sequence rather than in parallel. The delay is typically under 200ms per tab and is only perceptible during rapid tab creation.

### 4.4 Windows: Job Objects for process cleanup

Every ConPTY child process on Windows is assigned to a Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. When the Job handle is released (Terax closes, crashes, or is killed), the OS terminates the entire process subtree of that shell session. Without this, `npm run dev` started inside a PowerShell terminal would continue running after Terax exits, as `TerminateProcess` only kills the immediate child.

Closing a tab from the UI (the explicit close button) also kills the immediate child. The Job Object handles the "Terax process died unexpectedly" case.

### 4.5 OSC trust model

Terax's shell integration emits and parses OSC 7 (cwd) and OSC 133 (prompt/command boundaries). The cwd from OSC 7 updates the status bar breadcrumb and the explorer root. This means a malicious command outputting a crafted OSC sequence could theoretically spoof the displayed cwd. The shell integration scripts are trusted; arbitrary terminal output from untrusted remote connections (SSH to untrusted hosts) is a trust boundary to be aware of.

### 4.6 Forward-slash canonical paths

The frontend stores all paths in forward-slash form. OSC 7 on Windows emits `/C:/Users/foo`; Terax normalizes it to `C:/Users/foo` at parse time. `homeDir()` on Windows returns backslashes; `App.tsx` converts at the boundary. Any code consuming a path that might originate from the OS must normalize separators with `.split(/[\\/]/)`. This is documented in `TERAX.md` and enforced in code review.

The reason: consistent string equality for path comparison (e.g., preventing the file explorer from flashing when `tab.cwd` arrives). Using two representations and forgetting to normalize in one place causes subtle bugs.

### 4.7 React 19 Strict Mode double-mount

In development (`pnpm tauri dev`), React 19's Strict Mode double-invokes `useEffect`. This means a PTY is opened and immediately closed before the real one opens. You will see `pty opened id=1` then `pty closed id=1` followed by `pty opened id=2` in dev logs. This is expected and does not happen in production builds.

---

## 5. Known limitations

### 5.1 No SSH support (yet)

SSH is on the roadmap but not yet implemented. Terax does not manage SSH connections, key agents, or remote filesystems. You can of course `ssh user@host` in a terminal tab — the PTY runs it fine — but the editor, file explorer, and git panel all operate on the local filesystem (or the WSL filesystem on Windows). See ROADMAP.md.

### 5.2 No persistent terminal layout restore

Terminal sessions are not persisted across restarts. When you close and reopen Terax, you start with a fresh terminal. Tab layout (number of tabs, split pane configuration, working directories) is not saved. Shell history within the terminal is whatever your shell persists natively (`.zsh_history`, `.bash_history`, etc.). Persistent sessions and layout restore are on the roadmap.

### 5.3 No LSP / language server

The editor does not support Language Server Protocol. There is no hover documentation, go-to-definition, inline diagnostics, or refactoring from language servers. CodeMirror's built-in syntax highlighting and autocomplete work, but IDE-level language intelligence does not. This is a deliberate scope decision (see ROADMAP.md > Out of scope).

### 5.4 File explorer watch lag

The file tree watches for filesystem changes via `notify`. On some Linux filesystems (including certain WSL mounts) the watcher latency can be higher than on macOS (kqueue/FSEvents) or Windows (ReadDirectoryChangesW). A file created in the terminal may take a second or two to appear in the explorer.

### 5.5 Apple Silicon / macOS code signing

Terax is not yet notarized by Apple. The first launch on macOS Gatekeeper requires right-click > Open (or `xattr -dr com.apple.quarantine Terax.app`). Auto-updates are signed with minisign but not Apple-notarized.

### 5.6 Windows: no code signing

On first launch Windows shows "Windows protected your PC" (SmartScreen). Click "More info" then "Run anyway". This is expected until the project acquires a code-signing certificate.

### 5.7 Web preview is not a full browser

The preview pane renders local dev servers in a native child webview. It does not have navigation history, bookmarks, devtools, or extension support. It is not a replacement for opening your dev server in Chrome or Firefox. External URLs work but the experience is intentionally minimal.

### 5.8 Workspace authorization and file opening

A file opened in the editor from a directory the user has not navigated to in a terminal tab will show git diff decorations only after the directory is authorized. The source control panel will similarly refuse to operate on that path. Navigate to the directory in a terminal tab first (`cd <path>`) to authorize it.

---

## 6. Technology stack

### Rust backend
| Crate | Version | Role |
|---|---|---|
| `tauri` | `2.x` | App framework, webview, IPC |
| `portable-pty` | `0.9` | Native PTY sessions |
| `ignore` | `0.4` | Gitignore-aware directory traversal |
| `grep-regex` / `grep-searcher` | `0.1` | Content search |
| `nucleo-matcher` | `0.3` | Fuzzy file matching |
| `notify` | `8.2` | Filesystem watching |
| `globset` | `0.4` | Glob pattern matching |
| `tokio` | `1` (rt only) | Async runtime (minimal footprint) |
| `windows-sys` | `0.61` | Win32 Job Objects, process management |
| `dirs` | `6` | Cross-platform home/cache directories |
| `tempfile` | `3` | Temporary files for shell init scripts |

Tauri plugins used: `store`, `updater`, `window-state`, `autostart`, `os`, `notification`, `log`, `opener`, `process`.

### TypeScript frontend
| Library | Version | Role |
|---|---|---|
| React | `19.2` | UI framework |
| Vite | `8.x` + Rolldown | Build tool and dev server |
| TypeScript | `~6.0` | Type system |
| Tailwind CSS | `v4` | Styling (config via `@theme` in CSS, no `tailwind.config.*`) |
| shadcn/ui | latest | UI primitives (regenerate via CLI, do not hand-edit) |
| Radix UI | `1.x` | Accessible component base |
| Zustand | `5.x` | Module-scoped global state |
| xterm.js | `6.x` | Terminal renderer (WebGL addon) |
| CodeMirror | `6.x` | Code editor |
| `motion` | latest | Animations (Framer Motion successor) |
| `react-resizable-panels` | `4.x` | Resizable layout panels |
| Sonner | `2.x` | Toast notifications |
| `streamdown` | `2.x` | Markdown streaming renderer |
| Biome | `2.x` | Linter and formatter |
| vitest | `4.x` | Unit tests |

---

## 7. Frontend module map

All modules live under `src/modules/`. Each is self-contained, exports a thin barrel via `index.ts`, and owns its hooks under `lib/`. Path imports always use `@/...`; relative imports across modules are not allowed.

```
src/
├── app/
│   ├── App.tsx                    — Root coordinator, wires all modules
│   ├── components/                — WorkspaceSidebar, RightPanel, WorkspaceInputBar, OsIcon…
│   └── hooks/                     — useTabCloseGuards, useWorkspaceSwitcher
├── components/
│   └── ui/                        — shadcn primitives (do not hand-edit)
│   └── WindowControls.tsx         — Custom title bar buttons (Linux, Windows)
├── lib/                           — Global utils: platform, fonts, zoom, utils, native.ts
├── settings/                      — Second window (SettingsApp.tsx + sections)
├── styles/                        — globals.css, fonts.css, tokens, terminalTheme
└── modules/
    ├── terminal/                  — xterm.js stack, PTY bridge, OSC parsing, blocks
    │   └── block/                 — Block overlay, shell input, mode machine, history
    ├── editor/                    — CodeMirror 6 stack, diffs, vim
    ├── agents/                    — Terminal agent notifications (Claude Code, etc.)
    │   ├── components/            — NotificationBell
    │   ├── lib/                   — route, notify, agentIcon
    │   └── store/                 — agentStore
    ├── explorer/                  — File tree, fuzzy search, icons, inline rename
    ├── source-control/            — Git stage/commit/push panel
    ├── git-history/               — Commit graph, per-file diffs
    ├── header/                    — Top bar, inline search
    ├── statusbar/                 — CWD breadcrumb, workspace env selector
    ├── workspaces/                — Workspace/Pane/Panel model; useWorkspaces (source of truth),
    │                                splitNode tree ops, WorkspaceView/SplitNodeView/PaneView/PanelContent
    ├── sidebar/                   — SidebarViewId type (residual; side panels moved to RightPanel)
    ├── shortcuts/                 — Global keymap registry, useGlobalShortcuts
    ├── theme/                     — CSS variable engine, presets, custom themes, bg image
    ├── settings/                  — Settings store, preferences, window opener
    ├── preview/                   — Dev server preview pane
    ├── markdown/                  — Markdown renderer pane
    ├── workspace/                 — Local + WSL environment switching
    ├── updater/                   — Auto-updater dialog
    └── command-palette/           — Fuzzy command/file/search palette
```

### Panel kinds (tagged union)

`terminal` | `editor` | `preview` | `markdown` | `git-diff` | `git-history` | `git-commit-file`

All panel kinds follow the same never-unmount rule. Panels live inside panes; panes are nodes of a binary split tree inside a workspace. The workspace sidebar (left, 52px) lists workspaces; the right panel holds Explorer, Source Control, and Git History.

### `src/lib/native.ts`

Contains typed wrappers for all Tauri `invoke()` calls (`native.readFile`, `native.gitCommit`, `native.workspaceAuthorize`, etc.). All modules import from `@/lib/native` — never use `invoke()` directly in components or hooks.

---

## 8. Backend IPC surface (Rust)

All commands registered in `src-tauri/src/lib.rs` via `tauri::generate_handler![]`.

### `pty::*` — PTY sessions
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

The shell integration scripts (`scripts/`) are injected at spawn time. Platform detection happens in `pty/shell_init.rs` with `#[cfg(unix)]` / `#[cfg(windows)]` split.

### `fs::*` — Filesystem
| Command | Description |
|---|---|
| `fs_read_dir` | Directory listing (one level) |
| `list_subdirs` | List only subdirectories (for the explorer tree) |
| `fs_read_file` | Read file contents as UTF-8 string |
| `fs_write_file` | Write file contents |
| `fs_stat` | File metadata (size, mtime, is_dir) |
| `fs_canonicalize` | Resolve symlinks and normalize path |
| `fs_create_file` | Create a new file |
| `fs_create_dir` | Create a new directory (recursive) |
| `fs_rename` | Rename or move a file/directory |
| `fs_delete` | Delete a file or directory |
| `fs_watch_add` | Start watching a path for changes (emits Tauri events) |
| `fs_watch_remove` | Stop watching a path |
| `fs_search` | Fuzzy file name search via `nucleo-matcher` + `ignore` |
| `fs_list_files` | List all files in a tree (respects `.gitignore`) |
| `fs_grep` | Content search via `grep-*` crates |
| `fs_grep_interactive` | Streaming grep for command palette content search |
| `fs_glob` | Glob pattern matching |

### `git::*` — Source control
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

### `shell::*` — Command execution
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

### `workspace::*`
| Command | Description |
|---|---|
| `workspace_authorize` | Grant access to a directory for git/shell operations |
| `workspace_current_dir` | Query the authorized current directory |
| `wsl_list_distros` | List installed WSL distributions (Windows only) |
| `wsl_default_distro` | Get the default WSL distro |
| `wsl_home` | Get the home directory of a WSL distro |

### `history::*` — Shell history
| Command | Description |
|---|---|
| `history_suggest` | Fuzzy-match a prefix against shell history |
| `history_record` | Record a command execution to history |
| `history_list` | Return recent history entries |
| `history_commands` | Return all history entries |

### Misc
| Command | Description |
|---|---|
| `open_settings_window` | Open (or focus) the Settings window, optionally deep-linking a tab |
| `get_launch_dir` | Return the CLI launch directory (drained on first call) |
| `agent_enable_claude_hooks` | Atomically install Claude Code terminal hooks |
| `agent_claude_hooks_status` | Query whether hooks are installed |

---

## 9. Terminal agent notifications

Terax passively monitors terminal tabs for coding agents (Claude Code, Codex, etc.) using OSC sequences. No configuration is required — the detection arms itself automatically once a compatible agent is detected.

### How it works

1. Claude Code (or a compatible agent) installs Terax hooks via `agent_enable_claude_hooks`. These hooks emit an `OSC 777` marker through the hook's `terminalSequence` field (hooks lost `/dev/tty` access in Claude Code v2.1.139).
2. The OSC 777 marker self-arms `agent_detect.rs` in the PTY byte reader. The detector tracks the agent's state via subsequent OSC sequences.
3. OSC 133;C (command prompt shown) arms the detector. Subsequent hook events transition the state machine: `started` / `working` / `attention` (needs user input) / `finished` / `exited`.
4. The frontend `AgentNotificationsBridge.tsx` maps these state transitions to the notification router (`lib/route.ts`):
   - Tab is focused and visible: suppress (user is already watching)
   - Window is not focused: send an OS notification
   - Window is focused but the tab is hidden: show a Sonner toast
5. The `NotificationBell` in the header aggregates status across all active terminal agent sessions.

### Zero cost when idle

The detection logic runs entirely on the PTY byte filter. When no agent is running, no extra work is done. There are no polling timers or background requests.

### Installing hooks

Hooks can be installed from within the app (the notification bell popover shows a "Set up Claude Code" prompt if hooks are not yet installed). They can also be installed manually via the Tauri command `agent_enable_claude_hooks`, which is what the in-app prompt calls. The installer:
- Reads the existing Claude Code `settings.json` atomically
- Injects the `terax:agent-signal` hook entries without overwriting unrelated settings
- Is idempotent — re-running it on an already-configured installation is safe

---

## 10. Security model

**IPC boundary.** The WebView cannot access the filesystem, spawn processes, or make outbound HTTP requests directly. Every OS operation is an explicit `invoke()` call to a named Tauri command. The `capabilities/default.json` file is the allowlist — only commands listed there are available to the webview.

**Path authorization.** Git commands and shell operations require the target directory to be in the `WorkspaceRegistry`. The registry is populated by explicit user gestures (opening a directory, navigating there in a terminal) or by the CLI launch argument.

**CSP.** The WebView has a strict Content Security Policy (see `tauri.conf.json`). `connect-src` allows `self`, Tauri IPC, and `https:` plus `http://localhost:*` (for local dev servers). `script-src` allows `wasm-unsafe-eval` (required for xterm.js WebGL). No `unsafe-eval`.

**OSC trust.** Terax only processes OSC 7 and OSC 133 sequences from shell integration scripts. There is no OSC-based execution primitive (unlike iTerm2's proprietary sequences). The risk is cwd spoofing from maliciously crafted output, not code execution.

---

## 11. Build and packaging

### Development
```bash
pnpm install
pnpm tauri dev         # frontend (Vite, port 1420) + Rust (cargo run)
pnpm dev               # frontend only (no Rust)
```

### Quality checks
```bash
pnpm lint              # biome lint ./src
pnpm check-types       # tsc --noEmit
pnpm test              # vitest run
cd src-tauri && cargo clippy --all-targets -- -D warnings
cd src-tauri && cargo test
```

### Production build
```bash
pnpm tauri build
```

Artifacts land in `src-tauri/target/release/bundle/`.

### Bundle chunk strategy (vite.config.ts)

Manual `manualChunks` splits the bundle to keep the initial load fast:
- `react` — React, ReactDOM, scheduler, clsx, tailwind-merge, cva, Vite preload helper
- `radix` — all Radix UI primitives
- `xterm` — xterm.js and addons
- `codemirror` — CodeMirror core, themes, vim
- `cm-lang-<name>` — each CodeMirror language pack (loaded on demand by `languageResolver.ts`)
- `cm-legacy-<name>` — each legacy mode
- `streamdown` — markdown streaming renderer

### Rust release profile
`codegen-units=1`, `lto=fat`, `opt-level=s` (size-optimized), `panic=abort`, `strip=true`. Result: ~7-8 MB binary.

### Platform targets

| Platform | Format | Notes |
|---|---|---|
| macOS | `.dmg` + `.app` | `minimumSystemVersion: 13.0`, `titleBarStyle: Overlay`, entitlements.plist |
| Linux | `.deb`, `.rpm`, `.AppImage` | deb/rpm link against system webkit2gtk; AppImage bundles media framework |
| Windows | NSIS `.exe` | `currentUser` mode (no admin required), WebView2 via `downloadBootstrapper` |
| Arch Linux | AUR `terax-bin` | Tracks latest release |

### Auto-updater

Update manifest endpoint: `https://github.com/crynta/terax-ai/releases/latest/download/latest.json`

Updates are signed with a minisign key. The public key is embedded in `tauri.conf.json`. The updater verifies the signature before applying an update.
