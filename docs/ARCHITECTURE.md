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
│  editor/        — CodeMirror 6, diffs                       │
│  explorer/      — File tree, fuzzy search                   │
│  source-control/  — Git stage/commit/push UI                │
│  git-history/   — Commit graph, per-file diffs              │
│  theme/         — CSS variable engine, presets              │
│  agents/        — Terminal agent notifications              │
│  + tabs, header, sidebar, settings, preview…                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

There are two separate WebView windows: the main window (`index.html`) and the settings window (`settings.html`). Both run against the same Rust process state.

---

## 3. Features — user perspective

### 3.1 Terminal

**Workspace/Pane/Tab model.** The center area uses a three-level hierarchy: Workspaces (listed in a 52px vertical sidebar on the left) contain a binary pane tree; each pane holds a tab strip of tabs. Tabs are never unmounted when you switch between them — each PTY keeps receiving output in the background. Switching to a tab that has been running a command shows you the complete, up-to-date buffer instantly.

A workspace can exist with no open tabs. Closing the last tab in the sole pane of a workspace empties that pane instead of destroying the workspace; the empty pane renders a welcome screen with quick actions (new terminal, open file). A workspace is removed only by an explicit close action (the dedicated `workspace.close` shortcut, the `tab.close` shortcut on an empty workspace, or the sidebar close button), routed through `requestCloseWorkspace`. The `tab.close` shortcut is contextual (it closes the focused tab or pane first, falling back to the workspace only when the pane is empty), whereas `workspace.close` always targets the active workspace. The close action reuses the hibernate dialog in `close` mode (`useCloseWorkspaceFlow`, `HibernateDialog`). The dialog opens only when something would be lost: the workspace has scripts with a command (it says how many will be deleted), documents with unsaved changes (each with its own Save button, plus Save all above two), agents or scripts still running, or terminals with a live foreground process (`collectRunningTerminals` + `leafHasForegroundProcess`, de-duplicated against agents and scripts). Otherwise the workspace closes directly, even when it has terminals. Confirming kills every terminal and discards any unsaved buffer without per-tab prompts, so the flow does not go through `closeTabs`. A hibernated workspace has no mounted editors, so its dialog lists the unsaved documents without Save buttons. When a Save fails (file changed on disk, file deleted, write error) the row shows the reason and offers "Go to tab", which closes the dialog and focuses the tab where the conflict overlay or the deleted-file screen already lives; while closing it also offers "Discard". The confirm button stays disabled until every failed document is fixed or discarded (`isBlockedByFailures`); hibernating has no Discard, so it requires the fix. `useDocument.save()` refuses to write a deleted file (`DELETED_SAVE_ERROR`); only `recreate` does. On unmount, an editor whose final autosave write fails, whose file was deleted or that is in conflict carries its buffer in memory (`unflushedBuffers`, process lifetime only) so hibernating does not lose it while Kex stays open. The `warnOnCloseTabWithRunningProcess` preference no longer affects this path; it only governs closing a single terminal tab. Closing the last workspace quits the app. Panes inside a split still collapse when their last tab is closed - only the sole pane of a workspace stays empty.

**Native PTY via `portable-pty`.** Not a wrapper around `script` or `expect`. Kex spawns a real pseudo-terminal, so TUI apps (vim, htop, tmux, lazygit, etc.) work correctly, including mouse input and true color.

**Shell integration.** Kex injects init scripts at shell startup that emit OSC 7 (current working directory) and OSC 133 sequences (prompt boundaries, command start, command end, exit code). This enables:
- The file explorer to follow the active terminal's working directory.
- The optional **block terminal** mode (a panel with `blocks: true`): command output is grouped into blocks with per-block chrome (cwd, time, duration, exit badge on failure) and a hover toolbar (`Run again`, copy command/output, find in block). The shell's prompt is suppressed and input is driven by a host-rendered `ShellInput`. `Cmd+Up`/`Cmd+Down` navigate between command blocks.

Supported shells: zsh (full), bash (full), fish (full), PowerShell 7+ (full), PowerShell 5.1 (full), cmd.exe (no integration — basic terminal only).

**Split panes.** Terminals can be split horizontally and vertically within a pane. Each panel is an independent PTY. Splitting a pane creates a second pane alongside it; each pane has its own panel tab strip. Two limits apply, both configurable in `settings-general.json`: `paneSplitLimit` (default `{ width: 250, height: 250 }`) blocks horizontal splits when the pane is too narrow and vertical splits when it is too short; `workspacePaneLimit` (default `8`) caps the total number of panes per workspace. Both keyboard shortcuts and drag-and-drop zones enforce these limits.

**Inline search.** `Cmd+F` / `Ctrl+F` opens an inline search bar that searches the xterm.js buffer. Matches are highlighted in the viewport and you can jump between them.

**Link detection.** URLs in terminal output are clickable and open in the system browser.

**Scratchpad bar.** A per-terminal input bar (`terminal.scratchpad`, default `Cmd+U`) to compose multi-line text and send it to the shell without typing at the prompt, with drag-and-drop of explorer paths and an Enter / Shift+Enter send-mode preference. Its state is a single binary flag, `scratchpadOpen`: existence and focus are the same thing, there is no "open but unfocused" state. See [SCRATCHPAD.md](SCRATCHPAD.md) for the full model, and every focus/close path. It only ever appears when its shortcut is pressed.

**True color and 256-color.** The xterm.js WebGL renderer supports the full color space. The terminal color palette is driven by the active app theme, not hardcoded.

**WSL as a first-class workspace (Windows only).** Each tab can be set to run inside a specific WSL distro. The file explorer, git operations, and AI tools all operate inside that distro's filesystem — it is not a wrapped subprocess.

### 3.2 Code editor

**CodeMirror 6.** A proper code editor, not a textarea. Syntax highlighting, bracket matching, line numbers, code folding, multi-cursor, and tab/indent handling work correctly.

**Language support.** TypeScript / JavaScript (JSX/TSX), Rust, Python, Go, HTML, CSS, JSON, Markdown, PHP, C/C++/Java/C# (via legacy modes), and more. Language is detected from the file extension and the appropriate language pack is loaded on demand.

**Ten built-in editor themes**, independent from the app theme: Atom One Dark, Aura, Copilot, GitHub Dark, GitHub Light, Gruvbox Dark, Nord, Tokyo Night, Xcode Dark, Xcode Light.

**File sync.** The editor reads and writes files through the Rust filesystem commands. If a file changes on disk while you have it open (e.g., `git checkout`), the editor can detect the change via the file watcher.

### 3.3 File explorer

**Tree view with icons.** The Catppuccin icon theme covers the full range of file types. Folder icons are context-aware (e.g., `src/`, `.github/`, `node_modules/`).

**Keyboard navigation.** Arrow keys to move, `Enter` to open, `F2` / double-click to rename inline, right-click or context menu key for actions (new file, new folder, rename, delete, copy path, reveal in finder, open in terminal).

**Fuzzy search.** The search bar in the explorer panel searches file names under the active explorer root using the `nucleo-matcher` crate on the Rust side. Because the finder is scoped to the current root, it never surfaces files outside the view, and each result's path is shown relative to that root.

**Root modes (per workspace).** The explorer root is chosen by an explicit mode stored per workspace (`explorerRootMode` in the workspace body file `workspaces/<id>.json`) and selected from the dropdown above the tree. The "show hidden files" toggle (`showHidden`) is likewise per workspace and lives in the same body file (it was previously a global preference). The mode is the single source of truth for the root, whether a terminal or an editor pane is focused. The two modes:

In every mode the tree is prefixed by a non-collapsible header row showing the current root's full path (left-truncated when long, so the tail stays visible). The selector trigger shows the active mode's label (not the folder name) and its icon; each option's subtitle is its resolved path.

- **File System**: root starts at the user's home directory and is navigable per workspace (`fsRoot` field in the workspace body file `workspaces/<id>.json`, default home). Double-clicking a folder enters it (sets `fsRoot`). On top of the shared header, File System adds a `..` folder-style entry (shown only when not at the filesystem or drive root) whose double-click climbs to the parent directory; the selector uses the hierarchy icon. The `..` row exists only in this mode; Workspace Root is unaffected and double-click does nothing. If the current root is deleted from under the explorer, it silently relocates to the nearest existing ancestor (climbing the path and `fs_stat`-ing each candidate) instead of showing an error state. The JSON-only preference `keepFolderLayoutOnChangeExplorerRoot` (default `false`) controls whether the per-root expansion layout is restored on a root change or the tree starts collapsed.
- **Workspace Root**: root is a folder fixed via the "Set as workspace root" folder context action (stored as `workspaceRoot` in the workspace body file `workspaces/<id>.json`). The selector disables this option (showing "Set a new workspace root in the explorer" or "Folder not found") when no folder is set or the saved one no longer exists. If the folder is deleted while it is being shown, the explorer falls back to an informational empty state instead of a raw filesystem error.

The selection logic is the pure `resolveExplorerRoot` (`modules/workspaces/lib/explorerRoot.ts`, tested). The previous per-editor root override was removed: opening a file no longer changes the explorer root.

**Sidebar-driving panel (autofocus).** One panel at a time drives both the Explorer root and the Source Control / Git History repo. Anchoring happens via two explicit gestures only -- never automatically on every focus change or cwd update:

- **F4** (`tab.focusOnExplorer`) always anchors: it applies the cascade (see below), opens the sidebar if closed, and switches away from Git History to Explorer if needed (it stays on Explorer or Source Control otherwise).
- **Per-panel autofocus flag** -- toggled from the tab right-click context menu (crosshair icon shown on the tab when active). When an autofocus panel gains focus (or, for a terminal, its cwd changes while focused), it anchors silently: the same cascade runs, but the panel is never opened and the active sidebar tab is never changed.

Autofocus is **data-driven**, not an enumerated kind list: `isAutofocusTab` (`lib/types.ts`) is true for any panel that resolves to a filesystem location -- the terminal cwd, or any kind carrying a `path` (editor, markdown, git-diff, git-commit-file). Only `browser` (a web URL) and `git-history` (a commit list, no single file) lack it, so a future path-bearing panel kind opts in automatically with no code change. **Lock** (prevent close) is independent and applies to **every** panel kind with no exception. Both flags live on a shared `TabCommon` base, and the markdown/editor view toggle preserves them across the conversion.

The shared cascade (`resolveSidebarTarget`, tested): given the panel's reference path (a terminal's folder or an editor / git-diff file), if the workspace root **itself belongs to a git repo** (`workspaceGitRoot`) and a *different* git repo nested strictly inside the workspace root owns that path, it sets File System rooted at the nested repo (so a worktree or sub-repo under a project workspace is shown, not the parent). This re-root is gated on the workspace root being a repo on purpose: a non-repo container workspace (e.g. `~/Work` holding several independent project repos) stays in Workspace Root mode when you focus a file inside one of its projects, so navigating never drops the wider view. Otherwise: if the path is under the workspace root it sets Workspace Root mode; else if it is under a git repo it sets File System rooted at the git root; else it sets File System rooted at the common ancestor of the current fs root and the path (falling back to `dirname`). The nested git repo is resolved from the focused path via `git_resolve_repo` (which accepts a file path, resolving from its parent directory, so editor tabs anchor too); the workspace root's own repo is resolved once per root in `App.tsx` and passed in as `workspaceGitRoot`, not recomputed on every focus. Source Control and Git History resolve their repo from the resulting explorer root (`useSourceControl`); that resolution is keyed on the exact context path (`canReuseResolvedRepo`, tested), never on a path prefix, so anchoring into a nested repo/worktree re-resolves to it instead of reusing the parent. The `autofocus` flag is persisted per panel in `workspace-state.json`. The global `autofocusMode` preference (Settings > General: `manual` or `always`) decides how the flag is used: in `manual` the boolean `autofocusNewTabs` (a checkbox shown only in that mode) seeds the flag on tabs created from then on, and `always` makes every capable tab drive the sidebar (`isAutofocusActive`) while hiding the per-tab toggle, the tab crosshair and the explorer focus button; the stored flags are left untouched so they apply again when the mode is switched back. New-workspace terminals default to no autofocus; when no autofocus panel exists the sidebar root and git repo stay wherever they were last anchored.

**Focus on Explorer.** A tab context-menu action and `F4` shortcut reveals the tab's file (editor / markdown / git-diff / git-commit-file) or, for terminal tabs, its current folder, in the tree. If the active view already contains the target it is just expanded and selected; otherwise the explorer switches to File System rooted at the deepest common ancestor of the reference fs root and the target (falling back to the target's parent dir when there is none). Unlike the removed automatic per-editor override, this is an explicit user action. The decision is the pure `resolveFocusTarget` (same file, tested); revealing is driven by a `revealRequest` prop on `FileExplorer` that re-runs as the tree reloads asynchronously, expanding each ancestor until the target loads, then selecting and scrolling to it without taking focus from the editor. A reveal triggered from a path-bar click or shortcut opens the sidebar if it is closed and switches to Explorer from **any** other view (Git or History), not just History. `applyRevealTarget` holds the reveal (`"pending"`, no consume) until the explorer is the active/visible tab and re-runs once it is, so the select-and-scroll lands on the first request instead of firing off-screen while the panel is opening or on another tab. Switching the active tab no longer selects that tab's file in the explorer (the old `activeFilePath` sync was removed); selection happens only on an explicit reveal. A reveal skips its flash when the target is already the selected row, so opening an already-open file from the sidebar (which selects it on click) does not produce a circular flash.

**Attention flash.** A shared `FlashOverlay` (`src/components/FlashOverlay.tsx`) renders a `key`-remounted overlay span that pulses the primary color over its `relative` parent; bumping the `key` token replays the CSS animation (`terax-flash`, `styles/globals.css`) with no effects, rAF or className mutation, so it survives React strict-mode double-mounts and virtualizer re-renders. Two variants: `fill` (tints the element) and `ring` (outlines the border, reusing the center drop indicator's `ring-2 ring-inset ring-primary/60 rounded-md`). Used by: the revealed explorer row (fill), the explorer root row when a focus re-roots the tree (fill), the locked-tab lock icon on a blocked Cmd+W (fill, `lockFlashStore`), and the whole pane border when activating an already-open file's tab (ring, `tabFlashStore`, isolated in `PaneFlashBorder` so the memoized `PaneView` is not re-rendered). The animation is a single pulse and is intentionally kept under `prefers-reduced-motion` since it animates opacity only.

**Drag to open.** Files (not directories) can be dragged from the explorer and dropped onto any pane drop zone or between tabs to open them as permanent editor tabs. Dropping on a directional zone (top/bottom/left/right) splits the target pane and opens the file in the new sub-pane. The drag experience is visually identical to dragging tabs between panes. See `WorkspaceDndProvider.tsx`.

**Drag to move.** Dragging a file or folder onto another folder row moves it there (`fs_rename`). Built on the same `@dnd-kit` context as drag-to-open (not a second pointer system): folder rows are `useDroppable` (`explorer-dir:<path>`), folders drag as `dir:<path>` (move only, ignored by the pane-open handler), files as `file:<path>` (openable in a pane *and* movable). The move is committed by `useDndMonitor` in `FileExplorer` calling `tree.movePath`; the drop target is only registered for valid destinations (not self, current parent, or a descendant) and `movePath` additionally refuses name clashes. Hovering a collapsed folder for 700ms springs it open.

**Drop files from the OS.** Dragging files/folders from Finder/Explorer onto an explorer folder copies them in (`fs_copy`, recursive, refuses to overwrite). Uses Tauri's native drag-drop (`onDragDropEvent`), one webview listener that hit-tests by `data-fs-path` / `data-explorer-drop`. It coexists with the terminal's own OS-drop listener (`useTerminalFileDrop`, which hit-tests `data-pane-leaf`): both receive every event but each acts only on its own DOM region, so they never steal each other's drops.

**Add to .gitignore.** A file/folder context action, shown only inside a git repo (`gitRootPath != null`). It appends an anchored entry (`/<relPath>`, trailing slash for folders) to the repo-root `.gitignore`, idempotently. The non-obvious part is collision with an already-open editor: if `.gitignore` is open in a panel, the buffer is the source of truth, so the line is inserted into the CodeMirror buffer (`EditorPaneHandle.insertAtEnd`) and the tab goes dirty like any edit, never touching disk (so unsaved edits are never clobbered and autosave is irrelevant); otherwise it reads/appends/writes on disk and reveals the file. Pure logic in `modules/explorer/lib/gitignore.ts` (tested); orchestrated in `App.tsx` (`handleAddToGitignore`).

**Git decorations.** Optional (Settings > General > Explorer, **off by default**). Tints each file name by git status (modified/added/deleted/renamed/untracked) and dims gitignored entries; collapsed folders bubble up the highest-priority status of their children. The data rides the always-resident Source Control snapshot (no extra git IPC or watcher); the only backend cost is a `max_depth(1)` `WalkBuilder` per directory read, and only when the flag is on (gated to a real git repo so it never trips macOS folder-access prompts outside one). Pure logic in `lib/gitStatusUtils.ts` (tested); colors in `lib/gitStatusColor.ts`.

### 3.4 Source control

**Git status and staging.** The source control panel shows modified, staged, untracked, and conflicted files. You can stage / unstage individual files or hunks. The diff view uses the CodeMirror merge extension. Git diffs render unified (inline `unifiedMergeView`) or split (side-by-side `MergeView`), controlled by the global `diffViewMode` preference (Settings -> Editor). Split mode mounts a `MergeView` class outside the `<CodeMirror>` wrapper because it is not an extension. Wrap and line numbers in diffs reuse the per-extension `editorViewByExt` config, edited from the diff bar's `[...]` dropdown.

**Commit.** Type a commit message and commit with `Cmd+Enter` / `Ctrl+Enter`. No separate terminal command needed. A **Push** checkbox next to the Commit button, when checked, pushes to the remote right after a successful commit (the button label switches to "Commit & Push"). Both the draft commit message and the Push flag are git settings stored **per workspace** under the `git` section of `workspaces/<id>.json` (`{ commitMessage, pushOnCommit }`), so each workspace keeps its own in-progress message. The message edits live in panel-local state and are persisted to the workspace on a short debounce (and flushed on workspace switch and after a successful commit) to avoid re-rendering the app on every keystroke.

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

The Unix socket (`kex-ipc-{pid}-{pty_id}.sock`, path in `KEX_IPC`; the Kex process pid in the name keeps the installed and dev instances, which share the directory and both number PTYs from 1, from stealing each other's socket; sockets of dead pids are swept the first time a path is built) is created before the child process starts in `session::spawn()` and cleaned up on PTY close. It lives under `XDG_RUNTIME_DIR` when available, otherwise under an owner-only (0700) per-uid directory Kex creates itself in the system temp dir rather than directly in that shared, world-writable location, and the socket file itself is forced to 0600, so another local user cannot pre-create the path or connect to it. Claude Code hooks send raw JSON payloads to it; `pty/ipc.rs` dispatches them to Tauri events consumed by the frontend.

**Notification bell scoping.** Each main window runs its own React runtime with its own Zustand store. `kex:agent-signal` is broadcast globally, but `leafIdForPty()` is window-local, so each window's `AgentNotificationsBridge` only processes signals from PTYs that belong to it. The bell in each window shows only that window's agents.

**OS notification deep-link.** When the app is unfocused and the frontend decides to send an OS notification, it first calls `agent_queue_nav` to register `{ windowLabel, workspaceId, tabId }` in `PendingNavState` (Rust, TTL 5 s). On any subsequent `WindowEvent::Focused(true)` for a main window, Rust consumes the pending target, focuses the correct window, and emits `kex:activate-tab` to it. Each window listens for that event and calls `onActivateAgent`, which switches the workspace, activates the tab, and focuses the terminal (50 ms delay for React state to settle). See IPC.md for the full protocol detail.

**Agents in the WorkspaceBar.** In the wide bar (above 80px) each workspace shows, after its name, a dimmed count of its active agents (working, waiting or in error; `buildAgentEntries` already derives them, idle agents do not count), whatever the setting. One box in Settings > Workspaces decides what the expand arrow of each workspace lists (everything by default); with nothing included (`hasDetail` false) there is no arrow and the count is all the bar adds. `workspaceDetailTerminalsEnabled` ("Include terminals") turns terminals on, and nested under it `workspaceDetailTerminals` (`all`, `agents`, `active-agents`) picks which ones; `useDetailFilter` folds both into `DetailFilter.terminals`, where `none` means terminals off. Three independent checkboxes add other kinds: `workspaceDetailEditors` (editor and markdown tabs), `workspaceDetailBrowsers` and `workspaceDetailGit` (git-diff, git-history, git-commit-file). The arrow state is per workspace (`Workspace.detailExpanded`, persisted with the workspace body). `workspaceDetailRows` (`workspaces/lib/workspaceDetail.ts`) is the pure selection: tab order, except with `active-agents`, where the agents come first in the urgency order of the entries and the other included tabs follow. Each nested row (`WorkspaceDetailList.tsx`) reuses `useAgentTabTitle`, so its title is the one the tab bar shows; rows always start with an icon (the agent icon for agents, the tab bar icon for the rest) and end with a spinner (working), an amber dot (waiting) or a red dot (error). In the active workspace only, the row of its focused tab (`focusedTabId` of the active pane) gets a stronger background, full-color text and `aria-current`. Clicking a row goes through `onActivateAgent`, like the bell. Right-clicking a row opens the same menu as the pane tab (`TabContextMenuItems`), without the New Terminal / New Browser entries. The row does not know its pane, so `SidebarTabMenuContext` hands it one never-changing object (it reads the latest workspaces through refs, which keeps the memoized list from re-rendering) keyed by tab id: Close Other Tabs and Close All Tabs resolve the pane that holds the tab in the `paneTree` and close its tabs through the same close queue and the same `isBulkClosable` rule as the pane menu (`bulkClosableIds` / `otherBulkClosableIds`). Rename from a row starts the rename with origin `sidebar`, so the field opens anchored to the row (`TabRenamePopover`) instead of on a pane tab that may be hidden. Each row menu is also closed by `contextMenuCloseStore`, like the workspace menus, when the `tab.rename` shortcut starts a rename. An empty list renders nothing. The compact bar shows neither the count nor the list.

### 3.7a Agent session restore

When an agent session is running at the time Kex closes, Kex offers to resume it automatically on the next launch. The tab showing a restored session displays `agentname · dirname` as its title, a `✦` icon, and a status indicator (spinner while working, amber dot while waiting for input, nothing when idle). If the resume command fails (missing transcript, deleted directory), the icon becomes `⚠` and the title turns red.

Hooks must be installed via "Set up Claude Code" (notification bell popover) for this feature to work. See `docs/AGENT_SESSION_RESTORE.md` for the complete design and edge cases.

### 3.7 Web preview

**Auto-detected dev server.** When a localhost URL is detected in the terminal output (e.g., `http://localhost:5173`), a pill appears in the status bar offering to open a preview tab. The preview tab renders the URL in a native child webview — not an iframe inside the main webview.

**Image and PDF viewers.** The preview pane also handles images and PDFs opened from the file explorer.

**Sandboxed.** The preview runs in its own webview context. It cannot communicate with the Kex app surface.

### 3.8 Themes and customization

**App theme.** The theme engine writes CSS custom properties to the document root. All UI components consume the theme through those variables. There are 10 built-in app themes: Kex Default, Nord, Tide, Catppuccin, Tokyo Night, Caffeine, Claude, Gruvbox, Sage, Rose Pine.

**Faithful palettes, readable text.** The palette files of the built-in themes keep the original values of the project they come from (Kanagawa, Everforest, Nord, ...). `applyTheme` runs `withReadableText` (`readableColors.ts`) over the built-in ones only: it nudges `mutedForeground`, `primaryForeground` and `sidebarPrimaryForeground` toward black or white, as little as needed, until they reach 4.5:1 contrast. Themes created by the user are applied untouched. The unselected workspace chip in the WorkspaceBar is a translucent `foreground` overlay rather than `muted`, so it stays visible in every palette; a selected, colored workspace always carries white text, and `chipColorOnWhite` (`workspaces/lib/workspaceColor.ts`) darkens its color just enough for white to reach 4.5:1, keeping the hue.

**Theme editor.** You can create and edit themes in-app. Changes are live-previewed. Custom themes are persisted to the settings store and can be exported as JSON files to share.

**Editor and terminal surfaces have their own colors.** A theme variant may carry `editor: { background, foreground }`, written by `applyTheme` as `--editor-background` and `--editor-foreground` (defaults in `globals.css` fall back to `--background` and `--foreground`, so themes without it look as before). The CodeMirror editors (code, markdown Source and Rich), the markdown preview and the editor path bar paint `--editor-background`; the terminal pane and its path bar paint `--terminal-background`. `resolveEditorSurface` (`modules/theme/resolveEditorSurface.ts`, pure) picks the surface: with the editor theme on Auto it is the app theme's own `editor`; with an explicit editor theme it is that CodeMirror theme's own background and text color, read once from a hidden view (`editor/lib/editorThemeSurface.ts`, loaded lazily only when the preference is explicit). The Settings sample follows the same rule. A borrowed terminal palette whose theme leaves out background, foreground, cursor, cursor accent or selection takes them from that theme's own UI colors and, if the variant defines none either, from fixed values of the variant's own mode (`MODE_DEFAULTS` in `resolveTerminalTheme.ts`), never from the active app theme: a dark palette lent to light mode keeps light text and cursor.

**Light terminals lift low-contrast colors.** xterm runs with `minimumContrastRatio` 4.5 in light mode and 1 in dark (`minimumContrastRatioFor`, `styles/terminalTheme.ts`), applied when a terminal is created and again on every theme or mode change. Programs choose colors for a dark terminal (white, light yellow), which are unreadable on a light background; dark mode keeps the palette exactly as the theme defines it.

**Terminal theme is independent.** The `terminalTheme` preference (`settings-general.json`) is `"auto"` (default: the active app theme's own terminal palette) or the id of any built-in or custom app theme (optionally pinned to a mode as `id@dark` or `id@light`, so a dark palette can run under a light app theme; `parseTerminalPref`/`formatTerminalPref`), whose terminal palette (16 ANSI, background, foreground, cursor, selection) is borrowed without duplicating its values. `resolveTerminalPalette` (`modules/theme/resolveTerminalTheme.ts`, pure) picks the palette and falls back to the app theme's when the id is unknown or that theme has no palette at all; every built-in theme defines its own terminal palette (16 ANSI colors) and a paired editor theme in both modes, with the same brightness as the mode, locked by `themes/themes.test.ts`; only a user theme with a palette in a single mode lends it to the other mode; `ThemeProvider` passes the result to `applyTheme`, which writes the `--terminal-*` variables, so only the terminal changes. `inactivePaneDim` still comes from the app theme (it is a black overlay, independent of the terminal background). Settings > Themes is one table (`settings/components/ThemeTable.tsx`): a row per app theme with three columns, theme, editor and terminal, and a single Auto checkbox in the Theme header. Auto is the `themeAuto` preference (default on, `settings-general.json`): while it is on, picking another app theme resets the editor and terminal preferences to `auto`, so they follow it; the editor and terminal cells stay clickable either way and picking one never turns Auto off, it only holds until the next app theme change. Turning Auto on resets both to `auto` at once. A selected cell gets an outline, and adjacent selected cells of a row join into one outline. Three fixed previews (interface, editor, terminal) sit above the rows, and an eye icon on each editor or terminal cell opens a larger preview (a lazy read-only CodeMirror sample for the editor) in a popover. What each theme uses, and whether another theme shares it, comes from the pure `themeSurfaceInfo` (`modules/theme/themeSurfaceInfo.ts`); A theme that has a different editor theme or terminal palette in each mode (`surfaceModes`) shows a sun or moon button next to the eye of that cell to view and pick the variant of the other mode, which is how a dark editor or terminal is used under a light app theme. The button exists only on the selected cell, which always shows the variant it is really using; every other cell always shows the variant of the app mode, so selecting another cell, or changing the app mode, puts the rest back in line without changing what is selected. `unpairedEditorThemes` lists the editor themes no app theme pairs in any mode, shown as "Editor only" rows in both modes so they stay selectable. Terminal palettes that are not an app theme live in `listTerminalOnlyThemes()` (`themes/index.ts`, kept out of the built-in list so they never appear as app themes; today `ghostty-default-style`, Ghostty's Default Style Dark plus a light variant derived from it, locked by `themes/themes.test.ts`): `ThemeProvider`, `ThemeTable` and the preview page add them to the terminal catalog, and the table lists them under "Terminal only" with the same mode toggle. Known limitation: xterm's minimum contrast still follows the app mode, not the pinned palette (TASK-785).

**Editor theme is independent.** The editor theme is a separate setting from the app theme. You can have a Catppuccin app theme with a GitHub Light editor theme.

**Terminal palette follows app theme.** The xterm.js ANSI color palette (colors 0-15) is derived from the active app theme, so the terminal colors are consistent with the UI.

### 3.9 Command palette

`Cmd+K` / `Ctrl+K` opens the command palette. It supports multiple modes (file finder, command runner, content search) distinguished by a prefix character. Fuzzy matching. Results are ranked by recency (MRU).

### 3.10 Settings

Settings open in a separate window (not a panel in the main window). Deep-linking is supported — `openSettingsWindow("shortcuts")` opens directly to the Shortcuts section. The settings window is `always_on_top` relative to the main window.

Navigation is a left vertical sidebar. Sections: General, Workspaces, Editor, Terminal, Appearance, Themes, Shortcuts, About. General holds tabs, explorer, agents, and startup; Workspaces holds the global workspace status list (see below); Editor and Terminal each own their font, behavior, and cursor settings; Appearance holds zoom and Git file colors; Themes holds the color mode, theme picker, and editor (syntax) theme. The sidebar dock side is no longer a global setting: it is per-window state (see below) flipped from each window's header toggle, since the standalone Settings window cannot target a specific main window.

**Workspace statuses.** A global ordered list of named statuses (`WorkspaceStatus[]`, persisted in `settings-general.json` as `workspaceStatuses`). Each status has an immutable `id` (prefix `st-`, generated with `newStatusId()`) and a user-editable `label`. Defaults: Archived, Work in progress, On hold, Canceled, Completed. Managed in Settings > Workspaces via a drag-to-reorder, inline-rename, delete list. Each workspace can be assigned one status via a pill selector in its Properties dialog (Workspace Settings > Properties). The sidebar groups workspaces by status: workspaces with no status appear at the top; each status group with at least one member appears below, separated by a text label (expanded sidebar) or a thin divider (compact mode). Drag-and-drop in the sidebar is multi-container: dragging a workspace into a different group reassigns its status and repositions it. Groups that already have workspaces are not whole-group drop targets; only their items are, so a drag into such a group is just a drop between two workspaces. Statuses with no workspaces (and the no-status group when it is empty) are unreachable that way, so while a drag is active they appear as thin header drop targets rendered at the very end of the list (a "No status" header clears the status). Appending them at the end of the scrollable list keeps the existing items from shifting, so the drag overlay stays aligned with the pointer; these zones assign their status only on drop (reassigning mid-drag would fill the group and yank its header out from under the pointer). A custom collision strategy (`pointerWithin`, items first, group zones second) keeps in-group reordering precise while still letting the empty-group zones catch drops. The group list itself is a vertical scroll container (`flex-1 overflow-y-auto`, `thin-scrollbar`) with the "new workspace" button pinned below it, so many workspaces or many status groups scroll instead of overflowing the window (dnd-kit auto-scrolls the container while dragging). Workspaces whose `statusId` no longer matches a valid status are normalized to no-status on preferences hydration. Both the sidebar grouping and keyboard navigation derive their order from the pure helpers in `modules/workspaces/lib/workspaceOrder.ts` (`groupWorkspaces`, `groupWorkspacesForDrag`, `visibleWorkspaceOrder`), the single source of truth for visual order. A new workspace (`addWorkspace`, via `insertWorkspaceAfterActive`) is inserted right after the active one in the state array and inherits its `statusId`, so it lands immediately below the active workspace within the same status group (filtering preserves array order, so array adjacency equals in-group adjacency).

**State granularity (global vs per-window vs per-workspace).** Three tiers:

- **Global preferences** (`settings-general.json`, shared by every window): fonts, cursors, themes, behavior toggles, etc. Edited from the Settings window and surfaced live via `onPreferencesChange`.
- **Per-window sidebar chrome**: whether the sidebar is `open`, its `view` (`"explorer"` / `"git"` / `"history"` / `"notes"`), its `width` (a react-resizable-panels percentage), and its `side` (`"left"` / `"right"`). Held as React state by `useSidebarState(label)` (`modules/workspaces/lib/useSidebarState.ts`), seeded from the restored `WindowEntry.sidebar` and persisted per window through the lightweight `window_save_sidebar` command (debounced, index-only write). It is a property of the window, shared by all of that window's workspace tabs. Validation/defaults live in `sidebarState.ts` (`open=true`, `view="explorer"`, `width=20`, `side="left"`; invalid `view`/`side` fall back to `"explorer"`/`"left"`; `width` clamped 12..70).
- **Per-workspace explorer state**: `explorerRootMode` / `fsRoot` and `showHidden` (show dot-files), each remembered per workspace because every workspace points at a different project. They ride inside the workspace body via the existing `saveWorkspaceState` / `sanitizeWorkspace` path; no dedicated IPC. `showHidden` moved here from a former global preference.

### 3.11 External tools

The header bar exposes an "Open in editor" button that opens the active file (or workspace root) in an external editor or terminal. The system is composed of a Rust detection backend, a frontend catalog, and a settings UI.

**Catalog.** Both the Rust backend (`src-tauri/src/modules/editors/catalog.rs`) and the TypeScript frontend (`src/modules/external-editors/catalog.ts`) maintain a parallel list of known tools. Each entry carries:
- A stable `id` (used as the icon filename key and in preferences)
- A macOS bundle ID for `mdfind` detection
- A CLI binary name for `which`/`where` PATH lookup
- `args_before_path`: arguments injected between the binary and the target path at launch time (e.g. `--working-directory` for Ghostty/Alacritty, `--directory` for Kitty)
- `macos_app_name`: JetBrains `open -na <App>.app` fallback

The frontend catalog additionally carries `group` and `type` metadata used by the settings UI. Groups: `VS Code`, `JetBrains`, `Text Editors`, `Terminals`, `Other IDEs`. Target type:
- `"file"`: the tool receives the path of the currently open file (VS Code family, text editors)
- `"workspace"`: the tool receives the workspace root directory (JetBrains, terminals, Xcode)

**Detection (Rust).** `detect_all()` in `detect.rs` iterates the catalog and resolves each entry per platform:
- **macOS**: `mdfind kMDItemCFBundleIdentifier == "<id>"` locates the `.app`; on failure, falls back to `which`. Resolution order: `open -b` for open-only editors (BBEdit, CotEditor, TextMate, CodeRunner), Zed CLI inside the bundle, JetBrains Toolbox script or `open -na`, then general case (PATH binary with `args_before_path`, or `open -a`).
- **Linux/Windows**: Toolbox script or `which`/`where` binary lookup.
- The result is a `DetectedEditor` with the resolved binary and `args_before_path` ready for process spawn.

**Header button.** `OpenInEditorButton` (`src/modules/external-editors/OpenInEditorButton.tsx`) shows the preferred editor and a dropdown of all enabled editors. It receives both the panel-specific `target` (a file path) and the `workspaceRoot`. At click time `resolveEffectiveTarget` picks:
- `workspaceRoot` if the editor's type is `"workspace"` (resolved from the catalog or from `CustomEditor.targetKind`)
- `target` otherwise (the current open file)

The button label shows the filename for file-type editors and the workspace root folder name for workspace-type editors, so the user always sees what will be opened.

**Custom tools.** Users can add arbitrary editors in Settings > Tools. Each custom entry stores `name`, `binary`, `argsBeforePath`, and an optional `targetKind` (`"file"` or `"workspace"`, default `"file"` for backward compatibility). The type is user-selectable from a dropdown in the settings table.

**Settings UI.** `ExternalEditorsSection` (`src/settings/sections/ExternalEditorsSection.tsx`) groups predefined tools by family. Within each group, installed (detected) entries appear first with an enable/disable toggle; not-installed entries are dimmed and shown at the bottom of their group with no toggle. Custom tools appear in a separate table below with column headers (Name / Binary / Opens / Args) aligned via a shared CSS grid constant.

**Icons.** `EditorIcon` (`src/modules/external-editors/EditorIcon.tsx`) tries `/assets/editors/<id>.svg` first, then `/assets/editors/<id>.png`, then falls back to a generic document-code icon from HugeIcons.

---

## 4. Technical decisions with user-visible effects

### 4.1 Tabs are never unmounted

When you switch tabs or panes, the outgoing tab is hidden with CSS classes. It is never unmounted from the React tree. This means:

- PTY sessions keep streaming in the background. A running `npm run dev` in one panel continues while you work in another.
- Tab state (scroll position, xterm buffer, editor content, unsaved changes) is preserved exactly as you left it.
- Memory usage is proportional to the total number of open tabs across all workspaces and panes. Each terminal tab holds a live xterm instance; each editor tab holds CodeMirror state. There is no sleep mechanism for idle tabs.

### 4.2 Tab close confirmation

Every close path (tab close button, the close shortcut, and Close All / Close Other Tabs) runs through one sequential queue, `closeTabs(tabIds)` in `useTabCloseGuards`. The pure core (`hooks/closeQueue.ts`) closes tabs one at a time: a terminal with a live foreground process or a dirty editor pauses the queue on a confirmation dialog, and a cancel stops the whole run before closing the current tab. Terminals only prompt when the `warnOnCloseTabWithRunningProcess` preference is on (default on); the terminal dialog's "Don't ask me again" checkbox flips that preference off. The editor dialog offers Save / Don't save / Cancel; Save writes through the editor handle before closing, and a failed write stops the queue without losing the buffer. After any run, focus returns to the active tab's terminal or editor.

### 4.3 Workspace authorization

Before any git or shell command can run against a directory, that directory must be in the `WorkspaceRegistry`. The registry is populated automatically when you open Kex in a directory (via CLI argument or the OS file manager context menu), and when you explicitly navigate to one via the terminal (`cd` triggers an OSC 7 event that registers the new cwd). `workspace_authorize` is the IPC command for explicit authorization.

The registry lives in memory only — it does not persist across restarts. Each session builds it up as the user navigates.

The practical effect: if you try a git operation in a directory you haven't navigated to in the terminal yet, the git-related features (diff decorations, source control panel) will fail with "path is outside the authorized workspace" until you `cd` there in a terminal first.

**Subdirectory cwd and git repo root.** When the terminal cwd is a subdirectory of a git repo (e.g., cwd is `/proj/src`, git root is `/proj`), `resolve_repo_in_authorized` and `panel_snapshot` deliberately do NOT add the repo root to the registry -- doing so would silently escalate the authorization scope to the parent and grant access to sibling directories the user never navigated to. Instead, git commands use `has_child_authorized`: a repo root is considered authorized for git operations if any currently-authorized path is strictly under it. This keeps the registry tight while allowing the SCM panel and all git commands to work correctly from a subdirectory.

**`fs_*` commands are not workspace-gated.** File read/write commands (`fs_read_file`, `fs_write_file`, `fs_stat`, `fs_create_*`, `fs_rename`, `fs_delete`, `fs_read_dir`, `fs_search`, `fs_grep`, etc.) accept any path the OS allows. This is a deliberate decision: the explorer only surfaces paths the user has explicitly navigated to, so there is no app-level vector for a user to accidentally open a path outside their workspace. Terminal commands can access arbitrary paths regardless of any app-level guard, so a gate here would only stop the app's own UI — not a shell running inside a pane. A deny-list for secret paths (`.ssh`, `.env`, `*.pem`, etc.) would be worthwhile if Kex ever runs autonomous agents that make IPC calls directly; the right insertion point is `guard_read`/`guard_write` helpers at the top of `fs/file.rs`, applied before `resolve_path`. Until then, `capabilities/default.json` is the real boundary: only code in the webview bundle can call these commands.

### 4.3 Windows: ConPTY spawn serialization

On Windows, opening a new terminal tab serializes through a `SPAWN_LOCK` mutex. Concurrent ConPTY open calls leave one of the resulting PTYs with a stalled output pipe. This means: if you open several tabs very quickly on Windows, the tabs open in sequence rather than in parallel. The delay is typically under 200ms per tab and is only perceptible during rapid tab creation.

### 4.4 Windows: Job Objects for process cleanup

Every ConPTY child process on Windows is assigned to a Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. When the Job handle is released (Kex closes, crashes, or is killed), the OS terminates the entire process subtree of that shell session. Without this, `npm run dev` started inside a PowerShell terminal would continue running after Kex exits, as `TerminateProcess` only kills the immediate child.

Closing a tab from the UI (the explicit close button) also kills the immediate child. The Job Object handles the "Kex process died unexpectedly" case.

### 4.5 OSC trust model

Kex's shell integration emits and parses OSC 7 (cwd), OSC 133 (prompt/command boundaries), and OSC 0/2 (window/icon title). The cwd from OSC 7 updates the explorer root. OSC 0/2 title is written to `oscTitleStore` (in-memory, not persisted) and shown in the pane tab. This means a malicious command outputting a crafted OSC sequence could theoretically spoof the displayed cwd or tab title. The shell integration scripts are trusted; arbitrary terminal output from untrusted remote connections (SSH to untrusted hosts) is a trust boundary to be aware of.

**Tab title priority, non-agent tabs** (highest to lowest, `tabTitle()` in `src/modules/workspaces/lib/tabTitle.tsx`):

1. `panel.title` — explicit user rename, always wins.
2. `runningCommand` — basename of the foreground command from OSC 133 C (e.g., `cargo`, `git`).
3. `oscTitle` — value from `oscTitleStore`, set by OSC 0/2 emitted by the running program.
4. cwd-derived — last two path segments, truncated from the left so the deepest directory stays visible.

**Tab title priority, agent tabs** (`agentAwareTabTitle()` in the same file, used whenever `hasAgent` is true):

1. `panel.title` — explicit user rename, always wins.
2. `oscTitle` — Claude Code uses OSC 0/2 to propagate its AI-generated conversation title (`ai-title` field in the session JSONL); it emits `✳ Claude Code` on startup and `✳ <ai-title>` once the title is generated. Spinner frames (`⠂ Claude Code`, `⠐ Claude Code`) also arrive but are transient and do not replace a previously stable title because they change before the next render cycle. `runningCommand` is deliberately skipped for agent tabs: the shell reports the foreground command as literally `claude ...`, which would otherwise mask the live OSC title with just the agent's binary name.
3. `agentSession.meta.sessionTitle` — set once by Claude Code's `SessionStart` hook payload, often empty, never updated afterwards. Used only as a placeholder before the first `oscTitle` arrives.
4. `${agent} · ${dirname}` — last directory segment of cwd, falling back to the non-agent `tabTitle()` result if `dirname` is empty.

Both the tab bar (`PaneTabBar`) and the header (`WorkspaceTitle`) render this same value through the shared hook `useAgentTabTitle()` (`src/modules/workspaces/lib/useAgentTabTitle.ts`), so they cannot diverge. See `docs/WORKSPACES_GOTCHAS.md` Bug 9 for the investigation that led here (the header used to show only the agent name because it called the non-agent `tabTitle()` directly).

**Tab notes.** Any tab can carry a markdown note (`TabCommon.note`, persisted with the tab, no migration) that floats over its pane. The `tab.note` shortcut (Cmd+B by default) toggles it for the active tab: with no note it creates an empty one, open and focused (`tabNoteStore.focusTabId`, so switching to a tab that already has its note open never steals focus); with a hidden note it opens it; with an open note it hides it, and hiding a blank note drops `note`, `noteOpen` and `notePos` (pure `toggleTabNote` in `lib/tabNote.ts`). `noteOpen` is persisted too. The note is drawn by `FloatingTabNote` as an overlay rendered from `PaneView` inside the pane root (not in the tab bar, which scrolls horizontally), only for the pane's active tab, and it is edited in place with `CodeMirrorEditor` in Rich mode (Live Preview, `maxHeight` so it sizes to its content), lazy-loaded; typing stays in the editor and is written to the tab with `setTabNoteText` on a 300 ms debounce, because a workspaces state update per key re-renders the whole app; the editor is seeded once with the note text, and `flushTabNote(tabId)` (`tabNoteStore.ts`) forces the write before anything reads `tab.note` (the `tab.note` shortcut, blur, the close button, unmount). Its position is relative to the pane and always clamped (`lib/notePlacement.ts`): with no `notePos` it sits just under the tab bar aligned with its tab, so it follows tab-strip scroll and reorder; once dragged by its header strip (pointer capture, local state while dragging, a single `moveTabNote` commit on pointerup, none for a click without movement) it keeps a fixed `notePos`. Its size is also user-set: a grip in the bottom-right corner (same pointer-capture pattern, local state while resizing, a single `resizeTabNote` commit on pointerup that also makes the note sticky) stores `TabCommon.noteSize`, clamped by `clampNoteSize` to a minimum and to the pane's right and bottom edges from the note's top-left; with no `noteSize` the note keeps the default width and content-sized height, and a docked note of an inactive tab ignores it. Measurements are refreshed from `ResizeObserver` (pane and note), the tab strip's scroll event and the tab id list, never per frame. The overlay root is `pointer-events-none`; the note carries `data-tab-note`, which `PaneView`'s mousedown capture ignores so clicking in the note does not refocus the terminal. The rename popover (`tab.rename`) edits only the title; a second press saves and closes it (`resolveRenameShortcut`, `requestSave`/`saveSeq`). Notes have two modes. A sticky note is the persisted `noteOpen` one of the active tab: it has a close button (`hideTabNote`: hides it, or drops it when blank) and stays until closed or toggled with the shortcut. Hovering the tab icon shows a transient hover note (`useNotePreview` in `lib/useNotePreview.ts`, owned by `PaneView`) even when the note is closed or its tab inactive; it has no close button and goes away by itself: when the pointer leaves the icon and the note (delayed so the pointer can reach it, and held while the editor has focus) or as soon as the editor loses focus, whatever was typed being kept. On the active tab it appears at its usual place and can be dragged, which makes it sticky (`moveTabNote` sets `noteOpen`); on another tab it is docked under that tab, ignoring `notePos`, and cannot be dragged. A blank note that loses focus is dropped (`dropBlankTabNote`). A tab with a note shows a `StickyNote03Icon` button after its title that toggles the note; the tab context menu has Add/Show/Hide Note and Remove Note. The body of that menu lives in `TabContextMenuItems.tsx` and the rename field in `TabRenamePopover.tsx`, both shared by the pane tab and the WorkspaceBar rows; the store records where a rename was started (`RenameOrigin`: `pane` or `sidebar`) and only the matching surface opens its field. The tab menu has no New entries: they live in the menu of the `+` button at the end of each pane tab strip (`NewTabMenuButton.tsx`): a click still opens a terminal tab, resting the pointer on it for `HOVER_SWITCH_DELAY_MS` (600 ms, the pure timer `createHoverSwitch` that also drives hovering a workspace while dragging a tab) or right-clicking opens a menu with New Terminal / Browser Tab, Split Right and Split Down. The menu is a controlled `DropdownMenu` whose trigger is an inert anchor, so Radix never toggles it from the button's own events; a click, leaving the button or a drag starting (`useWorkspaceDnd().draggingItem`) cancels the pending timer, and the hover is not armed while something is being dragged. The delay is not a setting.

`oscTitleStore` (`src/modules/terminal/lib/oscTitleStore.ts`) is a module-level singleton with `useSyncExternalStore`-compatible API. It is keyed by `tabId`, is never persisted, and is cleared on session dispose and respawn. OSC 0 and OSC 2 are both handled (both set the window title per the terminal spec); the handler is registered via `registerTitleHandler` in `osc-handlers.ts` and wired in `useTerminalSession.ts` alongside the existing OSC 7 and OSC 133 handlers.

### 4.6 Forward-slash canonical paths

The frontend stores all paths in forward-slash form. OSC 7 on Windows emits `/C:/Users/foo`; Kex normalizes it to `C:/Users/foo` at parse time. `homeDir()` on Windows returns backslashes; `App.tsx` converts at the boundary. Any code consuming a path that might originate from the OS must normalize separators with `.split(/[\\/]/)`. This is documented in `AGENTS.md` and enforced in code review.

The reason: consistent string equality for path comparison (e.g., preventing the file explorer from flashing when `tab.cwd` arrives). Using two representations and forgetting to normalize in one place causes subtle bugs.

### 4.7 React 19 Strict Mode double-mount

In development (`pnpm tauri dev`), React 19's Strict Mode double-invokes `useEffect`. This means a PTY is opened and immediately closed before the real one opens. You will see `pty opened id=1` then `pty closed id=1` followed by `pty opened id=2` in dev logs. This is expected and does not happen in production builds.

### 4.8 Terminal font resolution (VS Code model)

There is no runtime font detection. `src/lib/fonts.ts` resolves the terminal font the way VS Code does: a per-platform default stack (Menlo then the bundled JetBrains Mono and Monaco on macOS, JetBrains Mono then Consolas on Windows, JetBrains Mono then Droid Sans Mono/DejaVu Sans Mono on Linux, then the bundled Symbols Nerd Font Mono, ending in `monospace`), and a free-text "Font family" setting that accepts a comma-separated list. A non-empty preference is normalized (names with spaces are quoted, required by the canvas font shorthand the WebGL atlas uses) and always prepended to the default stack, so a typo or uninstalled font can never break rendering. The browser falls back per glyph through the list, which is also how Nerd Font icons resolve when the primary font lacks them. xterm runs with `customGlyphs` (pixel-perfect box-drawing/powerline glyphs drawn by the renderer, not the font) and `rescaleOverlappingGlyphs` (VS Code defaults; Nerd Font, powerline and emoji ranges are excluded from rescaling by xterm itself). Icon coverage does not depend on installed fonts: `src/assets/fonts/SymbolsNerdFontMono-Regular.woff2` (icon-only PUA glyphs vendored from nerd-fonts v3.4.0, ~1.1 MB, MIT) is declared in `src/styles/fonts.css`, preloaded by `ensureMonoFontsLoaded()`, and sits last in every stack, so prompt icons (powerline, devicons, octicons) render out of the box and user-set fonts inherit them through the appended default stack.

Earlier approaches that were removed: auto-detecting installed Nerd Fonts via `document.fonts.check()` (false positives in WKWebView, it reports fallback-renderable rather than installed) and via `document.fonts.load()` (worked, but a curated candidate list plus a dropdown is strictly worse than VS Code's free-text stack with per-glyph fallback).

The terminal and the code editor (CodeMirror) each expose independent "Font family", "Font size", "Letter spacing" and "Line height" controls under Appearance. The editor settings are resolved through the same `resolveMonoFontFamily()` model and applied as the `--editor-font-family`, `--editor-font-size`, `--editor-letter-spacing` and `--editor-line-height` CSS variables (`useEditorFont` writes them on the document root) which the editor theme in `editor/lib/extensions.ts` reads, so a change re-renders every mounted editor without rebuilding its state. The terminal settings are pushed onto every live xterm slot from `useTerminalSession` (`applyFontSize`/`applyLetterSpacing`/`applyLineHeight` in `rendererPool.ts`). Both "Font family" fields show the platform default verbatim when unset and store an empty string for it (so the default still adapts per OS), with a reset button that clears back to it. Font size sliders are bounded to 8-18 px in 0.5 px steps (terminal sizes snap to half-pixels after the zoom multiply, see `renderFontSize`), letter spacing to -4..4 px in 0.5 px steps, and line height to 0.8..1.8 in 0.1 steps. Editor font size, like the terminal, is multiplied by the UI zoom.

### 4.9 Markdown tabs are editable by default

Opening a `.md` file mounts Live Preview, a CodeMirror 6 editor that decorates the raw markdown text in place (`modules/markdown/codemirror/`). It is the only markdown engine: the TipTap and Milkdown WYSIWYG editors, the Streamdown-only "legacy" engine and the per-tab `markdownEngine` field were removed, so there is no engine setting and no engine sealed onto a tab. A tab persisted by an older version simply ignores the unknown field. Earlier Kex versions had preview-only `markdown` tabs where editing required a `Rendered | Edit` toggle; that toggle no longer exists, its keyboard gesture is now `editor.cycleView`, which rotates the modes of the tab (see 7. Frontend module map, "Tab kinds"). `[[Note]]` wiki links are planned in `livePreview.ts` (`planWikiLink`) and resolved at draw time through the `wikiLinkHost` facet (`livePreviewPlugin.ts`), which `useWikiLinkHost` fills from an `fs_glob` of the workspace's `.md` files and the `onOpenFile` tab callback; a view without that facet (the editor-tab overlay preview) shows the label as plain text. Source and Rich share one CodeMirror view, so they keep cursor and scroll for free; Preview is a second view, so `MarkdownTab` carries the reader's place across it by hand (`lib/viewPosition.ts`, in source lines): it saves cursor and top line on the way in, shows Preview at that line, and on the way out restores them exactly if Preview was not scrolled, or puts the cursor at the top of what was read if it was.

The tab has three modes, chosen in the path bar and rotated by `editor.cycleView` (`lib/viewCycle.ts`): Source (raw text), Rich (the Live Preview decorations) and Preview (read-only `MarkdownPreviewPane`: the Live Preview extensions with no line ever active, frontmatter shown as a fenced code block, link definitions hidden and a plain click opening a link). A markdown tab registers a handle (`registerMarkdownHandle`: `save`, `cycleView`, `toggleOutline`) that the global `editor.cycleView`, `editor.save` and `markdown.toggleOutline` handlers call for the active tab, so they work whatever has focus (unlike a keydown on the tab, which is lost when Preview unmounts the editor). Source and Rich share one CodeMirror view and only toggle the decorations through a `Compartment`, so cursor, scroll and undo history survive the switch; Preview unmounts the view.

### 4.10 Buffer ownership: `useDocument`

The tab reads and writes its file through the same `useDocument` hook (`modules/editor/lib/useDocument.ts`) as a plain `editor` tab, so the CodeMirror document is the single source of truth for the text. `MarkdownTab` keeps only the text typed since the last load, tied to the `doc` it was typed against (a reload swaps `doc` and the stale edit is ignored), so Preview and Outline can read it and a remounted editor starts from it.

### 4.11 Save round-trip policy

Live Preview never converts the text: it hides and decorates syntax markers but the document is the file's bytes, so opening a note and saving it without editing writes the same bytes, and frontmatter (key order, quoting, comments) is never reformatted. `lib/frontmatter.ts` only tells the decorations where the frontmatter block ends. Autosave and the close-tab guard only write when the buffer differs from the last-saved snapshot.

---

## 5. Known limitations

### 5.1 No SSH support (yet)

SSH is on the roadmap but not yet implemented. Kex does not manage SSH connections, key agents, or remote filesystems. You can of course `ssh user@host` in a terminal tab — the PTY runs it fine — but the editor, file explorer, and git panel all operate on the local filesystem (or the WSL filesystem on Windows). See ROADMAP.md.

### 5.2 No persistent terminal layout restore

Terminal sessions are not persisted across restarts. When you close and reopen Kex, terminal tabs restart with a fresh PTY in their saved `cwd`. Shell history within the terminal is whatever your shell persists natively (`.zsh_history`, `.bash_history`, etc.).

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

### 5.7a Hibernated workspaces

`Workspace.hibernated` marks a workspace whose tabs are not mounted: its terminals have no PTY and
its editors are unmounted. The tabs stay in the persisted `paneTree` on purpose, so waking the
workspace restores the same layout and tabs. Limitations: scripts launched from the RunButton are
not relaunched on wake, unsaved editor edits are discarded, and an agent that cannot be resumed
follows the existing restore error path. Rendering details are in `docs/WORKSPACES.md`.

Startup: unless the global preference `restoreAllWorkspacesOnStartup` (Settings > Workspaces, default
off) is on, `initWorkspaceState(restoreAll)` hibernates every saved workspace of the window except the
one at the saved `activeIndex` (`applyStartupHibernation`), with no review dialog because nothing is
running yet. `main.tsx` awaits `loadPreferences()` before `initWorkspaceState` for that reason. The
preference is read at startup only, so a change applies from the next launch. Nothing is lost: the
tabs stay in the workspace JSON and each workspace comes back with Restore.

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
| Biome | `2.x` | Linter and formatter |
| vitest | `4.x` | Unit tests |

---

## 7. Frontend module map

All modules live under `src/modules/`. Each is self-contained, exports a thin barrel via `index.ts`, and owns its hooks under `lib/`. Path imports always use `@/...`; relative imports across modules are not allowed.

```
src/
├── app/
│   ├── App.tsx                    — Root coordinator, wires all modules
│   ├── components/                — WorkspaceBar, Sidebar, WorkspaceInputBar, OsIcon…
│   └── hooks/                     — useTabCloseGuards, useWorkspaceSwitcher
├── components/
│   └── ui/                        — shadcn primitives (do not hand-edit)
│   └── WindowControls.tsx         — Custom title bar buttons (Linux, Windows)
├── lib/                           — Global utils: platform, fonts, zoom, utils, native.ts
├── settings/                      — Second window (SettingsApp.tsx + sections)
├── styles/                        — globals.css, fonts.css, tokens, terminalTheme
└── modules/
    ├── terminal/                  — xterm.js stack, PTY bridge, OSC parsing (7/133/0/2), blocks, oscTitleStore.
    │   │                            `TerminalPathBar` renders as the first row of every terminal panel (h-6, mirrors
    │   │                            `EditorPathBar`). The cwd is rendered as a shared `PathBreadcrumb`
    │   │                            (`modules/workspaces/pathbar/`, fed by `buildCwdBreadcrumb`); each directory
    │   │                            segment has a right-click context menu (`DirSegmentContextMenu` /
    │   │                            `dirSegmentMenuItems`): Set as Workspace Root, New Workspace from Folder, Open in
    │   │                            Terminal, Reveal in Finder, Copy Relative/Absolute Path, Add to .gitignore.
    │   │                            The right side shows `pid / process / CPU% / RAM`. `process` is the OSC-133
    │   │                            foreground command when one is running, or the shell name at rest. An
    │   │                            agent chip (status dot + model name) appears when an agent session is active.
    │   │                            A `[...]` DropdownMenu (`TerminalPathBarMenu`) holds: the tab id and, for agent
    │   │                            sessions: session id (copy), transcript
    │   │                            path (Reveal in Finder), started elapsed, and restore error if any.
    │   │                            Metrics come from the ephemeral `terminalMetricsStore`
    │   │                            (`useSyncExternalStore`, never persisted, outside the workspaces tree). A single
    │   │                            `useTerminalMetricsSampler` hook polls `pty_metrics` every 5 s
    │   │                            (`TERMINAL_METRICS_INTERVAL_MS`) for the visible terminals of the active workspace
    │   │                            only (at most one per pane); it skips polling when the document is hidden.
    │   │                            CPU% is normalized 0..=100 across logical cores. The Rust side uses a persistent
    │   │                            `sysinfo::System` (`ProcessMonitor` in managed state) so the CPU value is a real
    │   │                            delta between samples, not an instantaneous reading.
    │   │                            The floating tab HoverCard was removed; tabs now carry only a native `title`
    │   │                            tooltip (cwd, plus agent model and sessionId when an agent is active).
    │   └── block/                 — Block overlay, shell input, mode machine, history
    ├── editor/                    — CodeMirror 6 stack, diffs. Per-extension view settings (`EditorViewSettings`: wrap, line numbers, whitespace, fold gutter, indent size 1-12, indent with tabs) are stored as `editorViewByExt` in the preferences store and resolved via `resolveEditorView` against prose defaults (wrap on, line numbers off) or code defaults (wrap off, line numbers on); both `EditorPane` and `GitDiffPane` read the same map so all three editor surfaces (file editor, markdown raw, git diff) share identical per-extension behavior. The per-extension settings are surfaced only in the editor overlay `[...]` menu. Global editor settings (scroll past end, bracket matching, close brackets, autocompletion) and cursor configuration (editor cursor blink + blink rate + style `bar`/`block`/`underline`, terminal cursor blink + style) live as top-level preferences applied via CodeMirror compartments so they update live without rebuilding editor state; the global toggles appear in both the `[...]` menu and the Settings window. A few preferences are JSON-only (no UI). In `settings-general.json`: `workspacePaneLimit`, `paneSplitLimit`,
`keepFolderLayoutOnChangeExplorerRoot`. In `settings-editor.json`: `editorHighlightActiveLine`,
`editorAutoSaveDelay`.
    ├── agents/                    — Terminal agent notifications + session restore (Claude Code, etc.)
    │   ├── components/            — NotificationBell
    │   ├── lib/                   — route, notify, agentIcon, agentSessionRestore
    │   └── store/                 — agentStore
    ├── explorer/                  — File tree, fuzzy search, icons, inline rename, internal clipboard copy/cut/paste (copy reuses the duplicate background task, cut uses `fs_rename`/`git_mv`), background duplication with progress emitted as the global event `kex:duplicate-progress` (so every app window, including Settings, can render it) and a global floating progress bar (`DuplicateProgressBar`, bottom-left) with cancel support (cancel deletes the partial copy). Quitting (Cmd+Q) while a copy is running is intercepted by Rust, which defers the exit and emits `kex:duplicate-quit-prompt` to all windows; the resulting modal offers wait, keep-open (`cancel_quit`), or cancel-copy-and-quit.
    ├── source-control/            — Git stage/commit/push panel. Supports a List/Tree view toggle (persisted as `scmViewMode` in settings); Tree mode keeps the Staged Changes / Changes roots and renders each as a directory tree with compacted single-child chains (explorer-style icons and spacing), built by the pure `scmTree.ts`.
    ├── git-history/               — Commit graph, per-file diffs
    ├── header/                    — Top bar, inline search, and the RunButton (0/1/2+ script variants).
    │                                `RunButton` (in `src/app/components/RunButton.tsx`) reads the script
    │                                running state from `terminalEphemeralStore.scriptRunning`
    │                                (`useSyncExternalStore`) and renders as a muted "Run" placeholder (0 scripts),
    │                                a simple toggle (1 script), or a split selector+play/stop button (2+ scripts).
    ├── workspaces/                — Workspace/Pane/Tab model; useWorkspaces (source of truth),
    │                                splitNode tree ops, WorkspaceView/SplitNodeView/PaneView/TabContent,
    │                                WorkspaceDndProvider (DndContext + file/tab drag handlers).
    │                                Workspace carries: color (accent color, hex or null), scripts (array of
    │                                Script entries with command, name, optional tabId, `cwdMode`
    │                                (`workspace` default | `context` | `fixed`) and `cwd` used only in `fixed` mode;
    │                                the folder is resolved by `lib/scriptCwd.ts`, and an
    │                                script tab, new or already open and idle, gets a `cd` to it before the command).
    │                                The typed line groups the whole command behind the cd: `cd -- X && { cmd\n\n}`
    │                                (posix) or `Set-Location -LiteralPath 'X'; if ($?) { cmd\n\n}` (PowerShell;
    │                                the closing brace is on its own line, after a blank one, so neither a
    │                                trailing `#` comment nor a final `\` or backtick can swallow it; the
    │                                comment case only holds where the interactive shell recognizes `#`: bash
    │                                does, interactive zsh does not unless `interactive_comments` is set, and
    │                                the real-bash test runs non-interactive bash). A folder with a control
    │                                character, or that is not absolute (`~`, `-x`, relative), is refused with a toast and nothing
    │                                runs (the Fixed folder field shows the same message); a folder that does not
    │                                exist or is a file makes the `cd` fail so nothing runs, and a toast says why.
    │                                The PowerShell line (`{ cmd` + LF + blank LF + `}` + CR) has not been verified on
    │                                Windows PowerShell 5.1 or 7: it needs a manual check there. The shell hook
    │                                reports a script as its typed wrapper, so Run on Start persists the script's own
    │                                command (`terminalEphemeralStore` keeps it while the mark exists) and never a
    │                                report of 256 characters or more (the hook's cut-off). Stop on a script whose
    │                                command never started clears the mark at once; bash emits `OSC 133;C` without
    │                                text, and that bare start counts as a started command. The tab is marked
    │                                running before the delayed write, so a double click cannot type twice; the
    │                                pending write is dropped if the mark is gone (Stop, tab closed) and the mark
    │                                is removed if no terminal handle shows up. Known limits: cmd.exe is not told apart from PowerShell (a cmd.exe tab
    │                                gets PowerShell syntax and the cd fails), and the frontend does not know
    │                                the user's shell, so fish before 4.1 (no `{ }` group) gets a syntax error
    │                                and the script does not run in a reused tab with a folder),
    │                                activeScript (selected script id), and statusId (optional foreign key
    │                                to a WorkspaceStatus id in the preferences store). See WORKSPACES.md for render
    │                                tree details.
    │                                `terminalEphemeralStore` has a second section, `scriptRunning` (Map<tabId,
    │                                ScriptState>), tracking which terminal tabs are running a script command.
    │                                Set by `runWorkspaceConfig` in App.tsx; cleared by OSC 133;D
    │                                (`onRunningCommand` with cmd=null). Never persisted.
    ├── shortcuts/                 : Global keymap registry, useGlobalShortcuts. One `editor.cycleView`
    │                                (Cmd+Shift+V) serves every editor view: on an `editor` tab over a .md/.html
    │                                the global handler toggles raw/overlay; on a `markdown` tab it calls the
    │                                tab's registered handle, which rotates Source/Rich/Preview
    │                                (`lib/viewCycle.ts`). `markdown.toggleOutline` and `editor.save` use the same handle. `editor.preview.toggleSplit` has no default binding.
    ├── theme/                     — CSS variable engine, presets, custom themes, bg image
    ├── settings/                  — Settings store, preferences, window opener.
    │                                The `Preferences` type includes `workspaceStatuses: WorkspaceStatus[]`
    │                                (the global ordered status list, key `workspaceStatuses` in
    │                                `settings-general.json`, synced cross-window via `GENERAL_PREF_KEY_MAP`).
    │                                `WorkspacesSection` in `src/settings/sections/` manages this list.
    ├── browser/                   — Web browser pane (address bar; also dev-server preview). Browser tabs can be floated out into a native `WebviewUrl::External` window via the float-browser feature; the tab stays as a placeholder in its pane and docks back on close.
    ├── markdown/                  : Live Preview, the only markdown engine. Used by the `markdown` tab kind
    │   │                            and, through `MarkdownPreviewPane.tsx` (read-only Live Preview), by the
    │   │                            editor-tab overlay/split preview (`kind: "editor"` with
    │   │                            `previewMode: "overlay" | "split"`).
    │   │                            `codemirror/` is the engine: `MarkdownTab.tsx` (tab shell with the
    │   │                            Source / Rich / Preview modes and the Outline), `CodeMirrorEditor.tsx` and
    │   │                            `lib/` (the decorations: `livePreview.ts` plans them, `livePreviewPlugin.ts`
    │   │                            applies them, `markdownExtensions.ts` holds the theme). It edits the raw
    │   │                            markdown text in place (Obsidian-style hide/reveal of syntax markers on the
    │   │                            active line) and never transforms the saved bytes. Source and Rich share one
    │   │                            CodeMirror view (a `Compartment` toggles the decorations, so cursor, scroll and
    │   │                            undo survive the switch) and Preview swaps it for `MarkdownPreviewPane`. The
    │   │                            tab shell is lazy-loaded as its own chunk from `TabContent.tsx`; see
    │   │                            "Markdown editor chunks" in `docs/BUILD.md`. See `docs/FORK.md` and
    │   │                            `docs/superpowers/specs/2026-09-27-live-preview-markdown-editor-design.md`.
    │   │                            `lib/` holds the shared pure pieces: `frontmatter.ts` (where the frontmatter
    │   │                            block ends), `outline.ts` + `OutlinePanel.tsx` (`headingsFromMarkdown`, jump to a
    │   │                            heading by its 0-based `line`), `imageSrc.ts` (local image path resolution),
    │   │                            `codeCopyIcons.ts`, `viewCycle.ts` and `MarkdownDocFallback.tsx`.
    ├── notes/                     — HelixNotes-style notes view for the Sidebar (visible only when the workspace
    │                                defines a `workspaceRoot`). Two resizable columns: Quick Access (pinned notes, dnd-kit
    │                                reorder) plus folder tree, and a sortable note list (`modified | title | created | custom`,
    │                                optional date grouping). The view reads one directory level at a time through
    │                                `notes_read_dirs` (title from frontmatter, H1 or file stem; 120-char snippet; 2 KB head
    │                                reads), keeps a per-folder cache, and registers exactly the loaded folders with the
    │                                non-recursive filesystem watcher. Pinned titles in Quick Access resolve through
    │                                `notes_read_heads`. All view state persists to `kex.json`
    │                                at the workspace root under the `notes` namespace (vault-relative forward-slash paths,
    │                                read-modify-write preserves foreign namespaces, no migrations: invalid file means defaults).
    │                                Kex never writes metadata into user `.md` files. Opening a note creates a `markdown`
    │                                tab, so it opens in Live Preview.
    ├── workspace/                 — Local + WSL environment switching
    ├── updater/                   — Auto-updater dialog
    └── command-palette/           — Fuzzy command/file/search palette
```

### Tab kinds (tagged union)

`terminal` | `editor` | `browser` | `markdown` | `git-diff` | `git-history` | `git-commit-file`

All tab kinds follow the same never-unmount rule. Tabs live inside panes; panes are nodes of a binary split tree inside a workspace. The workspace bar (left, 52px) lists workspaces; the `Sidebar` holds Explorer, Source Control, Git History, and Notes (conditional on the workspace having a
`workspaceRoot`) and can dock left or right.

Every editor (and `markdown`) panel renders a thin top bar (`EditorPathBar`) as the first row of its layout: the open file's full path as a navigable breadcrumb on the left, and the editor controls on the right. The breadcrumb (`EditorPathBreadcrumb`, modeled by the pure `buildEditorPathBreadcrumb`) renders every directory segment as a clickable button that reveals that folder in the explorer; the filename is the non-clickable leaf. Each segment is tagged relative to the workspace root (`workspaceRoot`/`home` reach the bar via `EditorChromeContext`): the root segment carries a pin icon, its ancestors are dimmed, and descendants render normally; marking is suppressed when there is no pinned root or the file lives outside it. The full path is always shown (no segment collapsing) and the breadcrumb scrolls horizontally when it overflows, while the right-side controls stay fixed. Markdown files open in Live Preview (`kind: "markdown"`), whose bar carries the Source / Rich / Preview mode buttons and the Outline toggle. The bar also hosts a `[...]` dropdown that surfaces the per-extension view settings (wrap, line numbers, whitespace, fold gutter) for the currently open file extension; the header label reads "Applies to .<ext> files" and changes persist to `editorViewByExt` in the preferences store. Word wrap is a per-extension setting, not a global per-panel override. The file-name leaf has a right-click context menu (`FileLeafContextMenu` / `fileLeafMenuItems` in `modules/workspaces/pathbar/`): Reveal in Finder, Rename, Duplicate, Copy Absolute/Relative Path, Add to .gitignore, Delete. Mutations (rename/duplicate/delete) route through `RevealRequest.pendingAction` (an optional field added to `RevealRequest` in `src/modules/explorer/lib/pendingAction.ts`); `onFocusOnExplorer(path, action?)` in `App.tsx` sets the action when building the reveal request, and `FileExplorer.applyRevealTarget` performs it after revealing the path in the tree (nonce-guarded, fires once). Directory segments share the same `DirSegmentContextMenu` used by `TerminalPathBar`.

A `browser` panel carries an optional `floating` flag. When set, the panel is shown in a native `WebviewUrl::External` window (managed Rust-side by `FloatBrowserState`) and its in-pane slot renders a placeholder with an editable address bar instead of the iframe. See `docs/FORK.md` (Floating browser windows) for the full lifecycle.

### `src/lib/native.ts`

Contains typed wrappers for all Tauri `invoke()` calls (`native.readFile`, `native.gitCommit`, `native.workspaceAuthorize`, etc.). All modules import from `@/lib/native` — never use `invoke()` directly in components or hooks.

---

## 8. Security model

**IPC boundary.** The WebView cannot access the filesystem, spawn processes, or make outbound HTTP requests directly. Every OS operation is an explicit `invoke()` call to a named Tauri command. The `capabilities/default.json` file is the allowlist — only commands listed there are available to the webview.

**Path authorization.** Git commands and shell operations require the target directory to be in the `WorkspaceRegistry`. The registry is populated by explicit user gestures (opening a directory, navigating there in a terminal) or by the CLI launch argument.

**Opening paths with the default app.** `capabilities/default.json` grants `opener:allow-open-path` with the scopes `**` and `/**`, so the webview can ask the OS to open any path. This is deliberate: a Tauri scope is a fixed list of glob patterns and cannot follow the workspace roots, and the only caller is "Open with Default App" in the explorer and git file menus (`explorer/lib/contextActions.tsx`), where the path comes from an explicit user gesture on a file the user can already see. The consequence is the same as double-clicking in Finder: a file whose default app executes it (`.command`, `.app`, `.terminal`, `.workflow` on macOS) runs when opened. Kex adds no confirmation for those types. If the webview ever shows untrusted file names or opens paths it did not get from a user gesture, narrow this scope or move the call behind a Rust command that validates the path.

**CSP.** The WebView has a strict Content Security Policy (see `tauri.conf.json`). `connect-src` allows `self`, Tauri IPC, and `https:` plus `http://localhost:*` (for local dev servers). `script-src` allows `wasm-unsafe-eval` (required for xterm.js WebGL). No `unsafe-eval`.

**OSC trust.** Kex processes OSC 7, OSC 133, and OSC 0/2 sequences. OSC 0/2 (window/icon title) is passed through as-is and shown in the pane tab; it is the only channel that updates the tab title at runtime. There is no OSC-based execution primitive (unlike iTerm2's proprietary sequences). The risk is cwd spoofing from maliciously crafted output, not code execution.
