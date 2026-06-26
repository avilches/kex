# Fork notes

This repository is a fork of [crynta/terax-ai](https://github.com/crynta/terax-ai).

The original project is a terminal emulator with an integrated AI side-panel (BYOK, local models, agentic workflow).
This fork strips the AI subsystem and replaces it with a deeper terminal workspace UX: a multi-workspace layout with
per-pane tab strips, full layout persistence, and drag-and-drop panel management.

But this project has a similar, but different goal: 
  - The goal is a clean, fast terminal-first workspace with no AI runtime dependency, no API keys, and no keychain access
  - While investing the saved complexity budget into a more powerful pane and workspace model.

---

## What has been removed

### AI subsystem (frontend)

- `src/modules/ai/` — entire module: composer, multi-session agent runner, slash commands, voice input, AI autocomplete
  CodeMirror extension, session hydration, tool execution, plan mode
- `src/modules/agents/store/managedAgentsStore.ts` — managed agents launched via `/claude-code`
- AI and Agents sections in the Settings window
- AI controls in `StatusBar` (provider selector, model picker)
- `AiInputBar` / `WorkspaceInputBar` AI composer surface
- `AiComposerProvider`, `AgentRunBridge`, `useAiLiveBridge`, `hydrateSessions` wiring in `App.tsx`

What survives from `src/modules/agents/`: the passive notification bell (OSC-based Claude Code detection, OS
notifications, Sonner toasts). Zero cost when no agent runs.

### AI subsystem (Rust)

- `src-tauri/src/modules/net.rs` — HTTP proxy used exclusively for AI API calls (`reqwest`)
- `src-tauri/src/modules/secrets.rs` — OS keychain access used exclusively for API key storage (`keyring`)
- All related `tauri::generate_handler![]` entries and capability entries

### npm dependencies

`ai` (Vercel AI SDK v6), `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/cerebras`, `@ai-sdk/groq`,
`@ai-sdk/xai`, `@ai-sdk/react`, `streamdown` — all removed. Reduces the frontend bundle by roughly half.

### Features de upstream evaluadas y omitidas

- `src/modules/spaces/` (Spaces, agrupacion de tabs): evaluado en el upstream sync 2026-06-13, omitido. El upstream anade
  "spaces" como una capa que agrupa tabs planos (cada tab con su propio paneTree), persistida en `terax-spaces.json`. El
  fork ya cubre esa necesidad (varios entornos de trabajo agrupados, conmutables, reordenables, persistidos) con su
  modelo Workspace -> Pane -> Panel y el WorkspaceSidebar, sin un nivel intermedio de tabs. Traer spaces introduciria un
  segundo eje de agrupacion redundante, un segundo store en disco, y resucitaria el modelo de tabs planos eliminado en la
  Phase 2. Se omite por conflicto de arquitectura, no por falta de valor. Piezas de UI sueltas (SpaceAvatar con acento
  oklch, InlineRename, DropIndicator) quedan como posible pulido futuro del WorkspaceSidebar.
- `src/modules/dnd/` (dnd foundation del upstream): omitido. Es una fachada sobre @dnd-kit; el fork ya tiene
  `WorkspaceDndProvider` (drag de panels entre panes y de archivos del explorer a panes), mas avanzado.
- Empaquetado Nix (`flake.nix`, `nix/`): el upstream distribuye via Nix; el fork no. Se ignoran todos los commits nix.

---

## What has been added or changed

### Phase 1 — 3-column layout

**Problem in the original:** a horizontal tab bar at the top and a collapsible left sidebar holding Explorer, Source
Control, and Git History. This layout does not scale to many workspaces and leaves no room for a workspace-level pane
model.

**What was built:**

- `WorkspaceSidebar` (52px vertical strip, left) — replaces the horizontal `TabBar`. Lists workspaces as icon avatars
  with stable colors derived from their ID. Keyboard-navigable.
- `RightPanel` (collapsible, default 240px, right) — holds Explorer, Source Control, and Git History as tabs. Width,
  active tab, and open/closed state persist via `tauri-plugin-store`.
- `rightPanelSide` preference — moves the tool panel to the left of the center content for users who prefer that layout.
- `SidebarRail` and `useSidebarPanel` deleted (replaced by RightPanel).
- `Header` no longer owns the tab bar.
- `open_main_window` Tauri command — mirrors the settings window pattern, enables multiple independent main windows (
  `Cmd+Shift+N`).
- `Tab.id` migrated from `number` to `string` UUID — stable IDs required for cross-window entity transfer in later
  phases.
- `@dnd-kit/core` and `@dnd-kit/sortable` installed (no UI in Phase 1, needed for Phase 4).

### Phase 2 — Workspace/Pane/Panel model

**Problem in the original:** a flat `Tab` model where each tab was the unit of content. Split panes existed but were
scoped inside a terminal tab, not composable with editor or preview tabs. No per-pane tab strips.

**What was built:**

Three-level hierarchy:

```
Workspace  (UUID, title, cwd, binary pane tree)
  SplitNode  (kind: "pane" | "split"; binary, not N-ary)
    Panel  (UUID, kind: terminal | editor | preview | markdown | git-*)
```

- `useWorkspaces` replaces `useTabs` entirely. Owns workspace list, active workspace, and all pane/panel operations (
  split, close, move, activate).
- `splitNode.ts` — pure tree-operation library (split, remove, find, flatten, sibling lookup, directional neighbor lookup via `findPaneInDirection`). Fully unit-tested.
- `WorkspaceView` → `SplitNodeView` (recursive) → `PaneView` → `PanelContent` — new rendering path. All content kinds (
  terminal, editor, preview, git-*) now live as panels inside panes.
- `PaneTabBar` — per-pane tab strip with close buttons and a `+` button to open a new terminal panel in that pane.
- `dividerPosition` stored explicitly on split nodes (0.0–1.0) — layout persists without relying on
  `react-resizable-panels` internal state.
- PTY session key migrated from `leafId: number` to `panelId: string` (UUID) throughout: `useTerminalSession`,
  `rendererPool`, `pty-bridge`, all call sites.
- `src/modules/tabs/` deleted.
- Never-unmount rule preserved: panels hidden via CSS, never unmounted. PTYs keep streaming in the background.

### Layout persistence

**Problem in the original:** no layout persistence. Restarting Terax always opened a fresh terminal with no memory of
previous workspaces or pane layout.

**What was built:**

- Full `Workspace[]` serialized to `workspace-state.json` via `tauri-plugin-store` on every state change (debounced
  300ms).
- Pane tree, panel list, divider positions, active pane, and active panel all restored on restart.
- Terminal panels restart with a fresh PTY in the saved `cwd`.
- Editor and other non-terminal panels restore their content reference (`path`, `url`, etc.).
- `sanitizeWorkspace` clears transient state at save time (e.g. `editor.dirty = false`).

### UX improvements

- **Focus restore on workspace switch** — when switching workspaces (via sidebar click or keyboard shortcut), the active
  terminal panel of the new workspace receives focus automatically via `requestAnimationFrame`. No manual click needed.
- **Active-pane tab indicator** — a 2px blue line (`bg-primary`) at the top of the tab that currently holds keyboard
  focus. Distinguishes "active in its pane" from "has global focus" when multiple panes are visible.
- **`workspace.new` shortcut (`Cmd+N`)** — creates a new workspace directly from the keyboard or command palette. In the
  original, the equivalent was `Cmd+T` for a new tab.
- **Adjacent tab activation on close** — closing a panel activates the panel to its right (if any), then to its left.
  More natural than the original behavior of always activating the last panel.
- **Workspaces without tabs** — closing the last tab no longer closes the workspace. Instead, the sole pane of the workspace becomes empty and renders a welcome screen with quick actions (new terminal, open file). A workspace is closed only by an explicit action (the close shortcut or the sidebar close button). The close action runs a two-stage cascade: if `warnOnCloseTabWithRunningProcess` is on and the workspace has terminals with live foreground processes, a dialog lists the affected terminals and offers to disable future warnings; otherwise, if `warnOnCloseWorkspace` is on, a plain confirmation dialog is shown; otherwise the workspace closes directly. Closing the last workspace quits the app. Not present in upstream Terax.
- **Directional pane focus shortcuts** — `Cmd+Ctrl+Arrow` (Mac) / `Ctrl+Alt+Arrow` (non-Mac) moves focus to the
  geometrically adjacent pane in the given direction. Uses `findPaneInDirection` (spatial scoring on DOM rects: closest
  pane wins, tie-broken by perpendicular overlap). Hard stop at borders; no wrap-around. Replaces the old cyclic
  `Cmd+[` / `Cmd+]` shortcuts.
- **Explorer root modes** — the explorer root is no longer hardwired to the active terminal cwd. A per-workspace mode
  (selector above the tree) picks between File System (home, navigable) and Workspace Root (set via "Set as workspace
  root" on any folder). The upstream "Follow Terminal" and "Follow Git Root" modes are removed; their reactive
  behavior is replaced by the explicit per-terminal autofocus mechanism (see below). The Workspace Root option is
  disabled when unset or missing. The mode is the single source of truth for the root, so focusing an editor no
  longer reroots the explorer (the upstream per-editor root override was removed). Pure logic in
  `modules/workspaces/lib/explorerRoot.ts`; state persisted in `workspace-state.json` (`explorerRootMode`,
  `pinnedRoot`).
- **Per-terminal autofocus (sidebar-driving terminal)** -- replaces the removed "Follow Terminal" / "Follow Git Root"
  modes. A terminal with its autofocus flag enabled (crosshair indicator on the tab, toggle in the tab hover card)
  drives both the Explorer root and the Source Control / Git History repo when it gains focus or its cwd changes while
  focused. F4 (`tab.focusOnExplorer`) does the same anchoring unconditionally regardless of autofocus, and
  additionally opens the right panel if closed and switches away from Git History. Both F4 and autofocus use the same
  cascade: folder under workspace root -> Workspace Root mode; else under a git repo -> File System rooted at that git
  root; else File System at the common ancestor / dirname. The git repo for Source Control / Git History is resolved
  from the same folder (`git_resolve_repo`), stored per workspace as `gitRootByWs`, and is `null` when no repo is
  found. Unlike the old reactive Follow modes, autofocus never fires on app boot and never switches sidebar tabs or
  opens the panel automatically. The `autofocus` flag is persisted in `workspace-state.json`.
- **Root path header (all modes)** — the tree is prefixed by a non-collapsible header row showing the current root's
  full path, left-truncated when long so the tail stays visible (a leading LRM keeps the leading `/` from being
  reordered by the rtl-based truncation). The selector trigger shows the active mode's label and icon rather than the
  folder name. The header has its own context menu (Set as Workspace Root, New Workspace from folder, Open in Terminal,
  Reveal in Finder, New File/Folder, Copy Path, Refresh); in Workspace Root mode the "Set as Workspace Root" entry is
  disabled and reads "This is the Workspace Root".
- **Navigable File System root** — in File System mode the root is navigable per workspace: double-clicking a folder
  enters it. On top of the shared path header, File System adds a `..` folder-style row (hidden at the filesystem or
  drive root) whose double-click climbs to the parent directory; the selector uses the hierarchy icon and its subtitle
  shows the current root path. If the current root is deleted while shown, the explorer silently relocates to the
  nearest existing ancestor instead of showing a recovery state. The current root is stored as `fsRoot` in
  `workspace-state.json` (default home). A JSON-only preference `keepFolderLayoutOnChangeExplorerRoot` (default `false`)
  controls whether the per-root tree expansion layout is restored on root change or the tree starts collapsed. The `..`
  row appears only in File System mode; Workspace Root mode is unaffected.
- **Folder context actions** — a folder's context menu offers "Open in Terminal" (opens a new terminal tab in the
  current workspace's active pane, spawned directly with the folder as cwd, leaving the explorer view untouched) and
  "New Workspace from folder" (creates a new workspace with that folder pinned as its Workspace Root). Neither injects a
  `cd` command into a shell. A file's context menu also offers "Open in Terminal", spawning the terminal in the file's
  parent directory.

- **Add to .gitignore**: a file/folder context action (shown only inside a git repo) that appends an anchored entry to the repo-root `.gitignore`, idempotently. If `.gitignore` is already open in an editor, the line is inserted into that buffer (marking the tab dirty) instead of writing to disk, so unsaved edits are never clobbered. Pure helpers in `modules/explorer/lib/gitignore.ts` (tested). Not present upstream.

- **Background file/folder duplication**: context-menu "Duplicate" on any file or folder opens an inline name input directly below the source row, pre-filled with a non-colliding suggestion (`pepe copy.txt`, `src copy`). Confirming starts a background copy (`fs_duplicate`) that emits progress as the global event `kex:duplicate-progress`. A global floating progress bar (`DuplicateProgressBar`, bottom-left) shows bytes copied and a cancel button; cancelling mid-copy deletes the partial destination via `fs_duplicate_cancel`. Only one duplication runs at a time. Quitting (Cmd+Q) while a copy is in progress defers the exit and shows a modal in all app windows (main + Settings) with three options: wait for the copy to finish, keep the app open, or cancel the copy and quit immediately. Not present upstream.

- **Source Control directory Tree view**: the Source Control panel gains an IntelliJ-style directory Tree view toggle (not present upstream). A toolbar button switches between List mode (flat files) and Tree mode, with the chosen mode persisted as `scmViewMode` in the settings store. Both modes keep the Staged Changes / Changes roots (with their count badges and bulk Stage all / Unstage all / Discard all actions on each header); Tree mode renders each root as a directory tree with compacted single-child chains, using the file explorer's icons and spacing for visual consistency. Per-folder hover actions stage/unstage/discard a whole folder, and per-file hover actions plus keyboard shortcuts (`s`/space, `d`, `Enter`, `ArrowLeft`/`ArrowRight`) work in both modes. Tree building lives in the pure, tested `scmTree.ts`.

### Technical fixes and refactors

- **WebGL canvas refresh** — after a workspace switch, the `opacity-0` CSS change does not trigger a WebGL repaint. A
  `useEffect` with `requestAnimationFrame` calls `refreshTerminalLeaf` on each visible panel to force the canvas to
  repaint.
- **DnD zone isolation** — drop targets from inactive workspaces share screen coordinates with the active workspace (all
  positioned absolute inset-0). Drop events now validate that the target pane belongs to the same workspace as the
  dragged panel.
- **Renderer pool simplified** — the original eviction logic (score-based LRU with `POOL_MAX_SIZE = 5`) removed. With
  the Workspace/Panel model each panel gets and keeps its own slot; eviction no longer applies.
- **`TERMINAL_ID` env var** — injected into the shell environment at PTY spawn (both Unix and Windows). Available to
  shell scripts and tools running inside the terminal.
- **`KEX_PANEL_ID` env var** (formerly `TERAX_PANEL_ID`) — UUID injected into each PTY shell at spawn. Used by session
  persistence hooks to associate an agent session with a specific terminal panel across restarts.
- **App env var prefix renamed to `KEX_`** — all shell integration env vars (`TERAX_TERMINAL`, `TERAX_BLOCKS`,
  `TERAX_PANEL_ID`, `TERAX_USER_ZDOTDIR`) have been renamed to `KEX_TERMINAL`, `KEX_BLOCKS`, `KEX_PANEL_ID`,
  `KEX_USER_ZDOTDIR`. Shell integration cache moved from `~/.cache/terax/` to `~/.cache/kex/`. Fish integration file
  is now `kex.fish`. **Sync impact**: any upstream commit that references `TERAX_` env vars or `terax` paths will
  need manual adaptation. The old Terax hook markers are still in `OWNED_MARKERS` as migration targets (they get
  replaced when the user reinstalls hooks).
- **Claude Code hooks config path renamed to `~/.config/kex/`** (formerly `~/.config/terax/`) — `agent-sessions.json`,
  `restore-candidates.json`, and `hooks/session.sh` are now under `~/.config/kex/`. Hook OSC signal changed from
  `notify;Terax;` to `notify;Kex;`. Script version marker is now `kex-session-v1`. Users with the old Terax hooks
  installed will see the "Enable Claude Code alerts" button again (status check detects the outdated script via the
  version marker) and reinstalling updates both the script and the OSC signal.
- **Agent session restore** — when Claude Code hooks are installed, the app writes the active session id and cwd to
  `~/.config/kex/agent-sessions.json` (via `SessionStart` hook; `SessionEnd` is intentionally ignored to avoid a
  race with PTY death). On relaunch, `agent_session_restore_plan` (Rust) reads the store (preferring
  `restore-candidates.json` written just before the last close), locates the Claude Code JSONL transcript to verify
  the cwd, and returns a resume command per recoverable session. The frontend types the command
  (`claude --resume '<id>'`) into the terminal 200ms after the PTY opens. Tab UI: `agentname · dirname` title, `✦`
  icon, colored status dot; `⚠` on error. See `docs/AGENT_SESSION_RESTORE.md`.
- **`agentNotifications` setting** (formerly `claudeHooksEnabled`) — boolean persisted in the app settings store.
  Controls both notification routing and hook lifecycle. Enabling it calls `agent_enable_claude_hooks`; disabling it
  calls `agent_disable_claude_hooks` (removes Kex hooks from `~/.claude/settings.json`). On every startup, the app
  silently calls `agent_enable_claude_hooks` when this is true (idempotent). Controlled via Settings > General >
  Coding agent notifications; also accessible from the notification bell popup ("Enable Claude Code alerts").
- **Minimal `~/.claude/settings.json` writes** — `agent_enable_claude_hooks` now uses `serde_json` with
  `preserve_order` (insertion-order key serialization via IndexMap) and detects the original indent style, so
  reformatting is kept to the minimum necessary. If our hooks are already present, settings.json is not touched at
  all. **Sync impact**: `Cargo.toml` now has `serde_json = { version = "1", features = ["preserve_order"] }` instead
  of `serde_json = "1"`. Upstream commits that add direct `serde_json` usage will still compile; only the object key
  order in serialized output changes from alphabetical to insertion order.
- `native.ts` moved from `src/modules/terminal/` to `src/lib/native.ts` — shared across all modules.

### Native macOS menu

The fork builds its own macOS menu bar instead of the default Tauri menu (`#[cfg(target_os = "macos")]` in `lib.rs`
`setup`). Three reasons drove this:

- **Save on Cmd+Q.** The predefined macOS Quit item terminates natively and never fires `RunEvent::ExitRequested`
  ([tauri#12978](https://github.com/tauri-apps/tauri/issues/12978)), so `prevent_exit` could not run the autosave
  flush. The custom Quit item is intercepted in `on_menu_event`, which emits `kex:before-quit`; the frontend flushes
  dirty editors and workspace state, then calls the `confirm_quit` command (guarded by `QuitGuard` so the second pass
  exits). `ExitRequested` is still handled as a fallback for programmatic exits.
- **App actions in the menu.** Kex / File / Edit / View / Window submenus. Action items emit `kex:menu` with their id,
  routed via `emit_to` to the focused window only (plain `emit` broadcasts to every window), and dispatched in
  `App.tsx` to the same handlers the shortcuts use. Dynamic labels (Enable/Disable Autosave, Show/Hide
  Sidebar/Explorer/Git/History, Move Sidebar Left/Right) are refreshed by the `sync_menu` command whenever the backing
  preferences change.

### Autosave on focus loss and before close

Autosave no longer relies only on the idle timer (kept as a 15s fallback, editable only in the store JSON). It flushes
dirty editors when the editor loses focus (tab/workspace switch, window blur) and before a tab or the app closes.
Closing a tab with autosave on saves silently instead of prompting, and the dirty dot is hidden while autosave is on.

### Browser tab (renamed from "preview")

The web pane is a real browser (address bar, navigation, reload), so the panel `kind` and its module were renamed
`preview` → `browser` (`src/modules/browser/`, `BrowserPane`, `BrowserPaneHandle`). Sessions saved before the rename
are migrated on load in `sanitizePanel` (`kind: "preview"` → `"browser"`). The editor `preview` boolean (ephemeral
tabs) and the markdown preview pane are unrelated and unchanged.

### Floating browser windows

Browser panels can be opened as native `WebviewUrl::External` windows (WKWebView on macOS, WebView2 on Windows),
bypassing iframe X-Frame-Options restrictions that block sites like localhost dev servers or third-party apps. The panel
stays as a placeholder in its pane showing an editable address bar; typing a URL drives the floating window via
`float_browser_navigate`, and in-window navigation flows back through the `kex:float-navigated` event so the address bar
and persisted `panel.url` stay in sync. Dock back through any of these paths: the float window X button, the "Dock here"
button in the placeholder, or the macOS Window menu items "Dock Browser" (the focused float) and "Dock All Browsers" (all
open floats), each enabled only while it applies. Floating windows are recreated on app restart for
panels persisted with `floating: true`, and destroyed without docking when their tab, sibling tabs, or workspace close.
State is managed Rust-side in `FloatBrowserState` (`src-tauri/src/modules/float_browser.rs`); the frontend hook is
`useFloatBrowser` (`src/modules/browser/useFloatBrowser.ts`).

### Focus on Explorer

A tab context-menu action (and `F4` shortcut, group Tabs) that reveals the tab's file or folder in the Explorer:
"Focus File on Explorer" for file tabs (editor / markdown / git-diff / git-commit-file) and "Focus Folder on Explorer"
for terminal tabs (their current `cwd`). If the active explorer view already contains the target it is just expanded and
selected without changing mode; otherwise the explorer switches to File System rooted at the deepest common ancestor
between the reference fs root and the target (falling back to the target's parent dir when there is no common ancestor,
e.g. a different Windows drive). The decision is a pure function (`resolveFocusTarget` in
`src/modules/workspaces/lib/explorerRoot.ts`); revealing is driven reactively by a `revealRequest` prop on `FileExplorer`
that re-runs as the tree reloads asynchronously, expanding each ancestor until the target is loaded, then selecting and
scrolling to it without stealing focus from the editor. The context menu also gained icons on every item.

### Word wrap floating bar

The word wrap setting for editors was moved from the Settings window to the editor controls bar (then `EditorOverlayBar`, since reshaped into `EditorPathBar`, see "Editor path bar" below). It replaced `MarkdownViewToggle` (removed) and hosts two controls:

- `WrapToggleButton` toggles word wrap for the current panel. Word wrap defaults by file type: prose (`.md`, `.markdown`, `.mdx`, `.txt`, `.text`, via `shouldWrapByDefault`) opens wrapped, code and everything else unwrapped. The toggle sets a per-panel `wordWrapOverride` (persisted with the workspace), so the effective wrap is `override ?? type default`. This replaced the old global `editorWordWrap` preference (removed). The same override and toggle apply to editor panels and to the git diff / commit-file panes, which share the button.
- The `Rendered | Edit` view toggle (markdown panels only, label changed from `Rendered | Raw`). The underlying value `"raw"` is unchanged; only the visible label differs.

Plain code editor panels render the bar without the view toggle. The wrap button shows in code and markdown edit (raw) panels, but is hidden in the markdown Rendered preview, where word wrap has nothing to act on.

### Editor path bar

The editor controls bar (`EditorOverlayBar`) was reshaped into `EditorPathBar`: a thin top bar that is the first row of every editor and markdown panel instead of a chip floating over the content. It shows the open file's full path as a navigable breadcrumb on the left and keeps the existing controls (language selector, `[...]` view options, split, preview) on the right. The breadcrumb (`EditorPathBreadcrumb`, modeled by the pure `buildEditorPathBreadcrumb`) renders every directory segment as a clickable button that reveals that folder in the explorer, with the filename as the non-clickable leaf. Segments are tagged relative to the pinned workspace root: the root carries a pin icon, its ancestors are dimmed, descendants render normally, and marking is suppressed when there is no pinned root or the file is outside it. The full path is always shown (no collapsing) and scrolls horizontally on overflow while the controls stay fixed. `workspaceRoot`/`home` reach the bar through `EditorChromeContext` (a small provider around `WorkspaceView`) rather than prop drilling through the render tree.

This breadcrumb replaced the bottom status bar (`StatusBar`, with its `CwdBreadcrumb` and `WorkspaceEnvSelector`), which was removed entirely. The terminal cwd breadcrumb is gone; the editor breadcrumb now reflects the open file's path instead. Note: the Windows-only WSL `WorkspaceEnvSelector` had no other UI host, so switching workspace environment currently has no dedicated control.

### Terminal info bar

Every terminal panel now has a thin top bar (`TerminalPathBar`, h-6) showing the cwd on the left and live process metrics on the right: the shell PID, the running foreground command (or the shell name when idle), CPU percentage, and resident memory. The upstream has no equivalent.

Metrics are sampled every 5 s via the `pty_metrics` Tauri command (backed by the `sysinfo` crate, 0.39). A persistent `sysinfo::System` is kept in Rust-managed state (`ProcessMonitor`) so the CPU reading is a real delta between calls (normalized 0..=100 across logical cores) rather than an instantaneous value. The sample covers the shell PID and all its descendants, so a `cargo build` or `npm install` subprocess is included. Sampling is limited to the visible terminals of the active workspace and suspended when the document is hidden, so the background cost is negligible when the window is not in use. Results are stored in the ephemeral `terminalMetricsStore` (`useSyncExternalStore`), which is never persisted.

### Thin scrollbars

The global kill switch in `globals.css` hides every native scrollbar (chunky Chromium bars on Linux/Windows, a flashing WKWebView overlay on macOS). Thin, theme-colored scrollbars are now opted back in where they help: the editor and git diff (`.cm-scroller`), the markdown preview, the file explorer, the source control panel, and the git history (side panel and tab). They use the standard `scrollbar-width: thin` / `scrollbar-color` exposed as a reusable `.thin-scrollbar` utility; this matters because the kill switch's `scrollbar-width: none` overrides any `::-webkit-scrollbar` styling in WKWebView, so the standard property is the only reliable way to bring the bar back. The terminal recolors xterm's own overlay slider instead. Bars are thin and stay visible while content overflows (not auto-hide), colored from the theme `--foreground`. The editor's right padding was moved to `.cm-content` so the bar sits flush against the panel edge.

### Nested repos and worktrees in the git views

Anchoring (autofocus / `F4`) on a file that lives in a git repo nested inside the pinned workspace root now re-roots the Explorer to that nested repo, so Source Control and Git History follow the nearest repo of the focused file instead of the parent (`resolveSidebarTarget`, tested). Repo resolution (`git_resolve_repo` / `git_panel_snapshot`) accepts a file path (resolving from its parent directory) so editor tabs anchor too, and the Source Control summary keys repo reuse on the exact context path (`canReuseResolvedRepo`, tested) so a nested repo is never absorbed into its parent. When the resolved repo is a linked worktree, the Source Control header shows a `worktree` badge (link icon) next to the branch, with the worktree path in its tooltip; `GitRepoInfo` carries an `isWorktree` flag for this.

---

## Roadmap (planned, not yet built)

These phases are designed but not fully implemented:

- **Phase 3 — Persistent terminal sessions** — a tmux daemon per workspace that keeps shell sessions alive across Kex
  restarts. Panels restore with their full scrollback and running processes intact.
- **Phase 4 — Drag-and-drop panel management** — drag panels between panes (5-zone drop: top / bottom / left / right /
  center), drag workspaces to reorder the sidebar, drag panels to other workspaces. Infrastructure (dnd-kit, stable
  UUIDs, `movePanel` / `splitPaneAndPlace` operations) is already in place; the full drop UX is in progress.
- **Multi-window workspace migration** — workspaces can be dragged from one window's sidebar to another window's
  sidebar. Requires a Tauri event protocol (`terax:workspace-transfer`) that transfers the workspace entity by ID across
  WebView instances.

---

### Upstream sync log

#### 2026-06-13

- Upstream HEAD: 8e1c4743fb4efcf1f3d089457c32dc1326552683
- Commits revisados: f69eecc34df5be9aa1b23166de7e84b231bca481..8e1c4743fb4efcf1f3d089457c32dc1326552683 (50 commits reales, 5 merges)
- Outcome: work plan creado en docs/upstream-2026-06-13.md y ejecutado (rama sync/upstream-2026-06-13)
- Bug fixes / perf aplicados (Bucket B): pwsh startup cursor query (tab blanco Windows, da_filter CPR); dormantRing coalesce + keep-history-on-overflow; raw-body pty_write (solo la parte de latencia, sin el watchdog que el upstream luego revierte ni tcgetpgrp); macOS press-and-hold off; editor cursor zoom macOS; AppImage env strip; integracion de blocks en bash/fish/pwsh (serie de 4 commits); test del ciclo OSC 133 de blocks; perf del explorer (RowActions memo + sameDirListing); tokens de motion compartidos (2 commits)
- New features aplicadas (Bucket C): git status decorations en el explorer (+ fix de gitignore-fuera-de-repo); drag-to-move dentro del explorer; aceptar archivos soltados desde el SO (fs_copy)
- Blocks (segunda tanda): cableada la activacion del modo blocks (campo blocks en Panel, propagacion en PanelContent, openNewBlock, montaje de ShellInput en TerminalPane) y aplicado C5 (toolbar de acciones via DropdownMenu, exit badge, navegacion por bloques Cmd+Up/Down con allowRepeat). navigateBlocks/selectBlock/clearBlockSelection en blockDecorations con keys panelId:string; navigateFocusedBlocks en la sesion; firstIndexEndingAtOrAfter (binary search por frame). Sistema de hover JS retirado a favor de CSS .bt-bar:hover (elimina un setInterval por bloque vivo y el LiveTimer).
- Divergencias conscientes en la integracion:
  - git decorations OFF por defecto (el upstream lo trae ON). El WalkBuilder por-directorio tiene coste real y la filosofia del fork es "lo no usado cuesta cero"; se activa en Settings > General > Explorer.
  - drag-to-move reimplementado con @dnd-kit en lugar del hook pointer-based del upstream (useExplorerDnd). El fork ya gestiona el drag de filas con @dnd-kit (arrastrar archivos a panes via WorkspaceDndProvider); dos sistemas de pointer-events sobre la misma fila chocarian. Carpetas como useDroppable (explorer-dir:<path>), drag de carpetas con prefijo dir:, move via useDndMonitor + movePath. El hook useExplorerDnd del upstream NO se integro.
  - C5 sin outputCap.ts ni accion "Attach to AI chat": en el upstream el dropdown de bloque adjunta el output al chat AI y capAttachOutput (outputCap.ts) lo recorta para no inundar el contexto del modelo. El fork elimino el subsistema AI, asi que ese unico consumidor no existe y outputCap seria codigo muerto; se omitieron ambos. El dropdown del fork ofrece Run again, Copy command, Copy output, Copy command and output y Find in block.
- Changes skipped (removed surface): subsistema AI (chips, OsIcon, parte AI de WorkspaceInputBar); empaquetado Nix (5 commits); modelo de tabs/spaces del upstream; modulo dnd del upstream; version bump 0.8.0; band-aids de conpty stall revertidos por el propio upstream (solo se aplico la causa raiz, 18187f4)
- New features rejected: Spaces (modelo de agrupacion de tabs, conflicto con el modelo Workspace del fork); dnd foundation (ya superado por WorkspaceDndProvider)
- New features deferred (no en esta ronda; ver sub-entrada 2026-06-14): markdown rendered/raw toggle; blocks watermark; blocks "hide live toolbar" + focus-on-open + copy-grid-selection; Cmd+Shift+T para New block terminal; mejoras de UI derivadas de motion tokens. Mejoras menores anotadas en docs/TODO-explorer-dnd-drop-targets.md (drop sobre archivo/raiz, color git en fila seleccionada, drag explorer->SO). Bug conocido del toolbar de blocks anotado en docs/pending (BUG-36: el menu desaparece en bloques muy largos).

#### 2026-06-14

- Continuacion del sync 2026-06-13 (misma rama sync/upstream-2026-06-13, sin mergear). SYNC AUN ABIERTO.
- Diferidos del Bucket C aplicados (reimplementados sobre el modelo del fork, no cherry-pick):
  - C8 (a9493ec): atajo `tab.newBlock` = Cmd+Shift+T cableado a `openNewBlock`. El commit upstream tocaba TabBar.tsx (inexistente en el fork); reimplementado en shortcuts.ts + App.tsx. La entrada de command palette ya existia; se le anadio el shortcutId.
  - C6 (b3000f2): watermark de primer uso (`BlockWatermark.tsx`) sobre un block terminal sin comandos; se desvanece al primer comando. Gate `blockWatermarkState` + `hasAnyBlock()` en BlockDecorations (con tests). Hints ADAPTADOS al fork (sin AI): historial, autocomplete, blocks.prev/next, tab.newBlock. El upstream referenciaba terminal.toggleInput y ai.toggle (inexistentes aqui). El refactor de hover que traia este commit ya estaba hecho en el fork (C5).
  - C7 (a10a63c + cd3c85c): hide-live-toolbar (el chrome del bloque aparece solo al terminar), focus-on-open del input, y copy-grid-selection (Cmd+C sobre seleccion del grid con el input enfocado, via onCopyCapture + leafGridSelection con keys string). Extra: Escape en el input limpia la seleccion de bloque (onEscape nuevo en shellEditor).
  - C4 (66f77c4): markdown rendered/raw toggle. isMarkdownPath portado; conmutacion reimplementada como `setPanelView` en useWorkspaces (muta un Panel entre kind "markdown" y "editor", gateada por dirty). Los .md abren renderizados por defecto desde el explorer. Eliminado el menu contextual "Open Preview" (redundante) y su threading. El componente `MarkdownViewToggle` del upstream fue sustituido posteriormente por `EditorOverlayBar` (ver seccion "Word wrap floating bar" mas abajo).
- Bug arreglado: BUG-37 (Cmd+U fantasma). Eliminado el shortcut muerto terminal.toggleInput ("Toggle Shell / AI input", residuo del modo AI), el evento TOGGLE_BLOCK_INPUT_EVENT (sin listener) y el hint enganoso. A peticion del usuario se recupero solo el hint visual estilo Cmd+U en el prompt (decorativo, sin accion ni atajo en Settings); el toggle real blocks<->normal queda anotado en docs/TODO.md (requiere integracion de shell dinamica + persistencia tipo tmux porque TERAX_BLOCKS se lee solo al arrancar la shell).
- Items opcionales re-decididos (cierre del sync):
  - 731da51 (header polish): APLICADO. Hover `hover:bg-accent hover:text-foreground` en el boton Command palette y divisores suavizados `bg-border` -> `bg-border/70`. El resto del commit (bloque spaceSwitcher+TabBar) no existe en el fork.
  - c4aaca2 (CI pnpm): APLICADO. release.yml y signpath-test.yml leen pnpm 11.5 del campo `packageManager` (antes pineaban version 10, un mismatch real con el proyecto). ci.yml ya no tenia pin.
  - 6ebb6b8 (panel swap animation): DESCARTADO. No aplica al fork: los 3 paneles del RightPanel estan montados siempre (invisible pointer-events-none) y no se remontan al cambiar de tab, asi que una animacion de entrada CSS no se dispara. Portarlo exigiria AnimatePresence/remount (rompe el estado vivo). Queda como pulido independiente.
  - afd1167 (appimage updater sig): DESCARTADO del sync, anotado como mejora M8 (docs/pending/improvements). El release.yml del fork divergio en el merge-base 8200938 (96 lineas) y nunca recibio la cadena de mejoras del AppImage del upstream (hoy 202 lineas, sin wayland/signer/patch-appimage). afd1167 modifica un step que el fork no tiene; adoptar el sistema completo es trabajo de infra aparte.
  - bb155d2 (tab enter animation): POSPUESTO. Portable a PaneTabBar, pero ese fichero estaba bajo un WIP de rename de pestanas (ya descartado por el usuario); se retoma cuando se quiera.
- El resto del scope aceptado (Bucket B completo, C1/C2/C3/C5) ya estaba aplicado de sesiones previas.
- Quality suite completa (cierre): check-types OK, lint exit 0 (85 warnings preexistentes), 180 tests, vite build OK; Rust cargo clippy OK, cargo test --locked OK.

#### 2026-06-21

- Upstream HEAD: b656fe3816d0ddaefb17e7acff5e16889f6e939a
- Commits revisados: 8e1c4743fb4efcf1f3d089457c32dc1326552683..b656fe3816d0ddaefb17e7acff5e16889f6e939a (34 commits reales, 0 merges)
- Outcome: work plan creado en docs/upstream-2026-06-21.md; bug fixes (Bucket B) ejecutados en rama sync/upstream-2026-06-21 y mergeados a main (fast-forward, HEAD 161ed21). Bucket C (features) y bumps de dependabot pendientes de decision del usuario; ver seccion "Next session" del plan. SYNC AUN ABIERTO: no avanzar el puntero LAST_SYNC a b656fe3 hasta cerrar todos los items de Bucket C.
- Bug fixes aplicados (Bucket B): git stage con directorio padre borrado (0eac4a6, cherry-pick limpio con sus tests); buffer de input pre-attach del pty acotado a 256 KiB (7f972aa + a1fca84, merge manual + test puro nuevo del cap); reap de sesion pty al salir el hijo, con flag exited para la carrera antes del registro (1691e73, merge manual); fish cwd con starship reinstalando el prompt en toda sesion fish, no solo block mode (2711841, merge manual sobre nombres __kex_); drop de tokenlens (dep muerta) + JetBrains Mono via @font-face woff2-only en vez de los CSS de fontsource con woff duplicado (cbe1ad4, parcial sin las partes AI).
- Bug fixes descartados (ya resueltos mejor en el fork): explorer cerrar menu tras borrar (7baee7c, el fork usa DeleteEntryModal y el menu ya cierra); fallback monospace para fuentes custom (6019e04, cubierto por 4803abc con stacks por plataforma, normalizeFontFamilies y FontFamilyInput commit-on-blur, ademas con fuente de editor).
- Quality suite tras los bug fixes: pnpm lint exit 0 (135 warnings preexistentes), check-types OK, 425 tests JS, cargo clippy limpio, 260 tests Rust.
- Bucket C a evaluar: mas resaltado de sintaxis + Dockerfile + Vue (b7eb8d6/90aeab5/b656fe3, cherry-pick viable); handler OSC 52 clipboard (0c647c4, implicacion de seguridad); confirmar salida con proceso de terminal vivo (d782f7d); selector de tema del editor + temas nuevos (35f8711 + 1afe8d5); restaurar env WSL al reabrir (4a6d803, entrelazado con spaces, extraer parte Rust); bumps de dependabot (re-derivar nativamente, no cherry-pick).
- Changes skipped (removed surface): AI (3 commits: modelos Grok/Opus 4.8/GPT-5.5, proveedores STT Groq/Whisper, entitlement de microfono); Spaces/Tabs (6 commits: MRU switcher Ctrl+Tab, drag-reorder de tabs, switcher HUD, close dialog por space); infra upstream (config CodeRabbit, bump v0.8.1, badges README, Nix sources).
- New features rejected: ninguna confirmada todavia (pendiente de decisiones del usuario en la ejecucion del plan).
- Nota (consulta del usuario): el upstream NO esta trabajando en el modulo git history en este rango. El unico cambio git es el fix de staging (0eac4a6, git/utils.rs); git-history/ y los comandos git_log/git_show_commit no se tocan.

#### 2026-06-22

- Upstream HEAD: 8043cfa106f7de9ee182b3dbd051e35cd2f1b273
- Commits revisados: b656fe3816d0ddaefb17e7acff5e16889f6e939a..8043cfa106f7de9ee182b3dbd051e35cd2f1b273 (1 commit nuevo aparecido tras crear el plan: word wrap toggle) mas la ejecucion del Bucket C pendiente del plan 2026-06-21.
- Outcome: CIERRA el sync abierto el 2026-06-21. Bucket C ejecutado en rama sync/upstream-2026-06-22 (worktree). LAST_SYNC avanza a 8043cfa. El selector de tema del editor se hizo a mano (un subagente fork se confundio de rol y no produjo cambios; sin impacto, worktree quedo limpio).
- Features aplicadas (Bucket C): mas resaltado de sintaxis + todas las variantes de Dockerfile + Vue (cherry-pick 90aeab5/b7eb8d6/b656fe3, limpio; loaders lazy, sin coste en el bundle eager; lockfile reconciliado para @codemirror/lang-vue); toggle de word wrap del editor (8043cfa, merge manual, wrapCompartment ya existia en el fork); selector de tema del editor standalone con modo "auto" que sigue el tema de la app + temas nuevos kanagawa/everforest/dracula/solarized y sus pairings (35f8711 + 1afe8d5, merge manual; activa el campo editorTheme pairing que el fork ya tenia pero no consumia; ThemeProvider deja de auto-persistir el pairing); handler OSC 52 clipboard write-only, always-on como el upstream, acotado a 1 MiB con validacion base64/UTF-8 y escritura no bloqueante (0c647c4, merge manual + 6 tests); fallback a home cuando el cwd del pty es stale o de otro entorno, helper spawn_cwd_or_home con 3 tests (parte Rust de 4a6d803).
- Features aplazadas: confirmar salida de la app con un proceso de terminal vivo (d782f7d). El approach del upstream (hook React con su propio onCloseRequested) choca con la arquitectura de cierre del fork (gestionada en main.tsx con claimClose de un solo uso + flush de estado + flujo Cmd+Q via confirm_quit en Rust, sin plugin dialog). Integrarlo con seguridad toca el flujo critico de flush-on-close. Documentado en docs/pending/features/F10-confirm-quit-proceso-vivo.md. El fork ya cubre el caso por-pane (useTabCloseGuards).
- Parte saltada de 4a6d803: la mitad frontend (App.tsx + useWorkspaceSwitcher + src/modules/spaces/*) esta acoplada al modelo de spaces, que el fork no tiene. Solo se extrajo la parte Rust (workspace.rs + pty/mod.rs), valiosa de forma independiente.
- Dependabot: bump de actions/checkout v6 -> v7 en los 3 workflows del fork (ci, release, signpath-test; el upstream tocaba ademas update-nix-sources.yml, ausente aqui). Resto re-derivado nativamente con pnpm update + cargo update (dentro de rangos semver), no cherry-pick; coincide con los grupos no-AI de los dependabot (codemirror lint/merge/view, hugeicons, radix, tauri/api, biome 2.5.0, tailwind, vitest, knip, shadcn, etc.).
- Quality suite: pnpm check-types OK, biome lint sin issues, 437 tests JS (425 base + 6 resolveEditorTheme + 6 OSC 52), cargo clippy limpio, 263 tests Rust (260 base + 3 spawn_cwd_or_home).
- Changes skipped (removed surface): sin cambios nuevos respecto al rango anterior; el unico commit nuevo del rango (8043cfa) se aplico.

#### 2026-06-24

- Upstream HEAD: d77476e762b8ade438c643061723b9f494213600
- Commits revisados: 8043cfa106f7de9ee182b3dbd051e35cd2f1b273..d77476e762b8ade438c643061723b9f494213600 (10 commits reales, 0 merges)
- Outcome: work plan creado en docs/upstream-2026-06-24.md y ejecutado
- Changes applied (Bucket B): fix(breadcrumb) scroll horizontal (6963d82, cherry-pick limpio); fix(window) allow-destroy permission ya presente en el fork (414ee17, no action)
- Changes applied (Bucket C): font weight terminal (9fc0425, merge manual); shell selector (a770307, merge manual); language override por panel con selector UI en EditorOverlayBar (d77476e, merge manual + reimplementacion UI)
- Changes skipped (removed surface): Nix sources (564e145); version bump v0.8.2 (63099f5); npm dep bumps (db63229); AI autocomplete endpoints (a8b9481 -- superficie eliminada); quit-on-last-tab (7a812ca -- modelo de tabs eliminado en Phase 2)
- Bonus (no upstream): HTML preview para archivos .html con injectBase para paths relativos; markdown live preview refactor (seeding de liveContent via onContentChange); undo-close-tab design spec (F5); editor.save shortcut global; toggle HTML preview shortcut; terminalNewFolderMode setting: "Open new terminals in" select in Terminal settings, with "Current folder" (inherits from active terminal cwd or editor file parent dir) and "Workspace folder" (always uses workspace root).
- New features rejected: ninguna
- Quality suite: biome lint sin issues, pnpm check-types OK, 517 tests JS (49 archivos; +6 resolveDisplayName, +1 git-bash OSC 7, +3 coerceFontWeight), cargo clippy limpio, 273 tests Rust (+6 shell_init unix/windows).
