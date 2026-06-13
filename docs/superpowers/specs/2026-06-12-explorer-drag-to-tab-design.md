# Explorer Drag-to-Tab Design

Date: 2026-06-12

## Overview

Files in the explorer panel can be dragged onto any pane drop zone or between tabs to open them
in that position. The drag experience is visually identical to dragging tabs between panes:
same overlay, same drop zone indicators, same split behavior.

## Architecture

The `DndContext` is elevated out of `WorkspaceView.tsx` into a new `WorkspaceDndProvider`
component that wraps both the workspace and the right panel (where the explorer lives).

```
App.tsx
└── WorkspaceDndProvider       (new) DndContext + drag state + handlers
    ├── FileExplorer panel     TreeRow uses useDraggable
    └── WorkspaceView          receives draggingItem as prop, no longer owns DndContext
        └── PaneView           drop zones unchanged
```

The drag state discriminates between two drag types:

```typescript
type DraggingItem =
  | { kind: 'panel'; panel: Panel; workspaceId: string }
  | { kind: 'file'; path: string };
```

`WorkspaceView` no longer owns the `DndContext`, `DragOverlay`, or drag handlers. It receives
`draggingItem: DraggingItem | null` as a prop so `PaneView` can activate drop zones for both
drag types.

## Explorer changes (TreeRow)

Only files are draggable, not directories.

```typescript
const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
  id: `file:${entry.path}`,
  disabled: entry.type === 'directory',
  data: { path: entry.path },
});
```

- `setNodeRef` + `listeners` + `attributes` applied to the row root element.
- `isDragging`: apply `opacity-50` to the row, same as tabs during drag.
- No changes to click, double-click, or context menu behavior.

## Drop logic

`handleDragEnd` in `WorkspaceDndProvider` identifies the drag type by the `active.id` prefix:
- `file:` prefix: file drag from explorer.
- Any other ID: panel drag (existing behavior, unchanged).

For file drags, the handler first checks whether a panel with that path is already open in the
active workspace:

**File already open:**
The existing panel is treated exactly like a tab being dragged. Its `panelId` is used directly
with the existing move/reorder/split operations. The tab moves to wherever the user dropped it.

**File not open:**
A new permanent editor panel is created at the drop target.

### Drop target handling

| Drop target | File already open | File not open |
|---|---|---|
| `zone:paneId:center` | `movePanel(wsId, panelId, paneId)` | `openPanel(wsId, paneId, editorPanel)` |
| `tab-insert:panelId:before/after` | `movePanel` or `reorderPanel` with index | `openPanel` at index |
| `zone:paneId:top/bottom/left/right` | `splitPaneAndPlace(wsId, paneId, dir, panelId)` | `splitPaneAndOpenFile(wsId, paneId, dir, path)` |

`splitPaneAndOpenFile` is a new function in `splitNode.ts` and `useWorkspaces` that performs
a split and inserts a freshly created editor panel into the new sub-pane in a single operation,
without requiring the panel to pre-exist.

All opened panels have `preview: false` (permanent tab) since the user performed an explicit
drag action.

## DragOverlay

The existing `DragOverlay` is extended to handle both drag types:

```typescript
{draggingItem?.kind === 'panel' && (
  // existing: icon + panel title
)}
{draggingItem?.kind === 'file' && (
  // same style: file icon + basename(path)
)}
```

Visual output is identical in both cases: a small pill with icon and name following the cursor.

## WorkspaceView changes

- Remove: `DndContext`, `DragOverlay`, `useSensors`, drag state, all drag handlers.
- Add: `draggingItem: DraggingItem | null` prop.
- `PaneView` receives `isDragging: boolean` derived from `draggingItem !== null` (unchanged API
  surface for PaneView itself).

## New artifacts

| Artifact | Description |
|---|---|
| `src/modules/workspaces/WorkspaceDndProvider.tsx` | New component; owns DndContext, drag state, handlers, DragOverlay |
| `splitPaneAndOpenFile` in `splitNode.ts` | Pure function: split tree + insert new editor panel |
| `splitPaneAndOpenFile` in `useWorkspaces.ts` | Hook method wrapping the pure function |

## Out of scope

- Dragging directories (not supported; useDraggable is disabled for directory rows).
- Dragging multiple files at once.
- Drag from OS file manager into the app (separate feature, different mechanism).
