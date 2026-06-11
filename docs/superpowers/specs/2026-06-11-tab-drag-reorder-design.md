# Tab drag: reorder and cross-pane insertion

**Date:** 2026-06-11
**Status:** Approved

## Summary

Tabs can be dragged to reorder within the same pane and to move to a specific position in another pane. Drop zones are the left and right halves of each tab, which indicate "insert before" and "insert after" respectively. A thin vertical line marks the insertion point. The existing large pane drop zones (top/bottom/left/right/center) are unchanged and continue to create splits or move tabs to the end of a pane.

## Scope

- Same-pane reordering: drag a tab to a different position within the same pane tab bar.
- Cross-pane insertion: drag a tab to a specific position in another pane's tab bar.
- Visual indicator: 2px vertical line at the insertion gap.
- Cross-pane visual: center drop zone of the target pane highlights while hovering a tab border in that pane.
- Auto-collapse: if dragging the last tab out of a pane, the source pane collapses (existing behavior, unchanged).
- Coexistence: tab-border drop zones and large pane drop zones both work; tab-border zones never create splits.

## Out of scope

- Drag between workspaces.
- Touch/stylus input (same as today - PointerSensor with distance:6 constraint).

---

## Section 1: Data layer

### `splitNode.ts`

No changes needed. `movePanelBetweenPanes(tree, panelId, targetPaneId, targetIndex?)` already accepts an optional insertion index.

### `useWorkspaces.ts`

**`movePanel`** gains an optional `targetIndex?: number` parameter and passes it to `movePanelBetweenPanes`. This covers moving a tab to a specific position in another pane.

**`reorderPanel(workspaceId, panelId, targetIndex)`** - new function for same-pane reordering. Uses `arrayMove` (already imported from `@dnd-kit/sortable`) on `pane.panels` via `updatePane`. Noop if `panelId` is not found or `targetIndex` resolves to the same position.

Noop cases (inserting before or after the dragged tab itself within the same pane) are detected before mutating state and return early.

---

## Section 2: Drop zone IDs and detection

### Zone ID format

Each tab exposes two droppable zones:

- `tab-insert:<panelId>:before` - left half of the tab (insert before this panel)
- `tab-insert:<panelId>:after` - right half of the tab (insert after this panel)

These coexist with `zone:<paneId>:<direction>` IDs without conflict. Collision detection remains `pointerWithin` (unchanged). The `tab-insert:` zones are physically smaller (overlaid on tabs) and take priority over the larger pane zones when the pointer is over a tab bar.

### `handleDragEnd` in `WorkspaceView`

A new branch handles `overId.startsWith("tab-insert:")`:

1. Parse `[, refPanelId, side]` from the over ID.
2. Find the source workspace and pane of the dragged panel (same logic as today).
3. Find the target pane: the pane that contains `refPanelId`.
4. Verify both panes belong to the same workspace (same guard as today).
5. Compute `insertionIndex = panels.indexOf(refPanelId) + (side === "after" ? 1 : 0)`.
6. If same pane: call `reorderPanel(workspaceId, panelId, insertionIndex)`.
7. If different pane: call `movePanel(workspaceId, panelId, targetPaneId, insertionIndex)`.

---

## Section 3: Visual indicator

### `PaneTabBar` - insertion line

`PaneTabBar` uses `useDndMonitor` (available in `@dnd-kit/core`) to subscribe to `onDragOver`, `onDragEnd`, and `onDragCancel` without additional props. Maintains local state `insertionIndex: number | null`.

When `over.id` matches `tab-insert:<panelId>:before/after` and `panelId` belongs to a panel in this pane, `insertionIndex` is updated. For any other over ID (different pane or pane zone), it resets to `null`.

### Layout

The tab list gains gap elements at each insertion position:

```
<gap-0> [tab0] <gap-1> [tab1] <gap-2> [tab2] <gap-3> [+]
```

Each gap is a `div` with `width: 0; overflow: visible` containing an absolutely-positioned 2px line child. The line is visible only when `insertionIndex` matches the gap index. No impact on existing tab layout.

Line styling:

- `tabBarStyle="connected"`: full-height line, `bg-primary`, 2px wide.
- `tabBarStyle="separated"`: slightly shorter, rounded, `bg-primary`.

### Droppable zones in tabs

`DraggableTab` receives `isDragging: boolean` (from `WorkspaceView` state). When `isDragging` is true, it renders two absolutely-positioned `useDroppable` zones:

- Left 50%: `tab-insert:<panelId>:before`
- Right 50%: `tab-insert:<panelId>:after`

When not dragging, no zones are registered, which eliminates any collision overhead.

The dragged tab retains `opacity-40` (existing behavior).

---

## Section 4: Cross-pane visual

When dragging over a tab border in a different pane, the center drop zone of that pane highlights to communicate "this panel will move to this pane" (same visual as hovering the pane center directly).

### Implementation

`WorkspaceView` adds `onDragOver` to `DndContext`. When `over.id` is a `tab-insert:` zone, it finds the pane containing `refPanelId` and stores `tabInsertPaneId: string | null` in state.

This prop flows down: `WorkspaceView -> SplitNodeView -> PaneView`.

In `PaneView`, the center zone treats itself as "isOver" when either:
- Its own `useDroppable.isOver` is true, or
- `tabInsertPaneId === paneId`.

The source pane receives no special visual treatment.

---

## Files to change

| File | Change |
|------|--------|
| `src/modules/workspaces/lib/useWorkspaces.ts` | Add `reorderPanel`; add `targetIndex` param to `movePanel` |
| `src/modules/workspaces/WorkspaceView.tsx` | Handle `tab-insert:` in `handleDragEnd`; add `onDragOver`; pass `tabInsertPaneId` down; pass `isDragging` to tab bars |
| `src/modules/workspaces/SplitNodeView.tsx` | Forward `tabInsertPaneId` prop |
| `src/modules/workspaces/PaneView.tsx` | Accept and use `tabInsertPaneId` for center zone; pass `isDragging` to `PaneTabBar` |
| `src/modules/workspaces/PaneTabBar.tsx` | Add `useDndMonitor`; add gap/line elements; add droppable half-zones in `DraggableTab` |

## Props to add

**`UseWorkspacesReturn`**: `reorderPanel`, updated `movePanel` signature.

**`WorkspaceView` -> `SplitNodeView` -> `PaneView`**: `tabInsertPaneId: string | null`.

**`PaneView` -> `PaneTabBar`**: `isDragging: boolean`.
