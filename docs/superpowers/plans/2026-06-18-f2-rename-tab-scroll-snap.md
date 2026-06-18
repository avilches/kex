# F2 Rename, Tab Hover Rename, Scroll Lock, Snap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add F2 rename to the Explorer and to tabs, a rename button in the editor tab hover card, scroll lock while hover/rename is open, and automatic snap of partially-visible tabs on right-click or hover.

**Architecture:** Five sequential tasks, each touching a distinct concern. Tasks 1-2 set up the shortcut infrastructure. Task 3 wires the rename button into the tab hover card. Tasks 4-5 modify `PaneTabBar` scroll behavior. All changes are confined to 5 files.

**Tech Stack:** React 19, TypeScript, Zustand (tabRenameStore), Tailwind v4, hugeicons (`@hugeicons/core-free-icons`), Vitest

## Global Constraints

- No comments except for non-obvious WHY
- No em-dash anywhere
- Imports via `@/...` (never relative across modules)
- Run `pnpm lint && pnpm check-types && pnpm test` before each commit
- pnpm only

---

## File Map

| File | Change |
|---|---|
| `src/modules/shortcuts/shortcuts.ts` | Add `{ key: "F2" }` as second binding to `tab.rename` |
| `src/app/components/RightPanel.tsx` | Expose `isExplorerFocused()` on `RightPanelHandle` |
| `src/app/App.tsx` | Add `isDisabled` guard for `tab.rename` when explorer has focus |
| `src/modules/explorer/FileExplorer.tsx` | Add F2 case to `handleKeyDown` |
| `src/modules/workspaces/PaneTabBar.tsx` | Rename button in hover, scroll lock, snap logic |

---

## Task 1: F2 binding + isDisabled guard for Explorer focus

**Files:**
- Modify: `src/modules/shortcuts/shortcuts.ts`
- Modify: `src/app/components/RightPanel.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/modules/shortcuts/shortcuts.test.ts`

**Interfaces:**
- Produces: `RightPanelHandle.isExplorerFocused: () => boolean` used in Task 2's `shortcutsDisabled`
- Produces: `tab.rename` default bindings include `{ key: "F2" }` used by Task 2's Explorer F2 (non-conflict)

- [ ] **Step 1: Write the failing test**

In `src/modules/shortcuts/shortcuts.test.ts`, add after the existing `test("tab.rename has a label containing R", ...)` block:

```typescript
test("tab.rename bare F2 binding matches a plain F2 keydown", () => {
  const tabRename = SHORTCUTS.find((s) => s.id === "tab.rename");
  expect(tabRename).toBeDefined();
  const f2Event = {
    key: "F2",
    code: "F2",
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
  } as KeyboardEvent;
  const matches = tabRename!.defaultBindings.some((b) =>
    matchBinding(f2Event, b, "tab.rename"),
  );
  expect(matches).toBe(true);
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai && pnpm test src/modules/shortcuts/shortcuts.test.ts
```

Expected: FAIL — "Expected: true, Received: false"

- [ ] **Step 3: Add F2 binding to tab.rename**

In `src/modules/shortcuts/shortcuts.ts`, find the `tab.rename` shortcut entry (around line 122) and change `defaultBindings`:

```typescript
  {
    id: "tab.rename",
    label: "Rename tab",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "r" }, { key: "F2" }],
  },
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
pnpm test src/modules/shortcuts/shortcuts.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Add `isExplorerFocused` to RightPanelHandle**

In `src/app/components/RightPanel.tsx`, update the handle type and `useImperativeHandle`:

```typescript
export type RightPanelHandle = {
  focusExplorer: () => void;
  toggleExplorerSearch: () => void;
  isExplorerFocused: () => boolean;
};
```

In the `useImperativeHandle` call (around line 63):

```typescript
useImperativeHandle(ref, () => ({
  focusExplorer: () => explorerRef.current?.focusSearch?.(),
  toggleExplorerSearch: () => explorerRef.current?.toggleSearch?.(),
  isExplorerFocused: () => explorerRef.current?.isFocused() ?? false,
}));
```

- [ ] **Step 6: Add isDisabled guard in App.tsx**

In `src/app/App.tsx`, inside the `shortcutsDisabled` `useCallback` (around line 1099), add before `return false;`:

```typescript
      if (id === "tab.rename") {
        return rightPanelRef.current?.isExplorerFocused() ?? false;
      }
```

Full function after the change:

```typescript
  const shortcutsDisabled = useCallback(
    (id: ShortcutId, e: KeyboardEvent) => {
      if (id === "editor.undo" || id === "editor.redo") {
        return activePanel?.kind !== "editor";
      }
      if (id === "terminal.clear") {
        const target = (e.target as HTMLElement | null) ?? document.activeElement;
        return !(target as HTMLElement | null)?.closest?.(".xterm");
      }
      if (id === "blocks.prev" || id === "blocks.next") {
        return !(
          activePanel?.kind === "terminal" &&
          (activePanel as { blocks?: boolean }).blocks === true
        );
      }
      if (id === "tab.rename") {
        return rightPanelRef.current?.isExplorerFocused() ?? false;
      }

      return false;
    },
    [activePanel],
  );
```

- [ ] **Step 7: Type-check and lint**

```bash
pnpm check-types && pnpm lint
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/modules/shortcuts/shortcuts.ts src/app/components/RightPanel.tsx src/app/App.tsx src/modules/shortcuts/shortcuts.test.ts
git commit -m "feat: add F2 as second binding for tab.rename with explorer-focus guard"
```

---

## Task 2: F2 in Explorer handleKeyDown

**Files:**
- Modify: `src/modules/explorer/FileExplorer.tsx`

**Interfaces:**
- Consumes: `actions.beginRename(path: string)` — already wired from `useFileTree`
- Consumes: `selectedPath: string | null` — existing local state

Note: The global `tab.rename` shortcut will NOT fire when the Explorer has focus because of the `isDisabled` guard added in Task 1. The Explorer's React `onKeyDown` (bubble phase) receives F2 unintercepted.

- [ ] **Step 1: Add F2 case to handleKeyDown**

In `src/modules/explorer/FileExplorer.tsx`, inside the `handleKeyDown` function (around line 403), add a new `case` before the closing brace of the `switch`:

```typescript
        case "F2": {
          if (currentIdx < 0) return;
          e.preventDefault();
          const path = entryPaths[currentIdx];
          actions.beginRename(path);
          break;
        }
```

Full switch after the change (excerpt around Enter and new F2):

```typescript
        case "Enter": {
          if (currentIdx < 0) return;
          e.preventDefault();
          const path = entryPaths[currentIdx];
          const idx = entryIndexByPath.get(path);
          if (idx === undefined) break;
          const row = rows[idx];
          if (row.kind !== "entry") break;
          if (row.isDir) tree.toggle(row.path);
          else onOpenFile(row.path);
          break;
        }
        case "F2": {
          if (currentIdx < 0) return;
          e.preventDefault();
          const path = entryPaths[currentIdx];
          actions.beginRename(path);
          break;
        }
```

- [ ] **Step 2: Type-check, lint, test**

```bash
pnpm check-types && pnpm lint && pnpm test
```

Expected: all green

- [ ] **Step 3: Manual test**

1. Open Kex, open the Explorer panel (Cmd+E)
2. Click a file to select it (highlighted row)
3. Press F2 — the inline rename input should appear, same as double-clicking
4. Type a new name and press Enter — file is renamed
5. Press F2 again, then Escape — rename cancelled
6. Focus a terminal tab and press F2 — the tab rename popup should appear (Cmd+R behavior)

- [ ] **Step 4: Commit**

```bash
git add src/modules/explorer/FileExplorer.tsx
git commit -m "feat: F2 renames selected file or folder in the Explorer"
```

---

## Task 3: Rename button in editor/markdown tab hover card

**Files:**
- Modify: `src/modules/workspaces/PaneTabBar.tsx`

**Interfaces:**
- Consumes: `PencilEdit01Icon` from `@hugeicons/core-free-icons`
- Consumes: `startRename(panelId: string)` from `useTabRenameStore` — already imported in `DraggableTab`
- Consumes: `setHoverOpen` — existing local state in `DraggableTab`
- Produces: rename button visible on "Filename" row of hover card for `editor` and `markdown` panels

- [ ] **Step 1: Add PencilEdit01Icon import**

In `src/modules/workspaces/PaneTabBar.tsx`, line 25 currently reads:

```typescript
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
```

Change to:

```typescript
import { Copy01Icon, PencilEdit01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
```

- [ ] **Step 2: Add `action` prop to HoverRow**

Replace the existing `HoverRow` function (lines 37-80) with:

```typescript
function HoverRow({
  label,
  value,
  copy,
  action,
  valueClassName,
}: {
  label: string;
  value: string;
  copy?: string;
  action?: { icon: ReactNode; label: string; onClick: () => void };
  valueClassName?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <>
      <span className="whitespace-nowrap text-muted-foreground">{label}</span>
      <span className="group/row flex min-w-0 items-start gap-1">
        <span className={cn("min-w-0 break-words", valueClassName ?? "text-foreground")}>
          {value}
        </span>
        {copy !== undefined && (
          <button
            type="button"
            title={`Copy ${label.toLowerCase()}`}
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard
                .writeText(copy)
                .then(() => setCopied(true))
                .catch(() => {});
            }}
            className="mt-px flex size-[16px] shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition group-hover/row:opacity-100 hover:text-foreground"
          >
            <HugeiconsIcon
              icon={copied ? Tick02Icon : Copy01Icon}
              size={11}
              strokeWidth={1.9}
            />
          </button>
        )}
        {action && (
          <button
            type="button"
            title={action.label}
            onClick={(e) => {
              e.stopPropagation();
              action.onClick();
            }}
            className="mt-px flex size-[16px] shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition group-hover/row:opacity-100 hover:text-foreground"
          >
            {action.icon}
          </button>
        )}
      </span>
    </>
  );
}
```

- [ ] **Step 3: Add `onRename` prop to FilePathLines**

Replace the `FilePathLines` function signature and its Filename HoverRow call:

```typescript
function FilePathLines({
  absPath,
  repoRoot,
  repoRel,
  onRename,
  children,
}: {
  absPath: string;
  repoRoot: string | null;
  repoRel: string | null;
  onRename?: () => void;
  children?: ReactNode;
}) {
  return (
    <HoverTable>
      <HoverRow
        label="Filename"
        value={pathBasename(absPath)}
        copy={pathBasename(absPath)}
        valueClassName="font-medium text-foreground"
        action={
          onRename
            ? {
                icon: <HugeiconsIcon icon={PencilEdit01Icon} size={11} strokeWidth={1.9} />,
                label: "Rename tab",
                onClick: onRename,
              }
            : undefined
        }
      />
      {repoRoot && <HoverRow label="Repo root" value={repoRoot} copy={repoRoot} />}
      {repoRel && <HoverRow label="Relative to repo" value={repoRel} copy={repoRel} />}
      <HoverRow label="Absolute path" value={absPath} copy={absPath} />
      {children}
    </HoverTable>
  );
}
```

- [ ] **Step 4: Add `onRename` prop to EditorHoverContent**

Replace `EditorHoverContent`:

```typescript
function EditorHoverContent({ absPath, onRename }: { absPath: string; onRename?: () => void }) {
  const root = useGitRepoRoot(pathDirname(absPath));
  const abs = absPath.replace(/\\/g, "/");
  const repoRel =
    root && abs !== root && abs.startsWith(`${root}/`)
      ? abs.slice(root.length + 1)
      : null;

  return <FilePathLines absPath={absPath} repoRoot={root} repoRel={repoRel} onRename={onRename} />;
}
```

- [ ] **Step 5: Wire rename callback in DraggableTab**

In `DraggableTab`, directly after the `startRename` destructure (around line 347):

```typescript
  const isRenaming = useTabRenameStore((s) => s.renamingPanelId === panel.id);
  const clearRename = useTabRenameStore((s) => s.clearRename);
  const startRename = useTabRenameStore((s) => s.startRename);
```

Add:

```typescript
  function handleRenameFromHover() {
    setHoverOpen(false);
    startRename(panel.id);
  }
```

Then in the `hoverBody` switch (around line 374), change the `editor` and `markdown` cases:

```typescript
      case "editor":
      case "markdown":
        return <EditorHoverContent absPath={panel.path} onRename={handleRenameFromHover} />;
```

- [ ] **Step 6: Type-check, lint, test**

```bash
pnpm check-types && pnpm lint && pnpm test
```

Expected: all green

- [ ] **Step 7: Manual test**

1. Open an editor or markdown tab
2. Hover over the tab for ~1s — hover card appears
3. Hover over the "Filename" row — a small pencil icon button appears to the right of the filename (and copy button)
4. Click the pencil button — hover card closes, rename popup opens under the tab
5. Type a new title and press Enter — tab title changes
6. Repeat for a markdown tab
7. Verify that terminal, preview, and git tabs do NOT show the pencil button

- [ ] **Step 8: Commit**

```bash
git add src/modules/workspaces/PaneTabBar.tsx
git commit -m "feat: add rename button to editor and markdown tab hover card"
```

---

## Task 4: Block tab scroll while hover or rename is open

**Files:**
- Modify: `src/modules/workspaces/PaneTabBar.tsx`

**Interfaces:**
- Consumes: `useTabRenameStore` — already imported
- Produces: `onHoverChange(panelId, open)` prop on `DraggableTab` — used internally by `PaneTabBar`

- [ ] **Step 1: Add hover tracking refs and rename ref in PaneTabBar**

In `PaneTabBar` function body, after the `mouseLeaveTimerRef` declaration (around line 661), add:

```typescript
  const hoverOpenPanelsRef = useRef(new Set<string>());
  const renamingPanelId = useTabRenameStore((s) => s.renamingPanelId);
  const isRenamingRef = useRef(false);
  useEffect(() => {
    isRenamingRef.current = renamingPanelId !== null;
  }, [renamingPanelId]);
```

- [ ] **Step 2: Guard the wheel handler**

In the `handleWheel` function inside the `useEffect` for wheel events (around line 691), add the guard as the first thing inside the handler, after `e.preventDefault()`:

```typescript
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (hoverOpenPanelsRef.current.size > 0 || isRenamingRef.current) return;
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      container.scrollLeft += delta;
      userScrolledRef.current = true;
      if (!mouseInsideRef.current && !mouseLeaveTimerRef.current) {
        mouseLeaveTimerRef.current = setTimeout(() => {
          mouseLeaveTimerRef.current = null;
          userScrolledRef.current = false;
          scrollActiveIntoView('smooth');
        }, 5000);
      }
    };
```

`e.preventDefault()` is kept first so the page never scrolls when the pointer is over the tab bar, even when tabs are locked.

- [ ] **Step 3: Add onHoverChange prop to DraggableTab**

In the `DraggableTab` props destructure (around line 266), add `onHoverChange`:

```typescript
function DraggableTab({
  panel,
  activePanelId,
  paneFocused,
  workspaceId,
  isWorkspaceActive,
  insertionBefore,
  insertionAfter,
  panelsCount,
  onActivate,
  onClose,
  onCloseOtherPanels,
  onCloseAllPanels,
  onNewTerminal,
  onSplitTerminalRight,
  onSplitTerminalDown,
  onNewBrowser,
  onSplitBrowserRight,
  onSplitBrowserDown,
  onDetachAgent,
  shortcutLabels,
  onRenamePanel,
  onHoverChange,
}: {
  // ... existing types ...
  onHoverChange?: (panelId: string, open: boolean) => void;
}) {
```

- [ ] **Step 4: Call onHoverChange in HoverCard.onOpenChange**

In `DraggableTab`, find the `HoverCard` component (around line 510) and update `onOpenChange`:

```typescript
    <HoverCard
      open={hoverOpen}
      openDelay={700}
      closeDelay={100}
      onOpenChange={(o) => {
        if (!o && pointerInsideRef.current) return;
        setHoverOpen(o);
        onHoverChange?.(panel.id, o);
      }}
    >
```

- [ ] **Step 5: Pass onHoverChange from PaneTabBar to each DraggableTab**

In `PaneTabBar`'s render, inside the `panels.map(...)`, pass the new prop:

```typescript
          onHoverChange={(panelId, open) => {
            if (open) hoverOpenPanelsRef.current.add(panelId);
            else hoverOpenPanelsRef.current.delete(panelId);
          }}
```

- [ ] **Step 6: Type-check, lint, test**

```bash
pnpm check-types && pnpm lint && pnpm test
```

Expected: all green

- [ ] **Step 7: Manual test**

1. Open many tabs so the tab bar overflows and scroll is needed
2. Hover over a tab — hover card appears
3. While hover card is visible, try to scroll tabs with the mouse wheel — tab bar should not scroll
4. Move pointer away — hover card closes, scroll works again
5. Start renaming a tab (Cmd+R or F2) — try to scroll — tab bar should not scroll
6. Press Escape to cancel rename — scroll works again

- [ ] **Step 8: Commit**

```bash
git add src/modules/workspaces/PaneTabBar.tsx
git commit -m "feat: block tab bar scroll while hover card or rename popup is open"
```

---

## Task 5: Snap partially-visible tab into view on right-click and hover

**Files:**
- Modify: `src/modules/workspaces/PaneTabBar.tsx`

**Interfaces:**
- Produces: `onSnapIntoView(panelId: string)` prop on `DraggableTab` — called by context menu open and hover card open events

- [ ] **Step 1: Extract scrollPanelIntoView**

In `PaneTabBar`, find the existing `scrollActiveIntoView` function (around line 666) and refactor it into two functions. Replace the single function with:

```typescript
  const scrollPanelIntoView = (panelId: string, behavior: ScrollBehavior = 'smooth') => {
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
  };

  const scrollActiveIntoView = (behavior: ScrollBehavior = 'auto') => {
    const id = activePanelIdRef.current;
    if (!id) return;
    scrollPanelIntoView(id, behavior);
  };
```

All existing call sites of `scrollActiveIntoView` stay unchanged.

- [ ] **Step 2: Add onSnapIntoView prop to DraggableTab**

In the `DraggableTab` props destructure, add after `onHoverChange`:

```typescript
  onSnapIntoView?: (panelId: string) => void;
```

- [ ] **Step 3: Call onSnapIntoView when context menu opens**

In `DraggableTab`, find the `ContextMenu` component (around line 523) and update `onOpenChange`:

```typescript
        <ContextMenu onOpenChange={(o) => {
          if (o) {
            setHoverOpen(false);
            onSnapIntoView?.(panel.id);
          }
        }}>
```

- [ ] **Step 4: Call onSnapIntoView when hover card opens**

In `DraggableTab`, in `HoverCard.onOpenChange` (updated in Task 4), add the snap call when opening:

```typescript
      onOpenChange={(o) => {
        if (!o && pointerInsideRef.current) return;
        setHoverOpen(o);
        onHoverChange?.(panel.id, o);
        if (o) onSnapIntoView?.(panel.id);
      }}
```

- [ ] **Step 5: Pass onSnapIntoView from PaneTabBar**

In `PaneTabBar`'s `panels.map(...)`, pass:

```typescript
          onSnapIntoView={(panelId) => scrollPanelIntoView(panelId, 'smooth')}
```

- [ ] **Step 6: Type-check, lint, test**

```bash
pnpm check-types && pnpm lint && pnpm test
```

Expected: all green

- [ ] **Step 7: Manual test**

1. Open many tabs and scroll the tab bar to the right so some tabs are partially out of view on the left
2. Right-click a partially-visible tab — tab bar snaps to show it fully, context menu appears
3. Scroll right again, then hover slowly over a half-hidden tab — tab bar scrolls to reveal it when hover card opens
4. Verify that the snap does not persist as a "user scroll" — after moving pointer away and waiting, active tab snaps back normally

- [ ] **Step 8: Final commit**

```bash
git add src/modules/workspaces/PaneTabBar.tsx
git commit -m "feat: snap tab into full view on right-click and hover card open"
```
