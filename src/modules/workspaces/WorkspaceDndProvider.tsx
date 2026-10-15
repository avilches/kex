import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type Modifier,
} from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { File01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { closestCenter } from "@dnd-kit/core";
import { tabForDroppedPath } from "./lib/dropTab";
import { allPanes, findOpenPathTab, findTabPane } from "./lib/splitNode";
import {
  canDropTabOnWorkspace,
  draggedId,
  originToRestore,
  resolveSideRowDrop,
  resolveTabDrop,
  SIDE_ROW_DROP_PREFIX,
  sideRowSide,
  sidebarTabDragId,
  tabDropRoute,
  type SideRowDropData,
  type TabLocation,
} from "./lib/tabDrop";
import type { TabMoveRequest } from "./lib/tabTransfer";
import {
  insertIntoLeafScratchpad,
  leafCwd,
} from "@/modules/terminal/lib/useTerminalSession";
import {
  scratchpadRefForDrop,
  SCRATCHPAD_DROP_PREFIX,
} from "@/modules/terminal/lib/scratchpadPath";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { basename, tabIcon } from "./lib/tabTitle";
import { tabDisplayTitleNow } from "./lib/tabTitleNow";
import type { Tab, Workspace } from "./lib/types";
import type { UseWorkspacesReturn } from "./lib/useWorkspaces";

const EDITOR_ONLY: ReadonlySet<Tab["kind"]> = new Set(["editor"]);

type DraggingItem =
  | { kind: "tab"; tab: Tab; workspaceId: string }
  // paneOnly: drags that may only open a terminal in a pane (the explorer's
  // synthetic root and ".." rows), never participate in internal explorer moves.
  | { kind: "file"; path: string; isDir: boolean; paneOnly?: boolean };

type WorkspaceDndContextValue = {
  draggingItem: DraggingItem | null;
};

const WorkspaceDndContext = createContext<WorkspaceDndContextValue>({
  draggingItem: null,
});

// Separate context so tabInsertPaneId changes (every dragover) only re-render
// PaneDropOverlay, not the entire workspace tree.
const WorkspaceDndInsertContext = createContext<string | null>(null);

export function useWorkspaceDnd(): WorkspaceDndContextValue {
  return useContext(WorkspaceDndContext);
}

// Workspace of the WorkspaceBar under the pointer during a tab drag. Its own
// context so hover changes only re-render the bar items that read it.
type WorkspaceDropTarget = { id: string | null; set: (id: string | null) => void };

const WorkspaceDropTargetContext = createContext<WorkspaceDropTarget>({ id: null, set: () => {} });

export function useWorkspaceDropTarget(): WorkspaceDropTarget {
  return useContext(WorkspaceDropTargetContext);
}

// The WorkspaceBar sorts workspaces and groups with the same DndContext as the
// tabs (a nested one would hide the pane drop zones from the bar's tab rows),
// so it hands its handlers and its drag overlay to this provider.
export type BarDndHandlers = {
  collision: CollisionDetection;
  onDragStart: (e: DragStartEvent) => void;
  onDragOver: (e: DragOverEvent) => void;
  onDragEnd: (e: DragEndEvent) => void;
  onDragCancel: () => void;
};

type BarDndBinding = {
  setHandlers: (h: BarDndHandlers) => void;
  setOverlay: (node: ReactNode, dropAnimation: DropAnimation) => void;
};

const BarDndBindingContext = createContext<BarDndBinding>({
  setHandlers: () => {},
  setOverlay: () => {},
});

export function useBarDndBinding(): BarDndBinding {
  return useContext(BarDndBindingContext);
}

type BarDragSource = { data: { current?: { type?: unknown } } };

function isBarDrag(active: BarDragSource): boolean {
  const type = active.data.current?.type;
  return type === "workspace" || type === "group";
}

export { sidebarTabDragId };

function sideRowData(data: Record<string, unknown> | undefined): SideRowDropData | null {
  return data?.sideRow === true ? (data as unknown as SideRowDropData) : null;
}

// A row of the WorkspaceBar is much wider than its ghost, so the overlay is
// pinned next to the pointer instead of keeping the row's own offset.
const GHOST_OFFSET = 8;
const pinSidebarTabGhost: Modifier = ({ active, activatorEvent, draggingNodeRect, transform }) => {
  if (active?.data.current?.type !== "tab" || !draggingNodeRect || !activatorEvent) return transform;
  const pointer = getEventCoordinates(activatorEvent);
  if (!pointer) return transform;
  return {
    ...transform,
    x: transform.x + pointer.x - draggingNodeRect.left + GHOST_OFFSET,
    y: transform.y + pointer.y - draggingNodeRect.top + GHOST_OFFSET,
  };
};

export function useWorkspaceDndInsert(): string | null {
  return useContext(WorkspaceDndInsertContext);
}

// The pane drop overlay (z-40, inset-0) sits on top of the scratchpad bar, so a
// pointer over the bar collides with both. Prefer the scratchpad so a path drop
// inserts a reference instead of opening a pane.
const tabCollisionDetection: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  const onScratchpad = collisions.find((c) =>
    String(c.id).startsWith(SCRATCHPAD_DROP_PREFIX),
  );
  // A sidebar row sits inside its workspace's sortable item, which also collides.
  const preferred = onScratchpad ?? collisions.find((c) => String(c.id).startsWith(SIDE_ROW_DROP_PREFIX));
  if (!preferred) return collisions;
  return [preferred, ...collisions.filter((c) => c !== preferred)];
};

type Props = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  onMoveTab: UseWorkspacesReturn["moveTab"];
  onReorderTab: UseWorkspacesReturn["reorderTab"];
  onSplitPaneAndPlace: UseWorkspacesReturn["splitPaneAndPlace"];
  onSplitPaneAndOpenTab: UseWorkspacesReturn["splitPaneAndOpenTab"];
  onOpenTab: UseWorkspacesReturn["openTab"];
  onMoveTabToWorkspace: (sourceWorkspaceId: string, tabId: string, request: TabMoveRequest) => Promise<string | null>;
  onSelectWorkspace: (id: string) => void;
  children: ReactNode;
};

export function WorkspaceDndProvider({
  workspaces,
  activeWorkspaceId,
  onMoveTab,
  onReorderTab,
  onSplitPaneAndPlace,
  onSplitPaneAndOpenTab,
  onOpenTab,
  onMoveTabToWorkspace,
  onSelectWorkspace,
  children,
}: Props) {
  const [draggingItem, setDraggingItem] = useState<DraggingItem | null>(null);
  const [tabInsertPaneId, setTabInsertPaneId] = useState<string | null>(null);
  const [dropWorkspaceId, setDropWorkspaceIdState] = useState<string | null>(null);
  const dropWorkspaceIdRef = useRef<string | null>(null);
  const setDropWorkspaceId = useCallback((id: string | null) => {
    dropWorkspaceIdRef.current = id;
    setDropWorkspaceIdState(id);
  }, []);

  const barHandlersRef = useRef<BarDndHandlers | null>(null);
  const [barOverlay, setBarOverlay] = useState<{ node: ReactNode; dropAnimation: DropAnimation } | null>(null);
  const barBinding = useMemo<BarDndBinding>(
    () => ({
      setHandlers: (h) => {
        barHandlersRef.current = h;
      },
      setOverlay: (node, dropAnimation) => setBarOverlay({ node, dropAnimation }),
    }),
    [],
  );
  const collisionDetection = useCallback<CollisionDetection>(
    (args) =>
      isBarDrag(args.active)
        ? (barHandlersRef.current?.collision ?? closestCenter)(args)
        : tabCollisionDetection(args),
    [],
  );

  const workspaceIdsRef = useRef<string[]>([]);
  workspaceIdsRef.current = workspaces.map((w) => w.id);

  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  useEffect(() => { activeWorkspaceIdRef.current = activeWorkspaceId; }, [activeWorkspaceId]);

  // tabId → { paneId, wsId } - built once at dragStart, used by handleDragOver (hot path).
  const dragIndexRef = useRef<Map<string, TabLocation>>(new Map());
  const originWorkspaceIdRef = useRef<string | null>(null);

  const buildDragIndex = useCallback(() => {
    const idx = new Map<string, TabLocation>();
    for (const ws of workspaces) {
      for (const pane of allPanes(ws.paneTree)) {
        for (const tab of pane.tabs) {
          idx.set(tab.id, { paneId: pane.id, wsId: ws.id });
        }
      }
    }
    return idx;
  }, [workspaces]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    if (isBarDrag(event.active)) {
      barHandlersRef.current?.onDragStart(event);
      return;
    }
    document.body.style.cursor = "grabbing";
    dragIndexRef.current = buildDragIndex();
    const activeId = draggedId(event.active.id);
    if (activeId.startsWith("file:")) {
      setDraggingItem({ kind: "file", path: activeId.slice(5), isDir: false });
      return;
    }
    if (activeId.startsWith("dir-pane:")) {
      setDraggingItem({ kind: "file", path: activeId.slice(9), isDir: true, paneOnly: true });
      return;
    }
    if (activeId.startsWith("dir:")) {
      setDraggingItem({ kind: "file", path: activeId.slice(4), isDir: true });
      return;
    }
    const entry = dragIndexRef.current.get(activeId);
    if (entry) {
      const ws = workspaces.find((w) => w.id === entry.wsId);
      if (ws) {
        const result = findTabPane(ws.paneTree, activeId);
        if (result) {
          setDraggingItem({ kind: "tab", tab: result.tab, workspaceId: ws.id });
          originWorkspaceIdRef.current = activeWorkspaceIdRef.current;
        }
      }
    }
  }

  // Taken synchronously when a drag ends: a transfer settles later, by which
  // time a new drag may already have stored its own origin.
  function takeOrigin(): string | null {
    const id = originWorkspaceIdRef.current;
    originWorkspaceIdRef.current = null;
    return id;
  }

  function restoreOrigin(placed: boolean, originId: string | null) {
    const target = originToRestore(originId, activeWorkspaceIdRef.current, placed, workspaceIdsRef.current);
    if (target) onSelectWorkspace(target);
  }

  // A focused terminal swallows Escape before dnd-kit's sensor sees it, so the
  // key is caught on the way down and replayed on the document, where the sensor listens.
  const dragging = draggingItem !== null;
  useEffect(() => {
    if (!dragging) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || !e.isTrusted) return;
      e.stopPropagation();
      e.preventDefault();
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true }));
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [dragging]);

  function handleDragCancel() {
    if (draggingItem === null) {
      barHandlersRef.current?.onDragCancel();
      return;
    }
    restoreOrigin(false, takeOrigin());
    document.body.style.cursor = "";
    dragIndexRef.current = new Map();
    setDraggingItem(null);
    setTabInsertPaneId(null);
    setDropWorkspaceId(null);
  }

  function handleDragOver(event: DragOverEvent) {
    if (isBarDrag(event.active)) {
      barHandlersRef.current?.onDragOver(event);
      return;
    }
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId?.startsWith("tab-insert:")) {
      setTabInsertPaneId(null);
      return;
    }
    const parts = overId.split(":");
    const refTabId = parts[1];
    if (!refTabId) { setTabInsertPaneId(null); return; }

    const idx = dragIndexRef.current;
    const activeId = draggedId(event.active.id);
    const isFileDrag =
      activeId.startsWith("file:") ||
      activeId.startsWith("dir:") ||
      activeId.startsWith("dir-pane:");

    const targetEntry = idx.get(refTabId);
    if (!targetEntry) { setTabInsertPaneId(null); return; }

    if (isFileDrag) {
      // For file drags, only allow drop into the active workspace.
      if (targetEntry.wsId !== activeWorkspaceIdRef.current) {
        setTabInsertPaneId(null);
        return;
      }
      setTabInsertPaneId(targetEntry.paneId);
      return;
    }

    const sourceEntry = idx.get(activeId);
    if (!sourceEntry) { setTabInsertPaneId(null); return; }
    setTabInsertPaneId(targetEntry.paneId !== sourceEntry.paneId ? targetEntry.paneId : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    if (isBarDrag(event.active)) {
      barHandlersRef.current?.onDragEnd(event);
      return;
    }
    const originId = takeOrigin();
    document.body.style.cursor = "";
    const idx = dragIndexRef.current;
    dragIndexRef.current = new Map();
    setDraggingItem(null);
    setTabInsertPaneId(null);
    const barWorkspaceId = dropWorkspaceIdRef.current;
    setDropWorkspaceId(null);
    const { active, over } = event;
    // The rows sit inside their workspace's hover area, so a row drop must win over the workspace drop.
    const sideRow = draggingItem?.kind === "tab" ? sideRowData(over?.data.current) : null;
    const route = tabDropRoute({
      isTabDrag: draggingItem?.kind === "tab",
      overSideRow: sideRow !== null && over !== null,
      barWorkspaceId,
    });
    if (route === "side-row" && sideRow && over) {
      const pointer = getEventCoordinates(event.activatorEvent);
      const side = sideRowSide(over.rect, (pointer?.y ?? 0) + event.delta.y);
      const rowOverId = resolveSideRowDrop(sideRow, side, workspaces);
      if (!rowOverId) {
        restoreOrigin(false, originId);
        return;
      }
      const placed = handleTabDragEnd(draggedId(active.id), rowOverId, idx);
      if (typeof placed === "boolean") restoreOrigin(placed, originId);
      else void placed.then((ok) => restoreOrigin(ok, originId));
      return;
    }
    if (route === "workspace" && barWorkspaceId) {
      const source = idx.get(draggedId(active.id));
      const target = workspaces.find((w) => w.id === barWorkspaceId);
      if (!source || !target || !canDropTabOnWorkspace(source.wsId, target)) {
        restoreOrigin(false, originId);
        return;
      }
      void onMoveTabToWorkspace(source.wsId, draggedId(active.id), { kind: "auto", workspaceId: barWorkspaceId }).then(
        (destinationId) => restoreOrigin(destinationId !== null, originId),
      );
      return;
    }
    if (!over) {
      restoreOrigin(false, originId);
      return;
    }

    const activeId = draggedId(active.id);
    const overId = String(over.id);

    if (activeId.startsWith("file:")) {
      if (handleScratchpadDrop(activeId.slice(5), overId)) return;
      handleFileDragEnd(activeId.slice(5), overId, idx, false);
      return;
    }
    if (activeId.startsWith("dir-pane:")) {
      if (handleScratchpadDrop(activeId.slice(9), overId)) return;
      handleFileDragEnd(activeId.slice(9), overId, idx, true);
      return;
    }
    if (activeId.startsWith("dir:")) {
      if (handleScratchpadDrop(activeId.slice(4), overId)) return;
      handleFileDragEnd(activeId.slice(4), overId, idx, true);
      return;
    }

    const placed = handleTabDragEnd(activeId, overId, idx);
    if (typeof placed === "boolean") restoreOrigin(placed, originId);
    else void placed.then((ok) => restoreOrigin(ok, originId));
  }

  // A file/folder dropped on a terminal's scratchpad bar inserts its path,
  // relative to that terminal's cwd, as an `@`-prefixed reference.
  function handleScratchpadDrop(filePath: string, overId: string): boolean {
    if (!overId.startsWith(SCRATCHPAD_DROP_PREFIX)) return false;
    const leafId = overId.slice(SCRATCHPAD_DROP_PREFIX.length);
    const cwd = leafCwd(leafId);
    const ref = cwd ? scratchpadRefForDrop(cwd, filePath) : `@${filePath}`;
    insertIntoLeafScratchpad(leafId, ref);
    return true;
  }

  function handleFileDragEnd(filePath: string, overId: string, idx: Map<string, TabLocation>, isDir: boolean) {
    const activeWs = workspaces.find((ws) => ws.id === activeWorkspaceIdRef.current);
    if (!activeWs) return;
    const panes = allPanes(activeWs.paneTree);

    // Folders open a fresh terminal at that cwd; files reuse an already-open editor.
    const makeTab = (): Tab => tabForDroppedPath(filePath, isDir);

    // Dropping a file always builds an "editor" tab (see tabForDroppedPath), so
    // only that kind counts as already open here (never "markdown").
    const existingTabId = isDir
      ? null
      : (findOpenPathTab(activeWs.paneTree, filePath, EDITOR_ONLY)?.tab.id ?? null);

    if (overId.startsWith("tab-insert:")) {
      const parts = overId.split(":");
      const refTabId = parts[1];
      const side = parts[2];
      if (!refTabId || (side !== "before" && side !== "after")) return;

      const targetEntry = idx.get(refTabId);
      if (!targetEntry) return;
      const targetPaneId = targetEntry.paneId;
      const targetPane = panes.find((p) => p.id === targetPaneId);
      if (!targetPane) return;
      const refTabIndex = targetPane.tabs.findIndex((p) => p.id === refTabId);
      if (refTabIndex === -1) return;

      const insertionIndex = refTabIndex + (side === "after" ? 1 : 0);

      if (existingTabId) {
        const sourcePaneId = idx.get(existingTabId)?.paneId ?? null;
        if (!sourcePaneId) return;
        if (sourcePaneId === targetPaneId) {
          onReorderTab(activeWorkspaceIdRef.current, existingTabId, insertionIndex);
        } else {
          onMoveTab(activeWorkspaceIdRef.current, existingTabId, targetPaneId, insertionIndex);
        }
      } else {
        onOpenTab(activeWorkspaceIdRef.current, targetPaneId, makeTab(), insertionIndex);
      }
      return;
    }

    if (!overId.startsWith("zone:")) return;
    const parts = overId.split(":");
    const targetPaneId = parts[1]!;
    const zone = parts[2] as "top" | "bottom" | "left" | "right" | "center";

    const targetPaneExists = panes.some((p) => p.id === targetPaneId);
    if (!targetPaneExists) return;

    if (zone === "center") {
      if (existingTabId) {
        const sourcePaneId = idx.get(existingTabId)?.paneId ?? null;
        if (sourcePaneId === targetPaneId) return;
        onMoveTab(activeWorkspaceIdRef.current, existingTabId, targetPaneId);
      } else {
        onOpenTab(activeWorkspaceIdRef.current, targetPaneId, makeTab());
      }
    } else {
      const { workspacePaneLimit } = usePreferencesStore.getState();
      if (panes.length >= workspacePaneLimit) return;
      if (existingTabId) {
        onSplitPaneAndPlace(activeWorkspaceIdRef.current, targetPaneId, zone, existingTabId);
      } else {
        onSplitPaneAndOpenTab(activeWorkspaceIdRef.current, targetPaneId, zone, makeTab());
      }
    }
  }

  function handleTabDragEnd(tabId: string, overId: string, idx: Map<string, TabLocation>): boolean | Promise<boolean> {
    const action = resolveTabDrop(overId, tabId, workspaces, idx, usePreferencesStore.getState().workspacePaneLimit);
    if (!action) return false;
    switch (action.kind) {
      case "reorder":
        onReorderTab(action.workspaceId, action.tabId, action.index);
        return true;
      case "move":
        onMoveTab(action.workspaceId, action.tabId, action.paneId, action.index);
        return true;
      case "split":
        onSplitPaneAndPlace(action.workspaceId, action.paneId, action.direction, action.tabId);
        return true;
      case "transfer":
        return onMoveTabToWorkspace(action.sourceWorkspaceId, action.tabId, action.request).then((id) => id !== null);
    }
  }

  const ctxValue = useMemo(() => ({ draggingItem }), [draggingItem]);
  const dropTargetValue = useMemo(
    () => ({ id: dropWorkspaceId, set: setDropWorkspaceId }),
    [dropWorkspaceId, setDropWorkspaceId],
  );

  return (
    <DndContext
      // Fixed layout: dnd auto-scroll would shift the whole viewport when a drag reaches the window edge.
      autoScroll={false}
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <WorkspaceDndContext.Provider value={ctxValue}>
        <WorkspaceDropTargetContext.Provider value={dropTargetValue}>
          <WorkspaceDndInsertContext.Provider value={tabInsertPaneId}>
            <BarDndBindingContext.Provider value={barBinding}>{children}</BarDndBindingContext.Provider>
          </WorkspaceDndInsertContext.Provider>
        </WorkspaceDropTargetContext.Provider>
      </WorkspaceDndContext.Provider>
      {/* Without pointer-events-none the overlay under the cursor swallows the WorkspaceBar hover. */}
      <DragOverlay
        modifiers={[pinSidebarTabGhost]}
        dropAnimation={draggingItem ? null : (barOverlay?.dropAnimation ?? null)}
        className="pointer-events-none"
      >
        {!draggingItem && barOverlay?.node}
        {draggingItem?.kind === "tab" && (
          <div className="pointer-events-none flex items-center gap-1 text-[11px] text-foreground">
            <span className="shrink-0 opacity-70">{tabIcon(draggingItem.tab)}</span>
            <span className="max-w-[120px] truncate">{tabDisplayTitleNow(draggingItem.tab)}</span>
          </div>
        )}
        {draggingItem?.kind === "file" && (
          <div className="pointer-events-none flex items-center gap-1 text-[11px] text-foreground">
            <span className="shrink-0 opacity-70">
              <HugeiconsIcon icon={draggingItem.isDir ? Folder01Icon : File01Icon} size={14} strokeWidth={1.5} />
            </span>
            <span className="max-w-[120px] truncate">{basename(draggingItem.path)}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
