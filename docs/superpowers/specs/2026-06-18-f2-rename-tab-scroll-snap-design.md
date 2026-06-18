# Spec: F2 Rename, Tab Hover Rename, Scroll Lock, Snap

**Date:** 2026-06-18

## Overview

Four coordinated features around renaming and tab scroll behavior:

1. F2 in the Explorer renames the selected file or folder
2. Hover card on editor/markdown tabs shows a rename button; F2 globally triggers the same tab-rename popup
3. Tab bar scroll is blocked while any hover card or rename popup is open
4. Right-clicking or hovering a partially-visible tab snaps it fully into view

---

## Feature 1: F2 in Explorer

### What

Pressing F2 when the Explorer has keyboard focus and a file or folder is selected triggers inline rename, identical to double-clicking a file.

### How

**File:** `src/modules/explorer/FileExplorer.tsx`

Add `case "F2"` to the existing `handleKeyDown` switch. Guard conditions already present (`tree.renaming`, `tree.pendingCreate`, `isSearchOpen`, input/textarea targets) apply before the switch, so no extra guards needed.

```
case "F2":
  if (currentIdx < 0) return;
  e.preventDefault();
  actions.beginRename(entryPaths[currentIdx]);
  break;
```

Applies to both files and directories (matches VS Code and OS conventions). The double-click on `EntryRow` only fires for files (`!isDir`), but F2 rename for directories is desirable and already supported by `beginRename`.

### Conflict avoidance

No global shortcut currently uses `F2`. Feature 2 adds F2 to `tab.rename`, but includes an `isDisabled` guard that prevents the global handler from firing when the Explorer has focus, so the local `handleKeyDown` receives the event.

---

## Feature 2: Rename button in tab hover + F2 global shortcut

### 2a. Rename button in hover card

**File:** `src/modules/workspaces/PaneTabBar.tsx`

**HoverRow**: add optional `action?: { icon: ReactNode; label: string; onClick: () => void }` prop. When present, render a 16x16 icon button after the copy button, using the same style (opacity-0 / group-hover:opacity-100, `text-muted-foreground hover:text-foreground`). Icon: `PencilEdit01Icon` from `@hugeicons/core-free-icons`, size 11, strokeWidth 1.9.

**FilePathLines**: add optional `onRename?: () => void` prop. Pass it as `action` to the "Filename" `HoverRow` only.

**EditorHoverContent**: accept and forward `onRename?: () => void` to `FilePathLines`.

**DraggableTab**: for `panel.kind === "editor"` and `panel.kind === "markdown"`, build the `onRename` callback:

```typescript
const handleRenameFromHover = useCallback(() => {
  setHoverOpen(false);
  startRename(panel.id);
}, [panel.id, startRename]);
```

Pass it to `EditorHoverContent`. No rename button on terminal, preview, git-diff, git-history, or git-commit-file tabs.

### 2b. F2 as additional binding for tab.rename

**File:** `src/modules/shortcuts/shortcuts.ts`

```typescript
{
  id: "tab.rename",
  ...
  defaultBindings: [{ [MOD_PROP]: true, key: "r" }, { key: "F2" }],
}
```

The existing `tab.rename` handler in App.tsx already calls `useTabRenameStore.getState().startRename(activePanelId)` with an input-element guard, so no changes needed there.

### 2c. isDisabled guard for Explorer focus

**File:** `src/app/components/RightPanel.tsx`

Add `isExplorerFocused: () => boolean` to `RightPanelHandle`:

```typescript
export type RightPanelHandle = {
  focusExplorer: () => void;
  toggleExplorerSearch: () => void;
  isExplorerFocused: () => boolean;
};
```

In `useImperativeHandle`:

```typescript
isExplorerFocused: () => explorerRef.current?.isFocused() ?? false,
```

**File:** `src/app/App.tsx`

In the `shortcutsDisabled` callback:

```typescript
if (id === "tab.rename") {
  return rightPanelRef.current?.isExplorerFocused() ?? false;
}
```

This lets the Explorer's local `handleKeyDown` receive F2 when it has focus. When the Explorer is not focused, the global shortcut fires normally.

---

## Feature 3: Block tab scroll when hover or rename is open

### What

Wheel events on the tab bar do nothing (no scrolling) while any tab's hover card is open or the rename popup is active.

### How

**File:** `src/modules/workspaces/PaneTabBar.tsx`

**Track hover state:**

Add `onHoverChange?: (panelId: string, open: boolean) => void` prop to `DraggableTab`. In `DraggableTab`, call it inside the `HoverCard.onOpenChange` handler:

```typescript
onOpenChange={(o) => {
  if (!o && pointerInsideRef.current) return;
  setHoverOpen(o);
  onHoverChange?.(panel.id, o);
}}
```

In `PaneTabBar`, maintain a `hoverOpenPanelsRef = useRef(new Set<string>())`. Pass callback:

```typescript
onHoverChange={(panelId, open) => {
  if (open) hoverOpenPanelsRef.current.add(panelId);
  else hoverOpenPanelsRef.current.delete(panelId);
}}
```

**Track rename state:**

```typescript
const renamingPanelId = useTabRenameStore((s) => s.renamingPanelId);
const isRenamingRef = useRef(false);
useEffect(() => { isRenamingRef.current = renamingPanelId !== null; }, [renamingPanelId]);
```

**Wheel handler guard:**

```typescript
if (hoverOpenPanelsRef.current.size > 0 || isRenamingRef.current) {
  e.preventDefault(); // prevent browser-level scroll, but don't scroll tabs
  return;
}
```

`e.preventDefault()` is still called so the page doesn't scroll unexpectedly.

---

## Feature 4: Snap tab into view on right-click and hover

### What

When a tab is partially scrolled out of view and the user right-clicks it (context menu) or hovers over it (hover card opens), the tab bar scrolls to make that tab fully visible.

### How

**File:** `src/modules/workspaces/PaneTabBar.tsx`

Extract a generalized `scrollPanelIntoView(panelId, behavior)` function from the existing `scrollActiveIntoView`:

```typescript
const scrollPanelIntoView = useCallback(
  (panelId: string, behavior: ScrollBehavior = 'smooth') => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const tab = container.querySelector<HTMLElement>(`[data-panel-id="${panelId}"]`);
    if (!tab) return;
    const cr = container.getBoundingClientRect();
    const tr = tab.getBoundingClientRect();
    if (tr.left < cr.left) {
      container.scrollBy({ left: -(cr.left - tr.left + 4), behavior });
    } else if (tr.right > cr.right) {
      container.scrollBy({ left: tr.right - cr.right + 4, behavior });
    }
  },
  [],
);
```

Keep `scrollActiveIntoView` as a thin wrapper: `scrollPanelIntoView(activePanelIdRef.current ?? '', behavior)`.

Pass `onSnapIntoView: (panelId: string) => void` prop to each `DraggableTab`. In `DraggableTab`:

- **Context menu**: `<ContextMenu onOpenChange={(o) => { if (o) { setHoverOpen(false); onSnapIntoView(panel.id); } }}>`
- **Hover card**: inside the `HoverCard.onOpenChange`, when `o === true` → `onSnapIntoView(panel.id)`

The snap does NOT set `userScrolledRef.current = true`; it is system-initiated and should not suppress the active-tab auto-scroll behavior.

---

## Files changed

| File | Change |
|---|---|
| `src/modules/explorer/FileExplorer.tsx` | Add F2 case to handleKeyDown |
| `src/modules/shortcuts/shortcuts.ts` | Add `{ key: "F2" }` binding to tab.rename |
| `src/app/components/RightPanel.tsx` | Expose `isExplorerFocused()` via handle |
| `src/app/App.tsx` | Add isDisabled guard for tab.rename + F2 |
| `src/modules/workspaces/PaneTabBar.tsx` | Rename button in hover, scroll lock, snap logic |

---

## Edge cases

- **Rename already open**: F2 pressed while rename popup is showing has no effect (input is focused, the global shortcut guard for inputs already prevents it).
- **Explorer hidden**: if the right panel is closed, `isExplorerFocused()` returns false, so F2 fires tab rename globally (correct).
- **Multiple hover cards**: the `hoverOpenPanelsRef` Set handles the case of two tabs briefly both in hover state during quick mouse movement.
- **Snap + active auto-scroll**: snap is smooth and uses `scrollBy`, not `scrollLeft =`; it does not interfere with active-tab tracking since it doesn't set `userScrolledRef`.
- **Rename button on git-diff / git-commit-file**: not shown. These panels have a title (the filename) that comes from git metadata, not user-editable. The existing `onRenamePanel` prop still lets users rename them via context menu if desired.
