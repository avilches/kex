# Handoff — Phase 2 App.tsx Migration

**Date:** 2026-06-09
**Branch:** `main`
**Worktree:** `/Users/avilches/Work/Proy/Repos/terax-ai`
**Focus of next session:** Complete Task 6 (App.tsx migration from `useTabs` to `useWorkspaces`), then Tasks 7-9 (delete old files, persistence, final validation).

---

## Project overview

Terax is a Tauri 2 + React 19 terminal emulator. This session executed Phases 1 and 2 (partial) of a 4-phase layout redesign:

- **Phase 1 ✅** — 3-column shell layout (WorkspaceSidebar left, content center, RightPanel right/left configurable). 12 commits, pushed.
- **Phase 2 🔄** — New workspace/pane/panel data model replacing the old flat tab system. Tasks 1–5 complete, Task 6 in progress (App.tsx not yet migrated).
- **Phase 3** — tmux daemon + session persistence (not started).
- **Phase 4** — Drag & drop between panes (not started).

---

## Key design decisions (this session)

- `Tab.id` migrated from `number` to UUID string in Phase 1 (prerequisite for cross-window identity).
- Phase 2 replaces `Tab` with a 3-level hierarchy: `Workspace → SplitNode (binary) → Panel[]`.
- Binary split tree (first/second + dividerPosition 0-1) replaces the old N-ary `PaneNode`.
- PTY session keys migrated from `leafId: number` to `Panel.id: string` (UUID).
- All content types (terminal, editor, preview, markdown, git-diff, git-history) can live as panels inside any pane.
- `rightPanelSide: "left" | "right"` preference added (user can swap tool panel side).
- Clean replacement strategy: `useTabs` is deleted, `useWorkspaces` replaces it. App is broken mid-implementation until Task 6 completes — that's intentional and accepted.

---

## Current state

### Completed tasks (Phase 2)

| Task | Commit | Description |
|---|---|---|
| 1 | `70713fc`, `0417f17` | `Workspace`/`SplitNode`/`Panel` types + `splitNode.ts` tree operations + tests |
| 2 | `b8f3d8f` | `useWorkspaces` hook |
| 3 | `8d86b06` | PTY session key migration `leafId:number → panelId:string` |
| 4 | `da350a3` | `PaneTabBar`, `PanelContent`, `PaneView` |
| 5 | `6abca63` | `SplitNodeView`, `WorkspaceView` |

### In progress

**Task 6: App.tsx migration** — `src/app/App.tsx` still uses `useTabs` and `WorkspaceSurface`. No commit yet for this task. The previous subagent attempt was interrupted due to a model access error (tried `claude-opus-4-8` which is not available for this team).

### Pending

- Task 7: Delete old files (`useTabs/`, `panes.ts`, `TerminalStack`, `WorkspaceSurface`, etc.)
- Task 8: Workspace persistence (`tauri-plugin-store`, `terax-workspaces.json`)
- Task 9: Final validation

### Test / type-check status (as of last check)

- `pnpm check-types` — ✅ passes (there are `@ts-ignore` markers in `AgentNotificationsBridge.tsx` as temporary stubs)
- `pnpm test` — ✅ 111 tests pass (15 files)
- `cargo clippy` / `cargo test` — ✅ (last checked after Phase 1)

---

## Key files

### New (Phase 2)

```
src/modules/workspaces/
  lib/
    types.ts            — Workspace, SplitNode, Panel types
    splitNode.ts        — Tree operations: splitPane, removePane, findPane, etc.
    splitNode.test.ts   — 26 tests for tree operations
    useWorkspaces.ts    — Hook replacing useTabs
    panelTitle.ts       — Panel display title/icon derivation
  PaneTabBar.tsx        — Per-pane tab strip
  PanelContent.tsx      — Routes panel to correct content component + PanelCallbacks type
  PaneView.tsx          — Pane = PaneTabBar + PanelContent (never-unmount rule)
  SplitNodeView.tsx     — Recursive binary tree renderer
  WorkspaceView.tsx     — Renders all workspaces (active visible, others invisible)
  index.ts              — Barrel exports
```

### Modified (Phase 1 + 2 prep)

```
src/app/App.tsx                              — Still uses useTabs (Task 6 incomplete)
src/app/components/WorkspaceSidebar.tsx      — 52px left sidebar (Phase 1)
src/app/components/RightPanel.tsx            — Tool panel with Explorer/Git/History (Phase 1)
src/app/components/WorkspaceInputBar.tsx     — activeLeafId is now string | null
src/modules/settings/store.ts               — Added rightPanelOpen/Width/ActiveTab/Side
src/modules/shortcuts/shortcuts.ts          — Replaced sidebar.toggle with rightPanel.toggle
src/modules/terminal/lib/useTerminalSession.ts — Session keys now string
src/modules/terminal/lib/rendererPool.ts    — Slot keys now string
src/modules/terminal/TerminalPane.tsx       — Accepts panelId: string
src/modules/agents/components/AgentNotificationsBridge.tsx — Has @ts-ignore stubs (remove in Task 6)
src/lib/native.ts                           — Added openMainWindow()
src-tauri/src/lib.rs                        — Added open_main_window command
```

---

## What Task 6 needs to do

Replace in `src/app/App.tsx`:
1. `import { useTabs, ... } from "@/modules/tabs"` → `import { useWorkspaces, ... } from "@/modules/workspaces"`
2. `useTabs(...)` → `useWorkspaces({ cwd: launchCwd ?? undefined })`
3. `WorkspaceSurface` → `WorkspaceView` with `PanelCallbacks` object
4. All `tabs`/`activeId`/`activeTab` references → `workspaces`/`activeWorkspaceId`/`activeWorkspace`
5. All `openFileTab`, `openGitDiffTab`, etc. → `openPanel(wsId, paneId, panel)`
6. Shortcut handlers for `pane.splitRight/Down`, `tab.close`, workspace navigation
7. `AgentNotificationsBridge` — remove `@ts-ignore` stubs, adapt to workspaces

Key API to use:

```typescript
// useWorkspaces returns:
{ workspaces, activeWorkspaceId, setActiveWorkspaceId, activeWorkspace,
  addWorkspace, closeWorkspace, splitPane, closePane, focusPane, setPaneDivider,
  openPanel, activatePanel, closePanel, updatePanelData, setTerminalPanelCwd,
  findPanelGlobal, findPaneGlobal }

// WorkspaceView props:
{ workspaces, activeWorkspaceId, onActivatePanel, onClosePanel, onFocusPane,
  onNewTerminal, onDividerChange?, callbacks: PanelCallbacks }

// PanelCallbacks (all optional):
{ onSearchReady, onExit, onCwd, registerTerminalHandle,
  onEditorDirtyChange, onEditorClose, registerEditorHandle,
  onPreviewUrlChange, registerPreviewHandle,
  onOpenCommitFile, onGitHistorySearchHandle }
```

See full plan: `docs/superpowers/plans/2026-06-09-phase2-workspace-pane-model.md`

---

## Lessons learnt

- The `claude-opus-4-8` model is not available for this team. Use `sonnet` (default) or `haiku` for subagents. Attempting opus causes immediate 401.
- Background agents spawned via `/btw` ran ahead of the main session and wrote both the Phase 2 spec and plan before user approval was obtained — acceptable outcome but caused some coordination noise.
- `@ts-ignore` markers were added to `AgentNotificationsBridge.tsx` as temporary stubs for the PTY key migration (Task 3). They must be removed in Task 6 when the agents module is fully adapted.
- The `react-resizable-panels` library in this project does NOT have `onCollapse`/`onExpand` or `order` props — Task 10 implementer had to adapt around this.
- `useSourceControlContext` still expects `sidebarView`/`cycleSidebarView` props even after the sidebar was removed — a stable dummy value was passed.

---

## Suggested skills

```
superpowers:subagent-driven-development   — execute the plan task by task
superpowers:verification-before-completion — run checks before claiming done
superpowers:systematic-debugging          — if Task 6 type errors are complex
```

Start with:
```
/executing-plans   (or subagent-driven-development if you prefer fresh agents)
Plan: docs/superpowers/plans/2026-06-09-phase2-workspace-pane-model.md
Start from: Task 6 (Task 30 in task tracker, currently in_progress)
```

Task tracker IDs: Task 6 = #30, Task 7 = #31, Task 8 = #32, Task 9 = #33.
