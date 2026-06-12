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
- **Workspace auto-close** — closing the last panel in a workspace closes the workspace itself (unless it is the last
  workspace).
- **Directional pane focus shortcuts** — `Cmd+Ctrl+Arrow` (Mac) / `Ctrl+Alt+Arrow` (non-Mac) moves focus to the
  geometrically adjacent pane in the given direction. Uses `findPaneInDirection` (spatial scoring on DOM rects: closest
  pane wins, tie-broken by perpendicular overlap). Hard stop at borders; no wrap-around. Replaces the old cyclic
  `Cmd+[` / `Cmd+]` shortcuts.

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
- `native.ts` moved from `src/modules/terminal/` to `src/lib/native.ts` — shared across all modules.

---

## Roadmap (planned, not yet built)

These phases are designed but not fully implemented:

- **Phase 3 — Persistent terminal sessions** — a tmux daemon per workspace that keeps shell sessions alive across Terax
  restarts. Panels restore with their full scrollback and running processes intact.
- **Phase 4 — Drag-and-drop panel management** — drag panels between panes (5-zone drop: top / bottom / left / right /
  center), drag workspaces to reorder the sidebar, drag panels to other workspaces. Infrastructure (dnd-kit, stable
  UUIDs, `movePanel` / `splitPaneAndPlace` operations) is already in place; the full drop UX is in progress.
- **Multi-window workspace migration** — workspaces can be dragged from one window's sidebar to another window's
  sidebar. Requires a Tauri event protocol (`terax:workspace-transfer`) that transfers the workspace entity by ID across
  WebView instances.
