# Workspaces — rendering, terminal pool, and lifecycle

This document covers the internal mechanics of the Workspace/Pane/Panel model: how the render tree
is structured, how terminal slots are managed, and what happens when panels are shown or hidden.

For bugs and gotchas discovered in production, see [WORKSPACES_GOTCHAS.md](WORKSPACES_GOTCHAS.md).
For the high-level user-facing overview, see [ARCHITECTURE.md](ARCHITECTURE.md) sections 3.1 and 4.1.

---

## Data model

Three levels of hierarchy, all owned by `useWorkspaces` in `src/modules/workspaces/lib/useWorkspaces.ts`:

```
Workspace           — a named environment (local or WSL distro)
  └── paneTree      — a binary split tree of SplitNode
        ├── SplitNode (kind: "split") — horizontal or vertical split with a dividerPosition
        │     ├── first: SplitNode
        │     └── second: SplitNode
        └── SplitNode (kind: "pane") — leaf; holds a tab strip
              ├── panels: Panel[]    — the tabs
              └── activePanelId      — which tab is shown
```

A `Panel` is a tagged union on `kind`: `terminal` | `editor` | `browser` | `markdown` |
`git-diff` | `git-history` | `git-commit-file`. All kinds share `id`, `title`; each kind carries
its own extra fields (e.g., `cwd`, `runningCommand`, `dirty`).

`editor` and `markdown` panels also carry an optional `explorerRoot`: the folder the explorer and
git context jump to while that tab is active. It is captured when the file is opened
(`resolveOpenRoot` in `lib/explorerRoot.ts`: the current explorer root if the file is inside it,
otherwise the file's parent dir) and consumed by `resolveActiveExplorerRoot`, which the App's
`explorerRoot` memo uses to override the terminal-derived ambient root. Optional for backward
compatibility: a panel without it falls back to the file's parent dir (or the ambient root for
non-file panels).

State is persisted per-window to `workspaces.json` via the `window_save_workspace_state` IPC
command, debounced 800ms on every mutation. Each window reads its own saved state on mount via
`window_get_state`. The Rust side stores `workspaces` as an untyped `serde_json::Value`
(`window_state.rs`), so any panel field added on the frontend (such as `explorerRoot`) round-trips
through save and restore without a Rust-side schema change or migration. Window size is restored
via `restore_window_geometry` IPC called from `main.tsx` before `show()`. Window position is not
restored (see [WORKSPACES_GOTCHAS.md](WORKSPACES_GOTCHAS.md)). The workspace sidebar (52px, left
edge) lists workspaces; clicking switches `activeWorkspaceId`.

---

## Render tree

```
WorkspaceDndProvider    — DndContext wrapper; owns all drag state, handlers, and DragOverlay
  ├── Explorer panel    — TreeRow uses useDraggable for file drag (files only, not directories)
  └── WorkspaceView     — one per active+inactive workspace (absolute inset-0)
        └── SplitNodeView     — recursive: renders split groups as ResizablePanelGroup, leaves as PaneView
              └── PaneView    — one pane: tab bar + panel content area + drag drop zones
                    ├── PaneTabBar        — tab strip with DraggableTab per panel
                    └── PanelContent      — switches on panel.kind; mounts terminal, editor, etc.
```

A `browser` panel with `floating: true` is a special case: `PanelContent` renders a placeholder
(address bar plus "Dock here" / "Focus window" buttons) instead of the iframe, because the page
lives in a native `WebviewUrl::External` window. The float/dock/navigate callbacks are threaded
from `App.tsx` down through `WorkspaceView` → `SplitNodeView` → `PaneView` → `PanelContent` to
`BrowserPane`; see `docs/FORK.md` (Floating browser windows).

**All workspaces are always mounted.** Inactive workspaces are hidden with `opacity-0 invisible`
CSS — they are never removed from the React tree. This is required to keep PTYs streaming and
editor state alive.

**All panels within a pane are always mounted.** Inactive tabs within a pane are hidden with
`invisible pointer-events-none`. Same reason: the xterm instance and its PTY must survive tab
switches.

The `visible` prop passed to `PanelContent` (and ultimately to `useTerminalSession`) is:

```tsx
visible={panel.id === pane.activePanelId && isWorkspaceActive}
```

Both conditions must be true. This drives whether the terminal session holds a renderer slot
(see below). `isWorkspaceActive` was added to prevent inactive workspace panels from keeping
their WebGL contexts permanently — see [WORKSPACES_GOTCHAS.md](WORKSPACES_GOTCHAS.md).

---

## Terminal session lifecycle

Every terminal panel has a long-lived session object in `sessions: Map<string, Session>` inside
`useTerminalSession.ts`. The session owns the PTY connection but not the renderer. The renderer
is a separate "slot" from the pool.

### Session state

Key fields of a `Session`:

| Field | Meaning |
|---|---|
| `pty` | Live PTY handle (`portable-pty` connection via Tauri channel) |
| `hasSlot` | Whether a renderer slot is currently bound |
| `snapshot` | ANSI snapshot of the last renderer state (captured on unbind) |
| `dormantRing` | Ring buffer for bytes received while no slot is bound |
| `altScreenAtRelease` | Whether the terminal was in alt-screen (TUI mode) when last unbound |
| `visibleNow` / `focusedNow` | Current visibility/focus state |

### Visible vs. hibernated

When `visible` becomes **true**:
- If no slot is bound yet: `bindLeafToSlot` → `acquireSlot` (pool assigns a slot, replays snapshot
  + dormant ring)
- If slot already bound: `refreshLeafSlot` (re-attaches WebGL if needed, forces repaint)

When `visible` becomes **false**:
- **Normal mode**: `unbindLeafFromSlot` → releases slot back to pool; state serialized as snapshot
- **Alt-screen or blocks mode**: `parkLeafSlot` → disposes only the WebGL addon, slot stays bound;
  the xterm instance keeps receiving data (TUI apps emit incremental cursor-positioned updates that
  can't be replayed coherently from a snapshot — a SIGWINCH kick on re-show forces a full repaint)

### Hibernation (dormant ring)

While a session has no slot, incoming PTY bytes go into `DormantRing` (256 chunks / 256 KB cap).
On slot re-acquisition, `drainRing` replays them into xterm. If the cap is exceeded, old chunks
are dropped and the message `[kex: dropped output during hibernation]` is prepended on drain.

The PTY process itself is never paused — the OS shell keeps running and output keeps arriving;
only the rendering is deferred.

---

## Renderer slot pool (`rendererPool.ts`)

xterm.js instances are expensive to create and each carries a WebGL context. The pool manages a
fixed set of reusable `Slot` objects so that switching panels does not destroy and recreate
renderers.

### Slot lifecycle

```
createSlot()
    │  new Terminal + FitAddon + SearchAddon + SerializeAddon + WebLinksAddon
    │  host div appended to off-screen recycler
    ▼
acquireSlot(params)
    │  find free slot (currentLeafId === null) or createSlot()
    ▼
bindSlot(slot, params)
    │  move host div into the pane container
    │  clear + reset terminal, replay snapshot + dormant ring
    │  setupResizeObserver, fitAddon.fit()
    │  scheduleUnhide (2× rAF: render first, then show + attach WebGL)
    ▼
[slot in use: currentLeafId set, data flows directly to term.write()]
    ▼
detachSlotFromLeaf(slot)         ← called by releaseSlot (unbind path)
    │  serialize snapshot via SerializeAddon (up to SNAPSHOT_SCROLLBACK_CAP = 5000 lines)
    │  move host div back to recycler
    │  currentLeafId = null
    │  scheduleWebglReap(WEBGL_REAP_GRACE_MS = 30s)
    │  scheduleSlotReap(SLOT_REAP_GRACE_MS = 45s)
    ▼
[idle slot: available for reuse by pickSlotFor()]
    ▼
reapIdleSlot()        ← fires after SLOT_REAP_GRACE_MS if still idle
    │  if idle.length > IDLE_SLOTS_KEEP_WARM (1): disposeSlot
    ▼
disposeSlot()         ← term.dispose(), host.remove(), splice from slots[]
```

The grace periods exist so that quick panel switches (e.g., Cmd+1 / Cmd+2 / Cmd+1 in rapid
succession) reuse the same warm slot without destroying and recreating it.

`IDLE_SLOTS_KEEP_WARM = 1`: at most one idle slot keeps its xterm instance alive after the reap
timer fires. Additional idle slots are disposed.

### WebGL context management

Each slot optionally has a `WebglAddon` (one WebGL context). WebGL is attached in `scheduleUnhide`
when the slot is stale (`> SLOT_STALE_MS = 10s` since last use) or newly created.

WebGL is disposed:
- Immediately: via `parkLeafSlot` (visibility change for alt-screen/blocks panels)
- After grace: via `scheduleWebglReap` at WEBGL_REAP_GRACE_MS = 30s after a slot becomes idle

**Context limit.** WKWebView (Tauri/macOS) allows roughly 8-16 concurrent WebGL contexts. Exceeding
the limit causes the browser to silently destroy the oldest context (`onContextLoss`). The pool
enforces `WEBGL_MAX_CONTEXTS = 7` as a proactive guard: before calling `new WebglAddon()`, it
checks the live context count and reaps the oldest idle slot's WebGL if needed. If all contexts
are in active slots, the attach is skipped (that slot falls back to the DOM renderer, which is
slower but functionally equivalent).

Context recovery: `onContextLoss` disposes the addon and schedules a retry at
`WEBGL_RECOVERY_DELAY_MS = 250ms`. This handles sleep/wake GPU resets.

### Context count in practice

With the `visible = … && isWorkspaceActive` fix, only the active workspace's active panels hold
live WebGL contexts. Within a pane, only the active tab is visible. So:

```
active WebGL contexts ≈ number of panes in the active workspace
```

Switching workspaces releases the old workspace's slots (WebGL disposed after 30s) and acquires
new ones for the new workspace. The pool's warm slot (`IDLE_SLOTS_KEEP_WARM = 1`) means the first
re-shown terminal after a workspace switch may reuse the still-warm slot.

---

## Tab bar overflow scroll

When a pane has many panels and is narrow, tabs overflow the `PaneTabBar`. Two scroll behaviors keep
the active tab visible:

- **Active tab auto-scroll**: whenever `activePanelId` changes, the container scrolls the minimum
  amount to bring the active tab into view (`scrollBy` with `behavior: 'auto'`). Skipped if the
  user is currently browsing with the wheel (see below).
- **Wheel scroll with snap-back**: the container registers a native (non-React) `wheel` listener
  with `{ passive: false }` so `preventDefault()` can suppress vertical page scroll and redirect
  the delta to `scrollLeft`. After 800 ms of wheel idle, a debounced callback scrolls the active
  tab back into view with `behavior: 'smooth'`. The listener is native (not a React `onWheel`) to
  guarantee `passive: false`; React synthetic wheel events are passive and cannot call
  `preventDefault()` reliably in WebKit/Tauri.

---

## Drag-and-drop (panel reordering, splitting, and file open)

Drag-and-drop uses `@dnd-kit/core` v6.3.1. The `DndContext` lives in `WorkspaceDndProvider`
(`WorkspaceDndProvider.tsx`), which wraps both the explorer panel and the workspace area so
that file drags from the explorer can target pane drop zones.

### Drag item type

```typescript
type DraggingItem =
  | { kind: 'panel'; panel: Panel; workspaceId: string }
  | { kind: 'file'; path: string };
```

`WorkspaceDndProvider` exposes `{ draggingItem, tabInsertPaneId }` via `useWorkspaceDnd()`.
`WorkspaceView` reads from this context instead of owning drag state directly.

### Components

- `DraggableTab` (`PaneTabBar.tsx`): `useDraggable({ id: panel.id })`, `PointerSensor` with
  `activationConstraint: { distance: 6 }`. Requires `touch-action: none` (`touch-none` class) to
  prevent WebKit from claiming the initial pointer movement as a scroll gesture and issuing
  `pointercancel` before the 6px threshold is reached.
  Each `DraggableTab` also registers two `useDroppable` zones on its left and right halves:
  `tab-insert:<panelId>:before` and `tab-insert:<panelId>:after`. Both are `disabled` when no
  drag is active (`disabled: !isDragging`) to avoid idle collision overhead.
- `InsertionGap` (`PaneTabBar.tsx`): a `w-0 -mx-[1px] shrink-0` flex item rendered between every
  pair of tabs (and before the first / after the last). When the drag pointer is over a
  `tab-insert:` zone belonging to this pane, `useDndMonitor` sets `insertionIndex` and the
  corresponding gap renders a 2px `bg-primary` vertical line indicating the insertion point.
- `DropZone` (`PaneView.tsx`): `useDroppable` per zone. Zones are rendered only during an active
  drag. The set of zones depends on the target pane's pixel dimensions, read from a `ResizeObserver`
  and compared against `paneSplitLimit` (configurable in `kex-settings.json`, default
  `{ width: 250, height: 250 }`):
  - **width < limit AND height < limit**: only `center`, covering the full pane (`inset-0`).
  - **width < limit only**: `top`, `bottom`, `center` — horizontal splits disabled.
  - **height < limit only**: `left`, `right`, `center` — vertical splits disabled.
  - **both within limit**: full 5-zone layout (top, bottom, left, right, center).
  In all cases `center` expands its hit area to fill any gap left by absent directional zones.
  Each zone is two separate divs: an invisible hit area and a larger visual highlight
  (`pointer-events-none`) that covers the half of the pane in the split direction
  (top/bottom → top or bottom half; left/right → left or right half; center → full pane with
  `rounded-md`). The center zone also accepts a `forceOver` prop: when the drag pointer is over a
  `tab-insert:` zone in a different pane, `WorkspaceView` sets `tabInsertPaneId` which flows through
  `SplitNodeView` to `PaneView`, forcing the center zone highlight on the target pane to signal that
  the tab will move there.
  Drag-drop splits are also blocked when the workspace already has `workspacePaneLimit` panes
  (configurable in `kex-settings.json`, default `8`).
- `DragOverlay` (`WorkspaceDndProvider.tsx`): lightweight floating chip showing panel icon + title
  for tab drags, or a file icon + basename for file drags. `dropAnimation: null` to avoid fighting
  the layout reflow on drop.
- `TreeRow` (`explorer/TreeRow.tsx`): `useDraggable({ id: 'file:<path>' })` — only enabled for
  files, not directories. Applies `opacity-50` during drag, same as `DraggableTab`.

### Drop resolution (`handleDragEnd` in `WorkspaceDndProvider.tsx`)

The handler first classifies the drag by the `active.id` prefix: `file:` means a file drag from
the explorer; any other ID is a panel (tab) drag.

**Panel drag** — two zone ID formats:

`tab-insert:<panelId>:before|after` - tab border drop zones for positional insertion:
- `before`: insert at `indexOf(panelId)` in the target pane
- `after`: insert at `indexOf(panelId) + 1`
- Same pane: `reorderPanel(workspaceId, panelId, insertionIndex)` — reorders tabs using
  `arrayMove`; dropping before or after the dragged tab itself is a noop
- Different pane: `movePanel(workspaceId, panelId, targetPaneId, insertionIndex)` — moves tab to
  the target pane at the given position; source pane auto-collapses if it becomes empty

`zone:<paneId>:<direction>` - pane-level drop zones:
- `center`: `movePanel(sourceWorkspaceId, panelId, targetPaneId)` — moves tab to end of another pane
- directional zones: `splitPaneAndPlace(sourceWorkspaceId, targetPaneId, direction, panelId)` —
  splits the target pane and places the dragged panel in the new half

**File drag** — the handler checks whether a panel with that path is already open in the active
workspace. If it is, the existing panel is treated as a panel drag (move/reorder) so the tab moves
to the drop location. If it is not open:

| Drop target | Action |
|---|---|
| `zone:<paneId>:center` | `openPanel(wsId, paneId, editorPanel)` — appends permanent editor tab |
| `tab-insert:<panelId>:before\|after` | `openPanel(wsId, paneId, editorPanel, index)` — inserts at position |
| `zone:<paneId>:top\|bottom\|left\|right` | `splitPaneAndOpenFile(wsId, paneId, dir, path)` — splits pane, opens file in new sub-pane |

All file-drag panels have `preview: false` (permanent tab) because the drag is an explicit intent.
`splitPaneAndOpenFile` uses `splitPaneAndInsertPanel` (pure function in `splitNode.ts`) to perform
the split and new-panel insertion atomically in a single state update.

Both zone types coexist. Tab-border zones take priority when the pointer is over a tab bar (they are
physically smaller and registered on top). Pane zones handle the content area and pane borders.

Cross-workspace drops are blocked: the target pane is validated to belong to the same workspace as
the source panel before any mutation.

---

## Resize handles (`resizable.tsx`)

`react-resizable-panels` registers a `document` capture-phase `pointerdown` listener that calls
`e.preventDefault()` when the pointer is within the resize handle hit region. The minimum hit
region is 10px. With a 1px separator, the library expands the hit region by ~4.5px into adjacent
panes.

The horizontal separator is explicitly set to `h-[10px]` with a transparent background and a 1px
visual line via `::after`. At exactly 10px, no expansion occurs and the hit region ends at the
pane boundary. This prevents WebKit from suppressing `click` events on the tab bar of the pane
below — the original root cause of intermittent tab clicks failing on bottom panes.

See [WORKSPACES_GOTCHAS.md](WORKSPACES_GOTCHAS.md) for the full investigation.
