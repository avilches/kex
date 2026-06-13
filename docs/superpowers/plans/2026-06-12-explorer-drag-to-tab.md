# Explorer Drag-to-Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow files in the explorer panel to be dragged onto any pane drop zone or tab insertion point, opening the file as a permanent editor tab at that location, with the same visual feedback as dragging tabs.

**Architecture:** A new `WorkspaceDndProvider` component extracts the `DndContext`, drag state, and all drag handlers from `WorkspaceView.tsx`, elevating them to a level that wraps both the explorer panel and the workspace. This lets explorer rows use `useDraggable` from the same context. A shared React context (`WorkspaceDndContext`) exposes `draggingItem` and `tabInsertPaneId` to `WorkspaceView`. `PaneView` already uses `useDndMonitor` which hooks into the nearest `DndContext` automatically.

**Tech Stack:** `@dnd-kit/core` (already installed), Vitest, React context.

---

## File map

| Action | File |
|---|---|
| Modify | `src/modules/workspaces/lib/splitNode.ts` |
| Modify | `src/modules/workspaces/lib/splitNode.test.ts` |
| Modify | `src/modules/workspaces/lib/useWorkspaces.ts` |
| Create | `src/modules/workspaces/WorkspaceDndProvider.tsx` |
| Modify | `src/modules/workspaces/WorkspaceView.tsx` |
| Modify | `src/modules/explorer/TreeRow.tsx` |
| Modify | `src/app/App.tsx` |

---

### Task 1: Add `splitPaneAndInsertPanel` to `splitNode.ts` + test

**Files:**
- Modify: `src/modules/workspaces/lib/splitNode.ts`
- Modify: `src/modules/workspaces/lib/splitNode.test.ts`

- [ ] **Step 1.1: Write the failing test**

  Open `src/modules/workspaces/lib/splitNode.test.ts` and add this at the end of the file (after all existing `describe` blocks). First add the import for `splitPaneAndInsertPanel` to the existing import at line 1:

  ```typescript
  import {
    allPaneIds,
    findPane,
    findPaneInDirection,
    findPanelPane,
    firstPaneId,
    movePanelBetweenPanes,
    removePaneFromTree,
    siblingPane,
    splitPaneAndInsertPanel,   // add this
    splitPaneInTree,
    updateDivider,
    updatePane,
    type Rect,
  } from "./splitNode";
  ```

  Then add the new `describe` block at the bottom:

  ```typescript
  describe("splitPaneAndInsertPanel", () => {
    test("splits a pane and places the new panel in the new sub-pane", () => {
      const p1: PaneNode = { kind: "pane", id: "p1", panels: [], activePanelId: null };
      const panel = { id: "pan1", kind: "editor" as const, path: "/foo.ts", preview: false, dirty: false };
      const result = splitPaneAndInsertPanel(p1, "p1", "s1", "p2", "horizontal", "second", panel);
      expect(result.kind).toBe("split");
      if (result.kind === "split") {
        expect(result.first).toBe(p1);
        expect(result.second.kind).toBe("pane");
        if (result.second.kind === "pane") {
          expect(result.second.panels).toEqual([panel]);
          expect(result.second.activePanelId).toBe("pan1");
        }
      }
    });

    test("new pane appears as first when position is 'first'", () => {
      const p1: PaneNode = { kind: "pane", id: "p1", panels: [], activePanelId: null };
      const panel = { id: "pan1", kind: "editor" as const, path: "/foo.ts", preview: false, dirty: false };
      const result = splitPaneAndInsertPanel(p1, "p1", "s1", "p2", "vertical", "first", panel);
      expect(result.kind).toBe("split");
      if (result.kind === "split") {
        expect(result.first.kind).toBe("pane");
        if (result.first.kind === "pane") {
          expect(result.first.panels).toEqual([panel]);
        }
        expect(result.second).toBe(p1);
      }
    });

    test("returns original tree if targetPaneId not found", () => {
      const p1: PaneNode = { kind: "pane", id: "p1", panels: [], activePanelId: null };
      const panel = { id: "pan1", kind: "editor" as const, path: "/foo.ts", preview: false, dirty: false };
      const result = splitPaneAndInsertPanel(p1, "unknown", "s1", "p2", "horizontal", "second", panel);
      expect(result).toBe(p1);
    });
  });
  ```

- [ ] **Step 1.2: Run test to verify it fails**

  ```bash
  cd /Users/avilches/Work/Proy/Repos/terax-ai && pnpm test -- splitNode
  ```

  Expected: FAIL with "splitPaneAndInsertPanel is not a function" or import error.

- [ ] **Step 1.3: Implement `splitPaneAndInsertPanel` in `splitNode.ts`**

  Add the following function at the end of `src/modules/workspaces/lib/splitNode.ts`, before the last closing brace (after the `findPaneInDirection` function):

  ```typescript
  export function splitPaneAndInsertPanel(
    tree: SplitNode,
    targetPaneId: string,
    newSplitId: string,
    newPaneId: string,
    orientation: "horizontal" | "vertical",
    newPanePosition: "first" | "second",
    panel: Panel,
  ): SplitNode {
    const treeAfterSplit = splitPaneInTree(tree, targetPaneId, newSplitId, newPaneId, orientation, newPanePosition);
    if (treeAfterSplit === tree) return tree; // targetPaneId not found
    return updatePane(treeAfterSplit, newPaneId, (p) => ({
      ...p,
      panels: [panel],
      activePanelId: panel.id,
    }));
  }
  ```

- [ ] **Step 1.4: Run test to verify it passes**

  ```bash
  cd /Users/avilches/Work/Proy/Repos/terax-ai && pnpm test -- splitNode
  ```

  Expected: all splitNode tests PASS.

- [ ] **Step 1.5: Commit**

  ```bash
  git add src/modules/workspaces/lib/splitNode.ts src/modules/workspaces/lib/splitNode.test.ts
  git commit -m "feat(workspaces): add splitPaneAndInsertPanel pure function"
  ```

---

### Task 2: Extend `openPanel` and add `splitPaneAndOpenFile` in `useWorkspaces.ts`

**Files:**
- Modify: `src/modules/workspaces/lib/useWorkspaces.ts`

`openPanel` currently always appends at the end. We need to support inserting at a specific index for the tab-insert drop zones. We also need a new `splitPaneAndOpenFile` method that creates a split and places a new file panel in one operation.

- [ ] **Step 2.1: Extend `openPanel` to accept an optional `insertionIndex`**

  In `src/modules/workspaces/lib/useWorkspaces.ts`, replace the `openPanel` callback (lines 209-223) with:

  ```typescript
  const openPanel = useCallback((workspaceId: string, paneId: string, panel: Panel, insertionIndex?: number) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        return {
          ...w,
          paneTree: updatePane(w.paneTree, paneId, (p) => {
            const idx = insertionIndex !== undefined
              ? Math.min(insertionIndex, p.panels.length)
              : p.panels.length;
            const newPanels = [...p.panels];
            newPanels.splice(idx, 0, panel);
            return { ...p, panels: newPanels, activePanelId: panel.id };
          }),
        };
      }),
    );
  }, []);
  ```

- [ ] **Step 2.2: Add the `splitPaneAndOpenFile` import for `splitPaneAndInsertPanel`**

  In `src/modules/workspaces/lib/useWorkspaces.ts`, the existing import from `./splitNode` is at line 7-16. Add `splitPaneAndInsertPanel` to it:

  ```typescript
  import {
    allPaneIds,
    findPane,
    findPanelPane,
    firstPaneId,
    movePanelBetweenPanes,
    removePaneFromTree,
    siblingPane,
    splitPaneAndInsertPanel,
    splitPaneInTree,
    updateDivider,
    updatePane,
  } from "./splitNode";
  ```

- [ ] **Step 2.3: Add `splitPaneAndOpenFile` hook method**

  In `src/modules/workspaces/lib/useWorkspaces.ts`, add this callback after `splitPaneAndPlace` (after line 205, before `// ── Panel operations`):

  ```typescript
  const splitPaneAndOpenFile = useCallback((
    workspaceId: string,
    targetPaneId: string,
    direction: "left" | "right" | "top" | "bottom",
    path: string,
  ) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        const { workspacePaneLimit } = usePreferencesStore.getState();
        if (allPanes(w.paneTree).length >= workspacePaneLimit) return w;
        const orientation = direction === "left" || direction === "right" ? "horizontal" : "vertical";
        const newPanePosition: "first" | "second" = direction === "left" || direction === "top" ? "first" : "second";
        const newPaneId = crypto.randomUUID();
        const newSplitId = crypto.randomUUID();
        const panel: Panel = { id: crypto.randomUUID(), kind: "editor", path, preview: false, dirty: false };
        const newTree = splitPaneAndInsertPanel(w.paneTree, targetPaneId, newSplitId, newPaneId, orientation, newPanePosition, panel);
        if (newTree === w.paneTree) return w;
        return { ...w, paneTree: newTree, activePaneId: newPaneId };
      }),
    );
  }, []);
  ```

  Note: `usePreferencesStore` is already imported at line 17 as it is used inside `splitPaneAndPlace`. Also need to import `allPanes` - check it's already in the import (it comes from `allPaneIds`). Actually `allPanes` comes from `splitNode.ts` but is not currently imported in `useWorkspaces.ts`. Add it to the import:

  ```typescript
  import {
    allPaneIds,
    allPanes,          // add this
    findPane,
    ...
  } from "./splitNode";
  ```

- [ ] **Step 2.4: Export `splitPaneAndOpenFile` from the hook return**

  In the `return` object at the bottom of `useWorkspaces` (around line 355-381), add `splitPaneAndOpenFile` to the returned object:

  ```typescript
  return {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    activeWorkspace,
    addWorkspace,
    closeWorkspace,
    reorderWorkspaces,
    splitPane,
    closePane,
    focusPane,
    setPaneDivider,
    movePanel,
    reorderPanel,
    splitPaneAndPlace,
    splitPaneAndOpenFile,   // add this
    openPanel,
    activatePanel,
    closePanel,
    updatePanelData,
    setTerminalPanelCwd,
    setWorkspaceCwd,
    setTerminalRunningCommand,
    findPanelGlobal,
    findPaneGlobal,
    resetWorkspaces,
    allPaneIds,
  };
  ```

- [ ] **Step 2.5: Verify types compile**

  ```bash
  cd /Users/avilches/Work/Proy/Repos/terax-ai && pnpm check-types
  ```

  Expected: no errors.

- [ ] **Step 2.6: Commit**

  ```bash
  git add src/modules/workspaces/lib/useWorkspaces.ts
  git commit -m "feat(workspaces): add splitPaneAndOpenFile and indexed openPanel"
  ```

---

### Task 3: Create `WorkspaceDndProvider.tsx`

**Files:**
- Create: `src/modules/workspaces/WorkspaceDndProvider.tsx`

This component extracts the `DndContext`, drag state, and all handlers from `WorkspaceView.tsx`. It also handles the new "file drag" type. It exposes `draggingItem` and `tabInsertPaneId` via a React context consumed by `WorkspaceView`.

- [ ] **Step 3.1: Create the file**

  Create `src/modules/workspaces/WorkspaceDndProvider.tsx` with the following content:

  ```typescript
  import {
    DndContext,
    DragOverlay,
    PointerSensor,
    pointerWithin,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
  } from "@dnd-kit/core";
  import { createContext, useContext, useState, type ReactNode } from "react";
  import { allPanes, findPanelPane } from "./lib/splitNode";
  import { usePreferencesStore } from "@/modules/settings/preferences";
  import { panelIcon, panelTitle } from "./lib/panelTitle";
  import type { Panel, Workspace } from "./lib/types";
  import type { UseWorkspacesReturn } from "./lib/useWorkspaces";

  type DraggingItem =
    | { kind: "panel"; panel: Panel; workspaceId: string }
    | { kind: "file"; path: string };

  type WorkspaceDndContextValue = {
    draggingItem: DraggingItem | null;
    tabInsertPaneId: string | null;
  };

  const WorkspaceDndContext = createContext<WorkspaceDndContextValue>({
    draggingItem: null,
    tabInsertPaneId: null,
  });

  export function useWorkspaceDnd(): WorkspaceDndContextValue {
    return useContext(WorkspaceDndContext);
  }

  type Props = {
    workspaces: Workspace[];
    activeWorkspaceId: string;
    onMovePanel: UseWorkspacesReturn["movePanel"];
    onReorderPanel: UseWorkspacesReturn["reorderPanel"];
    onSplitPaneAndPlace: UseWorkspacesReturn["splitPaneAndPlace"];
    onSplitPaneAndOpenFile: UseWorkspacesReturn["splitPaneAndOpenFile"];
    onOpenPanel: UseWorkspacesReturn["openPanel"];
    children: ReactNode;
  };

  function basename(path: string): string {
    return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
  }

  export function WorkspaceDndProvider({
    workspaces,
    activeWorkspaceId,
    onMovePanel,
    onReorderPanel,
    onSplitPaneAndPlace,
    onSplitPaneAndOpenFile,
    onOpenPanel,
    children,
  }: Props) {
    const [draggingItem, setDraggingItem] = useState<DraggingItem | null>(null);
    const [tabInsertPaneId, setTabInsertPaneId] = useState<string | null>(null);

    const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    );

    function handleDragStart(event: DragStartEvent) {
      document.body.style.cursor = "grabbing";
      const activeId = String(event.active.id);
      if (activeId.startsWith("file:")) {
        setDraggingItem({ kind: "file", path: activeId.slice(5) });
        return;
      }
      for (const ws of workspaces) {
        const result = findPanelPane(ws.paneTree, activeId);
        if (result) {
          setDraggingItem({ kind: "panel", panel: result.panel, workspaceId: ws.id });
          break;
        }
      }
    }

    function handleDragCancel() {
      document.body.style.cursor = "";
      setDraggingItem(null);
      setTabInsertPaneId(null);
    }

    function handleDragOver(event: DragOverEvent) {
      const overId = event.over?.id ? String(event.over.id) : null;
      if (!overId?.startsWith("tab-insert:")) {
        setTabInsertPaneId(null);
        return;
      }
      const parts = overId.split(":");
      const refPanelId = parts[1];
      if (!refPanelId) { setTabInsertPaneId(null); return; }

      const activeId = String(event.active.id);
      const isFileDrag = activeId.startsWith("file:");

      if (isFileDrag) {
        // File drag: show tab-insert indicator on whichever pane contains refPanelId in the active workspace
        const activeWs = workspaces.find((ws) => ws.id === activeWorkspaceId);
        if (!activeWs) { setTabInsertPaneId(null); return; }
        for (const pane of allPanes(activeWs.paneTree)) {
          if (pane.panels.some((p) => p.id === refPanelId)) {
            setTabInsertPaneId(pane.id);
            return;
          }
        }
        setTabInsertPaneId(null);
        return;
      }

      // Panel drag: only show indicator when dragging to a different pane
      for (const ws of workspaces) {
        const sourceResult = findPanelPane(ws.paneTree, activeId);
        if (!sourceResult) continue;
        const sourcePaneId = sourceResult.pane.id;
        for (const pane of allPanes(ws.paneTree)) {
          if (pane.panels.some((p) => p.id === refPanelId)) {
            setTabInsertPaneId(pane.id !== sourcePaneId ? pane.id : null);
            return;
          }
        }
        setTabInsertPaneId(null);
        return;
      }
      setTabInsertPaneId(null);
    }

    function handleDragEnd(event: DragEndEvent) {
      document.body.style.cursor = "";
      setDraggingItem(null);
      setTabInsertPaneId(null);
      const { active, over } = event;
      if (!over) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      if (activeId.startsWith("file:")) {
        handleFileDragEnd(activeId.slice(5), overId);
        return;
      }

      handlePanelDragEnd(activeId, overId);
    }

    function handleFileDragEnd(filePath: string, overId: string) {
      const activeWs = workspaces.find((ws) => ws.id === activeWorkspaceId);
      if (!activeWs) return;

      // Check if already open in active workspace
      let existingPanelId: string | null = null;
      for (const pane of allPanes(activeWs.paneTree)) {
        const found = pane.panels.find((p) => p.kind === "editor" && p.path === filePath);
        if (found) { existingPanelId = found.id; break; }
      }

      if (overId.startsWith("tab-insert:")) {
        const parts = overId.split(":");
        const refPanelId = parts[1];
        const side = parts[2];
        if (!refPanelId || (side !== "before" && side !== "after")) return;

        let targetPaneId: string | null = null;
        let refPanelIndex = -1;
        for (const pane of allPanes(activeWs.paneTree)) {
          const idx = pane.panels.findIndex((p) => p.id === refPanelId);
          if (idx !== -1) { targetPaneId = pane.id; refPanelIndex = idx; break; }
        }
        if (!targetPaneId || refPanelIndex === -1) return;

        const insertionIndex = refPanelIndex + (side === "after" ? 1 : 0);

        if (existingPanelId) {
          const sourceResult = findPanelPane(activeWs.paneTree, existingPanelId);
          if (!sourceResult) return;
          if (sourceResult.pane.id === targetPaneId) {
            onReorderPanel(activeWorkspaceId, existingPanelId, insertionIndex);
          } else {
            onMovePanel(activeWorkspaceId, existingPanelId, targetPaneId, insertionIndex);
          }
        } else {
          const panel: Panel = { id: crypto.randomUUID(), kind: "editor", path: filePath, preview: false, dirty: false };
          onOpenPanel(activeWorkspaceId, targetPaneId, panel, insertionIndex);
        }
        return;
      }

      if (!overId.startsWith("zone:")) return;
      const parts = overId.split(":");
      const targetPaneId = parts[1]!;
      const zone = parts[2] as "top" | "bottom" | "left" | "right" | "center";

      const targetPaneExists = allPanes(activeWs.paneTree).some((p) => p.id === targetPaneId);
      if (!targetPaneExists) return;

      if (zone === "center") {
        if (existingPanelId) {
          const sourceResult = findPanelPane(activeWs.paneTree, existingPanelId);
          if (sourceResult?.pane.id === targetPaneId) return;
          onMovePanel(activeWorkspaceId, existingPanelId, targetPaneId);
        } else {
          const panel: Panel = { id: crypto.randomUUID(), kind: "editor", path: filePath, preview: false, dirty: false };
          onOpenPanel(activeWorkspaceId, targetPaneId, panel);
        }
      } else {
        const { workspacePaneLimit } = usePreferencesStore.getState();
        if (allPanes(activeWs.paneTree).length >= workspacePaneLimit) return;
        if (existingPanelId) {
          onSplitPaneAndPlace(activeWorkspaceId, targetPaneId, zone, existingPanelId);
        } else {
          onSplitPaneAndOpenFile(activeWorkspaceId, targetPaneId, zone, filePath);
        }
      }
    }

    function handlePanelDragEnd(panelId: string, overId: string) {
      if (overId.startsWith("tab-insert:")) {
        const parts = overId.split(":");
        const refPanelId = parts[1];
        const side = parts[2];
        if (!refPanelId || !side) return;
        if (side !== "before" && side !== "after") return;

        let sourceWorkspaceId: string | null = null;
        let sourcePaneId: string | null = null;
        for (const ws of workspaces) {
          for (const pane of allPanes(ws.paneTree)) {
            if (pane.panels.some((p) => p.id === panelId)) {
              sourceWorkspaceId = ws.id;
              sourcePaneId = pane.id;
              break;
            }
          }
          if (sourceWorkspaceId) break;
        }
        if (!sourceWorkspaceId || !sourcePaneId) return;

        const sourceWs = workspaces.find((ws) => ws.id === sourceWorkspaceId);
        if (!sourceWs) return;
        let targetPaneId: string | null = null;
        let refPanelIndex = -1;
        for (const pane of allPanes(sourceWs.paneTree)) {
          const idx = pane.panels.findIndex((p) => p.id === refPanelId);
          if (idx !== -1) { targetPaneId = pane.id; refPanelIndex = idx; break; }
        }
        if (!targetPaneId || refPanelIndex === -1) return;

        const insertionIndex = refPanelIndex + (side === "after" ? 1 : 0);
        if (sourcePaneId === targetPaneId) {
          onReorderPanel(sourceWorkspaceId, panelId, insertionIndex);
        } else {
          onMovePanel(sourceWorkspaceId, panelId, targetPaneId, insertionIndex);
        }
        return;
      }

      if (!overId.startsWith("zone:")) return;
      const parts = overId.split(":");
      const targetPaneId = parts[1]!;
      const zone = parts[2] as "top" | "bottom" | "left" | "right" | "center";

      let sourceWorkspaceId: string | null = null;
      let sourcePaneId: string | null = null;
      for (const ws of workspaces) {
        for (const pane of allPanes(ws.paneTree)) {
          if (pane.panels.some((p) => p.id === panelId)) {
            sourceWorkspaceId = ws.id;
            sourcePaneId = pane.id;
            break;
          }
        }
        if (sourceWorkspaceId) break;
      }
      if (!sourceWorkspaceId) return;

      const sourceWs = workspaces.find((ws) => ws.id === sourceWorkspaceId);
      if (!sourceWs) return;
      const targetPaneExists = allPanes(sourceWs.paneTree).some((p) => p.id === targetPaneId);
      if (!targetPaneExists) return;

      if (zone === "center") {
        if (sourcePaneId === targetPaneId) return;
        onMovePanel(sourceWorkspaceId, panelId, targetPaneId);
      } else {
        const { workspacePaneLimit } = usePreferencesStore.getState();
        const ws = workspaces.find((w) => w.id === sourceWorkspaceId);
        if (ws && allPanes(ws.paneTree).length >= workspacePaneLimit) return;
        onSplitPaneAndPlace(sourceWorkspaceId, targetPaneId, zone, panelId);
      }
    }

    return (
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <WorkspaceDndContext.Provider value={{ draggingItem, tabInsertPaneId }}>
          {children}
        </WorkspaceDndContext.Provider>
        <DragOverlay dropAnimation={null}>
          {draggingItem?.kind === "panel" && (
            <div className="pointer-events-none flex items-center gap-1 text-[11px] text-foreground">
              <span className="shrink-0 opacity-70">{panelIcon(draggingItem.panel, draggingItem.workspaceId)}</span>
              <span className="max-w-[120px] truncate">{panelTitle(draggingItem.panel)}</span>
            </div>
          )}
          {draggingItem?.kind === "file" && (
            <div className="pointer-events-none flex items-center gap-1 text-[11px] text-foreground">
              <span className="shrink-0 opacity-70">📄</span>
              <span className="max-w-[120px] truncate">{basename(draggingItem.path)}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    );
  }
  ```

- [ ] **Step 3.2: Verify types compile**

  ```bash
  cd /Users/avilches/Work/Proy/Repos/terax-ai && pnpm check-types
  ```

  Expected: no errors (the type for `splitPaneAndOpenFile` on `UseWorkspacesReturn` was added in Task 2).

- [ ] **Step 3.3: Commit**

  ```bash
  git add src/modules/workspaces/WorkspaceDndProvider.tsx
  git commit -m "feat(workspaces): add WorkspaceDndProvider with file-drag support"
  ```

---

### Task 4: Strip `DndContext` from `WorkspaceView.tsx`

**Files:**
- Modify: `src/modules/workspaces/WorkspaceView.tsx`

`WorkspaceView` currently owns the `DndContext`. After this task it becomes a pure rendering component that reads drag state from `WorkspaceDndContext`.

- [ ] **Step 4.1: Rewrite `WorkspaceView.tsx`**

  Replace the entire contents of `src/modules/workspaces/WorkspaceView.tsx` with:

  ```typescript
  import { cn } from "@/lib/utils";
  import { refreshTerminalLeaf } from "@/modules/terminal";
  import { useEffect } from "react";
  import { allPanes } from "./lib/splitNode";
  import type { Workspace } from "./lib/types";
  import { SplitNodeView } from "./SplitNodeView";
  import type { PanelCallbacks } from "./PanelContent";
  import { useWorkspaceDnd } from "./WorkspaceDndProvider";

  type Props = {
    workspaces: Workspace[];
    activeWorkspaceId: string;
    onActivatePanel: (workspaceId: string, panelId: string) => void;
    onClosePanel: (workspaceId: string, panelId: string) => void;
    onFocusPane: (workspaceId: string, paneId: string) => void;
    onNewTerminal: (workspaceId: string, paneId: string) => void;
    onDividerChange?: (workspaceId: string, splitId: string, position: number) => void;
    onSplitTerminalRight: (workspaceId: string, paneId: string) => void;
    onSplitTerminalDown: (workspaceId: string, paneId: string) => void;
    onNewBrowser: (workspaceId: string, paneId: string) => void;
    onSplitBrowserRight: (workspaceId: string, paneId: string) => void;
    onSplitBrowserDown: (workspaceId: string, paneId: string) => void;
    callbacks: PanelCallbacks;
  };

  export function WorkspaceView({
    workspaces,
    activeWorkspaceId,
    ...rest
  }: Props) {
    const { draggingItem, tabInsertPaneId } = useWorkspaceDnd();

    // After workspace switch the CSS visibility:hidden is removed. The WebGL
    // canvas doesn't repaint on its own after that — force a refresh once the
    // DOM change has been painted.
    useEffect(() => {
      const ws = workspaces.find((w) => w.id === activeWorkspaceId);
      if (!ws) return;
      const raf = requestAnimationFrame(() => {
        for (const pane of allPanes(ws.paneTree)) {
          if (pane.activePanelId) refreshTerminalLeaf(pane.activePanelId);
        }
      });
      return () => cancelAnimationFrame(raf);
    }, [activeWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
      <div className={cn("relative h-full w-full", draggingItem && "[&_*]:!cursor-grabbing cursor-grabbing")}>
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            className={cn(
              "absolute inset-0",
              ws.id !== activeWorkspaceId && "opacity-0 invisible",
            )}
          >
            <SplitNodeView
              node={ws.paneTree}
              workspaceId={ws.id}
              workspaceCwd={ws.cwd}
              activePaneId={ws.activePaneId}
              isWorkspaceActive={ws.id === activeWorkspaceId}
              tabInsertPaneId={tabInsertPaneId}
              onActivatePanel={rest.onActivatePanel}
              onClosePanel={rest.onClosePanel}
              onFocusPane={rest.onFocusPane}
              onNewTerminal={rest.onNewTerminal}
              onDividerChange={rest.onDividerChange}
              onSplitTerminalRight={rest.onSplitTerminalRight}
              onSplitTerminalDown={rest.onSplitTerminalDown}
              onNewBrowser={rest.onNewBrowser}
              onSplitBrowserRight={rest.onSplitBrowserRight}
              onSplitBrowserDown={rest.onSplitBrowserDown}
              callbacks={rest.callbacks}
            />
          </div>
        ))}
      </div>
    );
  }
  ```

  Note: `onMovePanel`, `onReorderPanel`, `onSplitPaneAndPlace` are removed from Props — they are now owned by `WorkspaceDndProvider`. The `UseWorkspacesReturn` import is also removed.

- [ ] **Step 4.2: Verify types compile**

  ```bash
  cd /Users/avilches/Work/Proy/Repos/terax-ai && pnpm check-types
  ```

  Expected: errors about `onMovePanel`, `onReorderPanel`, `onSplitPaneAndPlace` being passed to `WorkspaceView` from `App.tsx` (since those props are now removed). These will be fixed in Task 5.

- [ ] **Step 4.3: Commit**

  ```bash
  git add src/modules/workspaces/WorkspaceView.tsx
  git commit -m "refactor(workspaces): remove DndContext from WorkspaceView, use WorkspaceDndProvider"
  ```

---

### Task 5: Wire `WorkspaceDndProvider` in `App.tsx`

**Files:**
- Modify: `src/app/App.tsx`

- [ ] **Step 5.1: Add the import**

  In `src/app/App.tsx`, find the existing workspaces-module imports (around line 58 where `WorkspaceView` is imported). Add:

  ```typescript
  import { WorkspaceDndProvider } from "@/modules/workspaces/WorkspaceDndProvider";
  ```

- [ ] **Step 5.2: Wrap the ResizablePanelGroup with WorkspaceDndProvider**

  In `src/app/App.tsx`, find the comment `{/* CENTER + TOOL PANEL: resizable, side configurable */}` (around line 976). Wrap the entire `<ResizablePanelGroup>` block — from `<ResizablePanelGroup` to its closing `</ResizablePanelGroup>` — with `WorkspaceDndProvider`:

  ```tsx
  {/* CENTER + TOOL PANEL: resizable, side configurable */}
  <WorkspaceDndProvider
    workspaces={workspaces}
    activeWorkspaceId={activeWorkspaceId}
    onMovePanel={movePanel}
    onReorderPanel={reorderPanel}
    onSplitPaneAndPlace={splitPaneAndPlace}
    onSplitPaneAndOpenFile={splitPaneAndOpenFile}
    onOpenPanel={openPanel}
  >
    <ResizablePanelGroup
      orientation="horizontal"
      className="min-h-0 flex-1"
    >
      {/* ... existing content unchanged ... */}
    </ResizablePanelGroup>
  </WorkspaceDndProvider>
  ```

- [ ] **Step 5.3: Remove `onMovePanel`, `onReorderPanel`, `onSplitPaneAndPlace` from the `<WorkspaceView>` JSX**

  Still in `src/app/App.tsx`, find the two `<WorkspaceView` elements (there are two: one for each potential `RightPanel` position; actually there is only one `WorkspaceView` in the center panel around line 1024). Remove the three props that are no longer on `WorkspaceView`:

  ```tsx
  <WorkspaceView
    workspaces={workspaces}
    activeWorkspaceId={activeWorkspaceId}
    onActivatePanel={(wsId, panelId) => activatePanel(wsId, panelId)}
    onClosePanel={(wsId, panelId) => {
      const found = findPanelGlobal(panelId);
      if (found?.panel.kind === "terminal") disposeSession(panelId);
      closePanel(wsId, panelId);
    }}
    onFocusPane={(wsId, paneId) => focusPane(wsId, paneId)}
    onNewTerminal={(wsId, paneId) => {
      const ws = workspaces.find((w) => w.id === wsId);
      openPanel(wsId, paneId, {
        id: crypto.randomUUID(),
        kind: "terminal",
        cwd: ws?.cwd,
      });
    }}
    onSplitTerminalRight={...}   {/* keep all these, just remove the three DnD ones */}
    onSplitTerminalDown={...}
    onNewBrowser={...}
    onSplitBrowserRight={...}
    onSplitBrowserDown={...}
    onDividerChange={(wsId, splitId, pos) => setPaneDivider(wsId, splitId, pos)}
    callbacks={panelCallbacks}
    {/* REMOVE: onMovePanel={movePanel} */}
    {/* REMOVE: onReorderPanel={reorderPanel} */}
    {/* REMOVE: onSplitPaneAndPlace={splitPaneAndPlace} */}
  />
  ```

- [ ] **Step 5.4: Verify types compile**

  ```bash
  cd /Users/avilches/Work/Proy/Repos/terax-ai && pnpm check-types
  ```

  Expected: no errors.

- [ ] **Step 5.5: Run full test suite**

  ```bash
  cd /Users/avilches/Work/Proy/Repos/terax-ai && pnpm test
  ```

  Expected: all tests pass.

- [ ] **Step 5.6: Commit**

  ```bash
  git add src/app/App.tsx
  git commit -m "feat(app): wire WorkspaceDndProvider around explorer and workspace panels"
  ```

---

### Task 6: Make `TreeRow` draggable for files

**Files:**
- Modify: `src/modules/explorer/TreeRow.tsx`

- [ ] **Step 6.1: Add `useDraggable` import**

  In `src/modules/explorer/TreeRow.tsx`, add the dnd-kit import after the existing imports:

  ```typescript
  import { useDraggable } from "@dnd-kit/core";
  ```

- [ ] **Step 6.2: Add `useDraggable` to `EntryRowImpl`**

  In `EntryRowImpl`, after the existing `const [isConfirming, setIsConfirming] = useState(false);` line (around line 63), add:

  ```typescript
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `file:${path}`,
    disabled: isDir,
    data: { path },
  });
  ```

- [ ] **Step 6.3: Apply drag props to the button element**

  The non-renaming branch renders a `<button>` (around line 96). Apply the drag ref and listeners to it. Also apply `opacity-50` when dragging. Replace:

  ```tsx
  <button
    type="button"
    data-fs-path={path}
    onClick={handleClick}
    onDoubleClick={() => !isDir && tree.beginRename(path)}
    className={cn(
      "group flex h-6 w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm px-1.5 text-left text-[13px] text-foreground/85 transition-colors hover:bg-accent/70",
      isSelected && "bg-accent text-foreground",
    )}
    style={{ paddingLeft }}
  >
  ```

  With:

  ```tsx
  <button
    ref={setNodeRef}
    type="button"
    data-fs-path={path}
    onClick={handleClick}
    onDoubleClick={() => !isDir && tree.beginRename(path)}
    className={cn(
      "group flex h-6 w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm px-1.5 text-left text-[13px] text-foreground/85 transition-colors hover:bg-accent/70",
      isSelected && "bg-accent text-foreground",
      isDragging && "opacity-50",
    )}
    style={{ paddingLeft }}
    {...listeners}
    {...attributes}
  >
  ```

- [ ] **Step 6.4: Verify types and lint**

  ```bash
  cd /Users/avilches/Work/Proy/Repos/terax-ai && pnpm check-types && pnpm lint
  ```

  Expected: no errors.

- [ ] **Step 6.5: Commit**

  ```bash
  git add src/modules/explorer/TreeRow.tsx
  git commit -m "feat(explorer): make file rows draggable for drop-to-open"
  ```

---

### Task 7: Final verification

- [ ] **Step 7.1: Run full quality suite**

  ```bash
  cd /Users/avilches/Work/Proy/Repos/terax-ai && pnpm lint && pnpm check-types && pnpm test
  ```

  Expected: all pass.

- [ ] **Step 7.2: Manual smoke test**

  Start the app (`pnpm tauri dev`). Verify:
  1. Drag a file from the explorer panel onto the center (zone:center) of a pane — file opens as permanent tab.
  2. Drag a file between two existing tabs — file inserts at that position.
  3. Drag a file to the top/bottom/left/right edge of a pane — pane splits and file opens in the new sub-pane.
  4. Drag a file that is already open — the existing tab moves to the drop location.
  5. The overlay during drag shows `📄 filename.ts` in the same style as tab drag.
  6. Existing tab-to-tab drag still works correctly.
  7. Drag a file to a pane that is at the `workspacePaneLimit` — the split is silently ignored.

- [ ] **Step 7.3: Commit**

  No code changes expected; this step is verification only. If any fixes were needed, commit them:

  ```bash
  git add -p
  git commit -m "fix(workspaces): post-review corrections for explorer drag-to-tab"
  ```
