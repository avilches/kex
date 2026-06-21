# Kex — Architecture and Technical Reference

Kex is a lightweight, open-source terminal emulator. ~7-8 MB on disk. No telemetry. No account.

This document is the canonical reference for understanding how Kex works — both technically and from the user's perspective. It covers architecture, feature semantics, known limitations, and technical decisions that have observable effects on usage.

---

## Table of contents

1. [What Kex is and is not](#1-what-kex-is-and-is-not)
2. [High-level architecture](#2-high-level-architecture)
3. [Features — user perspective](#3-features--user-perspective)
4. [Technical decisions with user-visible effects](#4-technical-decisions-with-user-visible-effects)
5. [Known limitations](#5-known-limitations)
6. [Technology stack](#6-technology-stack)
7. [Frontend module map](#7-frontend-module-map)
8. [Security model](#8-security-model)

See also: [IPC.md](IPC.md) — Tauri command surface and agent notification protocol · [BUILD.md](BUILD.md) — build, packaging, and release

---

## 1. What Kex is and is not

**Is:** a fast, terminal-first development workspace with a native PTY backend, an integrated code editor, file explorer, and source control.

**Is not:**
- A full IDE replacement. No language-server integration, integrated debuggers, or refactoring engines at IDE scale.
- A general-purpose browser. The web preview pane is scoped to local dev servers and lightweight doc viewing only.
- A cloud product. No accounts, no telemetry, no managed sessions.
- A shell replacement. It runs your shell (zsh, bash, fish, pwsh) via a real PTY, it does not replace it.

---

## 2. High-level architecture

Kex uses a strict **two-process model**. The Rust process owns all OS access. The WebView (React) never touches the filesystem, processes, shells, or the network directly — everything goes through typed IPC calls (`invoke()`) to Tauri commands registered in `src-tauri/src/lib.rs`.

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

**Native PTY via `portable-pty`.** Not a wrapper around `script` or `expect`. Kex spawns a real pseudo-terminal, so TUI apps (vim, htop, tmux, lazygit, etc.) work correctly, including mouse input and true color.

**Shell integration.** Kex injects init scripts at shell startup that emit OSC 7 (current working directory) and OSC 133 sequences (prompt boundaries, command start, command end, exit code). This enables:
- The CWD breadcrumb in the status bar to update as you `cd` through directories.
- The file explorer to follow the active terminal's working directory.
- The optional **block terminal** mode (a panel with `blocks: true`): command output is grouped into blocks with per-block chrome (cwd, time, duration, exit badge on failure) and a hover toolbar (`Run again`, copy command/output, find in block). The shell's prompt is suppressed and input is driven by a host-rendered `ShellInput`. `Cmd+Up`/`Cmd+Down` navigate between command blocks.

Supported shells: zsh (full), bash (full), fish (full), PowerShell 7+ (full), PowerShell 5.1 (full), cmd.exe (no integration — basic terminal only).

**Split panes.** Terminals can be split horizontally and vertically within a pane. Each panel is an independent PTY. Splitting a pane creates a second pane alongside it; each pane has its own panel tab strip. Two limits apply, both configurable in `settings-general.json`: `paneSplitLimit` (default `{ width: 250, height: 250 }`) blocks horizontal splits when the pane is too narrow and vertical splits when it is too short; `workspacePaneLimit` (default `8`) caps the total number of panes per workspace. Both keyboard shortcuts and drag-and-drop zones enforce these limits.

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

**Fuzzy search.** The search bar in the explorer panel searches file names under the active explorer root using the `nucleo-matcher` crate on the Rust side. Because the finder is scoped to the current root, it never surfaces files outside the view, and each result's path is shown relative to that root.

**Root modes (per workspace).** The explorer root is chosen by an explicit mode stored per workspace (`explorerRootMode`, `pinnedRoot` in the workspace body file `workspaces/<id>.json`) and selected from the dropdown above the tree. The mode is the single source of truth for the root, whether a terminal or an editor pane is focused. The four modes:

In every mode the tree is prefixed by a non-collapsible header row showing the current root's full path (left-truncated when long, so the tail stays visible). The selector trigger shows the active mode's label (not the folder name) and its icon; each option's subtitle is its resolved path.

- **File System**: root starts at the user's home directory and is navigable per workspace (`fsRoot` field in the workspace body file `workspaces/<id>.json`, default home). Double-clicking a folder enters it (sets `fsRoot`). On top of the shared header, File System adds a `..` folder-style entry (shown only when not at the filesystem or drive root) whose double-click climbs to the parent directory; the selector uses the hierarchy icon. The `..` row exists only in this mode; the other three modes are unaffected and double-click does nothing. If the current root is deleted from under the explorer, it silently relocates to the nearest existing ancestor (climbing the path and `fs_stat`-ing each candidate) instead of showing an error state. The JSON-only preference `keepFolderLayoutOnChangeExplorerRoot` (default `false`) controls whether the per-root expansion layout is restored on a root change or the tree starts collapsed.
- **Workspace Root**: root is a folder fixed via the "Set as workspace root" folder context action. The selector disables this option (showing "Set a new workspace root in the explorer" or "Folder not found") when no folder is set or the saved one no longer exists. If the folder is deleted while it is being shown, the explorer falls back to an informational empty state instead of a raw filesystem error.
- **Follow Terminal** (default): root tracks the active terminal cwd (OSC 7). `cd ~/projects/foo` and the explorer follows.
- **Follow Git Root**: root is the nearest ancestor of the terminal cwd containing a `.git`, recomputed on each cwd change. Leaving a repo keeps the last known git root until another repo is entered; with no repo anywhere it behaves like Follow Terminal.

In Follow Terminal and Follow Git Root modes a pin button appears in the header to fix the current root as the Workspace Root in one click. The selector dropdown shows each mode's resolved path as a subtitle. The selection logic is the pure `resolveExplorerRoot` (`modules/workspaces/lib/explorerRoot.ts`, tested); the git root of the current cwd and a per-workspace last-known fallback are runtime-only state in `App.tsx` (re-derived from the cwd on restart) computed via the `git_resolve_repo` command. The previous per-editor root override was removed: opening a file no longer changes the explorer root.

**Focus on Explorer.** A tab context-menu action and `F4` shortcut reveals the tab's file (editor / markdown / git-diff / git-commit-file) or, for terminal tabs, its current folder, in the tree. If the active view already contains the target it is just expanded and selected; otherwise the explorer switches to File System rooted at the deepest common ancestor of the reference fs root and the target (falling back to the target's parent dir when there is none). Unlike the removed automatic per-editor override, this is an explicit user action. The decision is the pure `resolveFocusTarget` (same file, tested); revealing is driven by a `revealRequest` prop on `FileExplorer` that re-runs as the tree reloads asynchronously, expanding each ancestor until the target loads, then selecting and scrolling to it without taking focus from the editor.

**Drag to open.** Files (not directories) can be dragged from the explorer and dropped onto any pane drop zone or between tabs to open them as permanent editor tabs. Dropping on a directional zone (top/bottom/left/right) splits the target pane and opens the file in the new sub-pane. The drag experience is visually identical to dragging tabs between panes. See `WorkspaceDndProvider.tsx`.

**Drag to move.** Dragging a file or folder onto another folder row moves it there (`fs_rename`). Built on the same `@dnd-kit` context as drag-to-open (not a second pointer system): folder rows are `useDroppable` (`explorer-dir:<path>`), folders drag as `dir:<path>` (move only, ignored by the pane-open handler), files as `file:<path>` (openable in a pane *and* movable). The move is committed by `useDndMonitor` in `FileExplorer` calling `tree.movePath`; the drop target is only registered for valid destinations (not self, current parent, or a descendant) and `movePath` additionally refuses name clashes. Hovering a collapsed folder for 700ms springs it open.

**Drop files from the OS.** Dragging files/folders from Finder/Explorer onto an explorer folder copies them in (`fs_copy`, recursive, refuses to overwrite). Uses Tauri's native drag-drop (`onDragDropEvent`), one webview listener that hit-tests by `data-fs-path` / `data-explorer-drop`. It coexists with the terminal's own OS-drop listener (`useTerminalFileDrop`, which hit-tests `data-pane-leaf`): both receive every event but each acts only on its own DOM region, so they never steal each other's drops.

**Git decorations.** Optional (Settings > General > Explorer, **off by default**). Tints each file name by git status (modified/added/deleted/renamed/untracked) and dims gitignored entries; collapsed folders bubble up the highest-priority status of their children. The data rides the always-resident Source Control snapshot (no extra git IPC or watcher); the only backend cost is a `max_depth(1)` `WalkBuilder` per directory read, and only when the flag is on (gated to a real git repo so it never trips macOS folder-access prompts outside one). Pure logic in `lib/gitStatusUtils.ts` (tested); colors in `lib/gitStatusColor.ts`.

### 3.4 Source control

**Git status and staging.** The source control panel shows modified, staged, untracked, and conflicted files. You can stage / unstage individual files or hunks. The diff view uses the CodeMirror merge extension.

**Commit.** Type a commit message and commit with `Cmd+Enter` / `Ctrl+Enter`. No separate terminal command needed.

**Push.** Push to the remote with upstream awareness — Kex tells you if you are ahead, behind, or diverged before you push.

**Branch display.** The current branch (or detached HEAD state) is shown in the header.

**All git operations are gated on workspace authorization.** A directory must be authorized (see section 4.2) before any git command can run against it. This prevents the source control panel from operating on paths that were not explicitly opened.

### 3.5 Git history

**Commit graph.** The git history pane renders a proper commit graph with lane routing for merges and branches, similar to GitLens or Sourcetree. Refs (branches, tags, HEAD) are shown on the relevant commits.

**Per-commit diffs.** Click a commit to see its changed files. Click a file to see the full diff for that file in that commit.

**Remote links.** For commits on GitHub/GitLab/Bitbucket remotes, there is a link to open the commit page in the browser.

**Commit search and filter.** Filter the history by commit message, author, or date range.

### 3.6 Terminal coding-agent notifications

When Claude Code (or a future compatible agent) runs inside a Kex terminal, Kex detects its state through two channels: OSC 133 C (shell integration, always active) and a per-session Unix domain socket for Claude Code hook events. The tab shows a spinner while the agent is working, an amber dot when it needs your input, and no indicator when it is idle. A notification bell in the header lists active sessions and recent events with OS notifications when you are away from the window.

The indicator is cleared by any of: the agent's `Stop` hook firing normally, the agent process exiting (OSC 133;D), the PTY closing, or the user typing anything in the terminal. The last condition ensures the indicator never lingers after Ctrl+C or abnormal termination.

The Unix socket (`/tmp/kex-ipc-{pty_id}.sock`, path in `KEX_IPC`) is created before the child process starts in `session::spawn()` and cleaned up on PTY close. Claude Code hooks send raw JSON payloads to it; `pty/ipc.rs` dispatches them to Tauri events consumed by the frontend.

**Notification bell scoping.** Each main window runs its own React runtime with its own Zustand store. `kex:agent-signal` is broadcast globally, but `leafIdForPty()` is window-local, so each window's `AgentNotificationsBridge` only processes signals from PTYs that belong to it. The bell in each window shows only that window's agents.

**OS notification deep-link.** When the app is unfocused and the frontend decides to send an OS notification, it first calls `agent_queue_nav` to register `{ windowLabel, workspaceId, panelId }` in `PendingNavState` (Rust, TTL 5 s). On any subsequent `WindowEvent::Focused(true)` for a main window, Rust consumes the pending target, focuses the correct window, and emits `kex:activate-panel` to it. Each window listens for that event and calls `onActivateAgent`, which switches the workspace, activates the panel, and focuses the terminal (50 ms delay for React state to settle). See IPC.md for the full protocol detail.

### 3.7a Agent session restore

When an agent session is running at the time Kex closes, Kex offers to resume it automatically on the next launch. The tab showing a restored session displays `agentname · dirname` as its title, a `✦` icon, and a status indicator (spinner while working, amber dot while waiting for input, nothing when idle). If the resume command fails (missing transcript, deleted directory), the icon becomes `⚠` and the title turns red.

Hooks must be installed via "Set up Claude Code" (notification bell popover) for this feature to work. See `docs/AGENT_SESSION_RESTORE.md` for the complete design and edge cases.

### 3.7 Web preview

**Auto-detected dev server.** When a localhost URL is detected in the terminal output (e.g., `http://localhost:5173`), a pill appears in the status bar offering to open a preview tab. The preview tab renders the URL in a native child webview — not an iframe inside the main webview.

**Image and PDF viewers.** The preview pane also handles images and PDFs opened from the file explorer.

**Sandboxed.** The preview runs in its own webview context. It cannot communicate with the Kex app surface.

### 3.8 Themes and customization

**App theme.** The theme engine writes CSS custom properties to the document root. All UI components consume the theme through those variables. There are 10 built-in app themes: Kex Default, Nord, Tide, Catppuccin, Tokyo Night, Caffeine, Claude, Gruvbox, Sage, Rose Pine.

**Theme editor.** You can create and edit themes in-app. Changes are live-previewed. Custom themes are persisted to the settings store and can be exported as JSON files to share.

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

### 4.2 Tab close confirmation

Every close path (tab close button, the close shortcut, and Close All / Close Other Tabs) runs through one sequential queue, `closePanels(panelIds)` in `useTabCloseGuards`. The pure core (`hooks/closeQueue.ts`) closes panels one at a time: a terminal with a live foreground process or a dirty editor pauses the queue on a confirmation dialog, and a cancel stops the whole run before closing the current panel. Terminals only prompt when the `warnOnCloseTabWithRunningProcess` preference is on (default on); the terminal dialog's "Don't ask me again" checkbox flips that preference off. The editor dialog offers Save / Don't save / Cancel; Save writes through the editor handle before closing, and a failed write stops the queue without losing the buffer. After any run, focus returns to the active tab's terminal or editor.

### 4.3 Workspace authorization

Before any git or shell command can run against a directory, that directory must be in the `WorkspaceRegistry`. The registry is populated automatically when you open Kex in a directory (via CLI argument or the OS file manager context menu), and when you explicitly navigate to one via the terminal (`cd` triggers an OSC 7 event that registers the new cwd). `workspace_authorize` is the IPC command for explicit authorization.

The registry lives in memory only — it does not persist across restarts. Each session builds it up as the user navigates.

The practical effect: if you try a git operation in a directory you haven't navigated to in the terminal yet, the git-related features (diff decorations, source control panel) will fail with "path is outside the authorized workspace" until you `cd` there in a terminal first.

**`fs_*` commands are not workspace-gated.** File read/write commands (`fs_read_file`, `fs_write_file`, `fs_stat`, `fs_create_*`, `fs_rename`, `fs_delete`, `fs_read_dir`, `fs_search`, `fs_grep`, etc.) accept any path the OS allows. This is a deliberate decision: the explorer only surfaces paths the user has explicitly navigated to, so there is no app-level vector for a user to accidentally open a path outside their workspace. Terminal commands can access arbitrary paths regardless of any app-level guard, so a gate here would only stop the app's own UI — not a shell running inside a pane. A deny-list for secret paths (`.ssh`, `.env`, `*.pem`, etc.) would be worthwhile if Kex ever runs autonomous agents that make IPC calls directly; the right insertion point is `guard_read`/`guard_write` helpers at the top of `fs/file.rs`, applied before `resolve_path`. Until then, `capabilities/default.json` is the real boundary: only code in the webview bundle can call these commands.

### 4.3 Windows: ConPTY spawn serialization

On Windows, opening a new terminal tab serializes through a `SPAWN_LOCK` mutex. Concurrent ConPTY open calls leave one of the resulting PTYs with a stalled output pipe. This means: if you open several tabs very quickly on Windows, the tabs open in sequence rather than in parallel. The delay is typically under 200ms per tab and is only perceptible during rapid tab creation.

### 4.4 Windows: Job Objects for process cleanup

Every ConPTY child process on Windows is assigned to a Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. When the Job handle is released (Kex closes, crashes, or is killed), the OS terminates the entire process subtree of that shell session. Without this, `npm run dev` started inside a PowerShell terminal would continue running after Kex exits, as `TerminateProcess` only kills the immediate child.

Closing a tab from the UI (the explicit close button) also kills the immediate child. The Job Object handles the "Kex process died unexpectedly" case.

### 4.5 OSC trust model

Kex's shell integration emits and parses OSC 7 (cwd), OSC 133 (prompt/command boundaries), and OSC 0/2 (window/icon title). The cwd from OSC 7 updates the status bar breadcrumb and the explorer root. OSC 0/2 title is written to `oscTitleStore` (in-memory, not persisted) and shown in the pane tab. This means a malicious command outputting a crafted OSC sequence could theoretically spoof the displayed cwd or tab title. The shell integration scripts are trusted; arbitrary terminal output from untrusted remote connections (SSH to untrusted hosts) is a trust boundary to be aware of.

**Tab title priority** (highest to lowest, evaluated in `PaneTabBar`):

1. `panel.title` — explicit user rename, always wins.
2. `oscTitle` — value from `oscTitleStore`, set by OSC 0/2 emitted by the running program. Claude Code uses this to propagate its AI-generated conversation title (`ai-title` field in the session JSONL); it emits `✳ Claude Code` on startup and `✳ <ai-title>` once the title is generated. Spinner frames (`⠂ Claude Code`, `⠐ Claude Code`) also arrive but are transient and do not replace a previously stable title because they change before the next render cycle.
3. `agent · dirname` — shown when an agent is active but no OSC title has arrived yet.
4. `runningCommand` — basename of the foreground command from OSC 133 C (e.g., `cargo`, `git`). Not shown when `oscTitle` is set.
5. cwd-derived — last two path segments, truncated from the left so the deepest directory stays visible.

`oscTitleStore` (`src/modules/terminal/lib/oscTitleStore.ts`) is a module-level singleton with `useSyncExternalStore`-compatible API. It is keyed by `panelId`, is never persisted, and is cleared on session dispose and respawn. OSC 0 and OSC 2 are both handled (both set the window title per the terminal spec); the handler is registered via `registerTitleHandler` in `osc-handlers.ts` and wired in `useTerminalSession.ts` alongside the existing OSC 7 and OSC 133 handlers.

### 4.6 Forward-slash canonical paths

The frontend stores all paths in forward-slash form. OSC 7 on Windows emits `/C:/Users/foo`; Kex normalizes it to `C:/Users/foo` at parse time. `homeDir()` on Windows returns backslashes; `App.tsx` converts at the boundary. Any code consuming a path that might originate from the OS must normalize separators with `.split(/[\\/]/)`. This is documented in `AGENTS.md` and enforced in code review.

The reason: consistent string equality for path comparison (e.g., preventing the file explorer from flashing when `tab.cwd` arrives). Using two representations and forgetting to normalize in one place causes subtle bugs.

### 4.7 React 19 Strict Mode double-mount

In development (`pnpm tauri dev`), React 19's Strict Mode double-invokes `useEffect`. This means a PTY is opened and immediately closed before the real one opens. You will see `pty opened id=1` then `pty closed id=1` followed by `pty opened id=2` in dev logs. This is expected and does not happen in production builds.

### 4.8 Terminal font resolution (VS Code model)

There is no runtime font detection. `src/lib/fonts.ts` resolves the terminal font the way VS Code does: a per-platform default stack (bundled JetBrains Mono first, then Menlo/Monaco on macOS, Consolas on Windows, Droid Sans Mono/DejaVu Sans Mono on Linux, then the bundled Symbols Nerd Font Mono, ending in `monospace`), and a free-text "Font family" setting that accepts a comma-separated list. A non-empty preference is normalized (names with spaces are quoted, required by the canvas font shorthand the WebGL atlas uses) and always prepended to the default stack, so a typo or uninstalled font can never break rendering. The browser falls back per glyph through the list, which is also how Nerd Font icons resolve when the primary font lacks them. xterm runs with `customGlyphs` (pixel-perfect box-drawing/powerline glyphs drawn by the renderer, not the font) and `rescaleOverlappingGlyphs` (VS Code defaults; Nerd Font, powerline and emoji ranges are excluded from rescaling by xterm itself). Icon coverage does not depend on installed fonts: `src/assets/fonts/SymbolsNerdFontMono-Regular.woff2` (icon-only PUA glyphs vendored from nerd-fonts v3.4.0, ~1.1 MB, MIT) is declared in `src/styles/fonts.css`, preloaded by `ensureMonoFontsLoaded()`, and sits last in every stack, so prompt icons (powerline, devicons, octicons) render out of the box and user-set fonts inherit them through the appended default stack.

Earlier approaches that were removed: auto-detecting installed Nerd Fonts via `document.fonts.check()` (false positives in WKWebView, it reports fallback-renderable rather than installed) and via `document.fonts.load()` (worked, but a curated candidate list plus a dropdown is strictly worse than VS Code's free-text stack with per-glyph fallback).

---

## 5. Known limitations

### 5.1 No SSH support (yet)

SSH is on the roadmap but not yet implemented. Kex does not manage SSH connections, key agents, or remote filesystems. You can of course `ssh user@host` in a terminal tab — the PTY runs it fine — but the editor, file explorer, and git panel all operate on the local filesystem (or the WSL filesystem on Windows). See ROADMAP.md.

### 5.2 No persistent terminal layout restore

Terminal sessions are not persisted across restarts. When you close and reopen Kex, terminal panels restart with a fresh PTY in their saved `cwd`. Shell history within the terminal is whatever your shell persists natively (`.zsh_history`, `.bash_history`, etc.).

**Exception: agent sessions.** If Claude Code hooks are installed (`agent_enable_claude_hooks`), Kex records the active session id and cwd at Claude Code exit and restores it automatically on next launch by running `claude --resume '<id>'` in the terminal. See section 3.7a and `docs/AGENT_SESSION_RESTORE.md`.

### 5.3 No LSP / language server

The editor does not support Language Server Protocol. There is no hover documentation, go-to-definition, inline diagnostics, or refactoring from language servers. CodeMirror's built-in syntax highlighting and autocomplete work, but IDE-level language intelligence does not. This is a deliberate scope decision (see ROADMAP.md > Out of scope).

### 5.4 File explorer watch lag

The file tree watches for filesystem changes via `notify`. On some Linux filesystems (including certain WSL mounts) the watcher latency can be higher than on macOS (kqueue/FSEvents) or Windows (ReadDirectoryChangesW). A file created in the terminal may take a second or two to appear in the explorer.

### 5.5 Apple Silicon / macOS code signing

Kex is not yet notarized by Apple. The first launch on macOS Gatekeeper requires right-click > Open (or `xattr -dr com.apple.quarantine Kex.app`). Auto-updates are signed with minisign but not Apple-notarized.

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
    ├── terminal/                  — xterm.js stack, PTY bridge, OSC parsing (7/133/0/2), blocks, oscTitleStore
    │   └── block/                 — Block overlay, shell input, mode machine, history
    ├── editor/                    — CodeMirror 6 stack, diffs, vim
    ├── agents/                    — Terminal agent notifications + session restore (Claude Code, etc.)
    │   ├── components/            — NotificationBell
    │   ├── lib/                   — route, notify, agentIcon, agentSessionRestore
    │   └── store/                 — agentStore
    ├── explorer/                  — File tree, fuzzy search, icons, inline rename, background duplication with progress emitted as the global event `kex:duplicate-progress` (so every app window, including Settings, can render it) and a global floating progress bar (`DuplicateProgressBar`, bottom-left) with cancel support (cancel deletes the partial copy). Quitting (Cmd+Q) while a copy is running is intercepted by Rust, which defers the exit and emits `kex:duplicate-quit-prompt` to all windows; the resulting modal offers wait, keep-open (`cancel_quit`), or cancel-copy-and-quit.
    ├── source-control/            — Git stage/commit/push panel
    ├── git-history/               — Commit graph, per-file diffs
    ├── header/                    — Top bar, inline search
    ├── statusbar/                 — CWD breadcrumb, workspace env selector
    ├── workspaces/                — Workspace/Pane/Panel model; useWorkspaces (source of truth),
    │                                splitNode tree ops, WorkspaceView/SplitNodeView/PaneView/PanelContent,
    │                                WorkspaceDndProvider (DndContext + file/tab drag handlers)
    ├── sidebar/                   — SidebarViewId type (residual; side panels moved to RightPanel)
    ├── shortcuts/                 — Global keymap registry, useGlobalShortcuts
    ├── theme/                     — CSS variable engine, presets, custom themes, bg image
    ├── settings/                  — Settings store, preferences, window opener
    ├── browser/                   — Web browser pane (address bar; also dev-server preview). Browser panels can be floated out into a native `WebviewUrl::External` window via the float-browser feature; the panel stays as a placeholder in its pane and docks back on close.
    ├── markdown/                  — Markdown renderer pane
    ├── workspace/                 — Local + WSL environment switching
    ├── updater/                   — Auto-updater dialog
    └── command-palette/           — Fuzzy command/file/search palette
```

### Panel kinds (tagged union)

`terminal` | `editor` | `browser` | `markdown` | `git-diff` | `git-history` | `git-commit-file`

All panel kinds follow the same never-unmount rule. Panels live inside panes; panes are nodes of a binary split tree inside a workspace. The workspace sidebar (left, 52px) lists workspaces; the right panel holds Explorer, Source Control, and Git History.

Markdown files open in their rendered view (`kind: "markdown"`) by default; a floating Rendered/Raw toggle (`MarkdownViewToggle`) flips a single panel in place between `markdown` and `editor` via `setPanelView` in `useWorkspaces` (id/path/title preserved; switching to rendered is a no-op while the editor is dirty).

A `browser` panel carries an optional `floating` flag. When set, the panel is shown in a native `WebviewUrl::External` window (managed Rust-side by `FloatBrowserState`) and its in-pane slot renders a placeholder with an editable address bar instead of the iframe. See `docs/FORK.md` (Floating browser windows) for the full lifecycle.

### `src/lib/native.ts`

Contains typed wrappers for all Tauri `invoke()` calls (`native.readFile`, `native.gitCommit`, `native.workspaceAuthorize`, etc.). All modules import from `@/lib/native` — never use `invoke()` directly in components or hooks.

---

## 8. Security model

**IPC boundary.** The WebView cannot access the filesystem, spawn processes, or make outbound HTTP requests directly. Every OS operation is an explicit `invoke()` call to a named Tauri command. The `capabilities/default.json` file is the allowlist — only commands listed there are available to the webview.

**Path authorization.** Git commands and shell operations require the target directory to be in the `WorkspaceRegistry`. The registry is populated by explicit user gestures (opening a directory, navigating there in a terminal) or by the CLI launch argument.

**CSP.** The WebView has a strict Content Security Policy (see `tauri.conf.json`). `connect-src` allows `self`, Tauri IPC, and `https:` plus `http://localhost:*` (for local dev servers). `script-src` allows `wasm-unsafe-eval` (required for xterm.js WebGL). No `unsafe-eval`.

**OSC trust.** Kex processes OSC 7, OSC 133, and OSC 0/2 sequences. OSC 0/2 (window/icon title) is passed through as-is and shown in the pane tab; it is the only channel that updates the tab title at runtime. There is no OSC-based execution primitive (unlike iTerm2's proprietary sequences). The risk is cwd spoofing from maliciously crafted output, not code execution.
