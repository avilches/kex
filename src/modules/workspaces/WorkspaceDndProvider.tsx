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
} from "@dnd-kit/core";
import { File01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { tabForDroppedPath } from "./lib/dropPanel";
import { allPanes, findTabPane } from "./lib/splitNode";
import {
  insertIntoLeafScratchpad,
  leafCwd,
} from "@/modules/terminal/lib/useTerminalSession";
import {
  scratchpadRefForDrop,
  SCRATCHPAD_DROP_PREFIX,
} from "@/modules/terminal/lib/scratchpadPath";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { basename, tabIcon, tabTitle } from "./lib/tabTitle";
import type { Tab, Workspace } from "./lib/types";
import type { UseWorkspacesReturn } from "./lib/useWorkspaces";

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

export function useWorkspaceDndInsert(): string | null {
  return useContext(WorkspaceDndInsertContext);
}

// The pane drop overlay (z-40, inset-0) sits on top of the scratchpad bar, so a
// pointer over the bar collides with both. Prefer the scratchpad so a path drop
// inserts a reference instead of opening a pane.
const collisionDetection: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  const onScratchpad = collisions.find((c) =>
    String(c.id).startsWith(SCRATCHPAD_DROP_PREFIX),
  );
  if (!onScratchpad) return collisions;
  return [onScratchpad, ...collisions.filter((c) => c !== onScratchpad)];
};

type Props = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  onMoveTab: UseWorkspacesReturn["moveTab"];
  onReorderTab: UseWorkspacesReturn["reorderTab"];
  onSplitPaneAndPlace: UseWorkspacesReturn["splitPaneAndPlace"];
  onSplitPaneAndOpenPanel: UseWorkspacesReturn["splitPaneAndOpenPanel"];
  onOpenPanel: UseWorkspacesReturn["openPanel"];
  children: ReactNode;
};

export function WorkspaceDndProvider({
  workspaces,
  activeWorkspaceId,
  onMoveTab,
  onReorderTab,
  onSplitPaneAndPlace,
  onSplitPaneAndOpenPanel,
  onOpenPanel,
  children,
}: Props) {
  const [draggingItem, setDraggingItem] = useState<DraggingItem | null>(null);
  const [tabInsertPaneId, setTabInsertPaneId] = useState<string | null>(null);

  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  useEffect(() => { activeWorkspaceIdRef.current = activeWorkspaceId; }, [activeWorkspaceId]);

  // panelId → { paneId, wsId } — built once at dragStart, used by handleDragOver (hot path).
  const dragIndexRef = useRef<Map<string, { paneId: string; wsId: string }>>(new Map());

  const buildDragIndex = useCallback(() => {
    const idx = new Map<string, { paneId: string; wsId: string }>();
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
    document.body.style.cursor = "grabbing";
    dragIndexRef.current = buildDragIndex();
    const activeId = String(event.active.id);
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
        if (result) setDraggingItem({ kind: "tab", tab: result.tab, workspaceId: ws.id });
      }
    }
  }

  function handleDragCancel() {
    document.body.style.cursor = "";
    dragIndexRef.current = new Map();
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

    const idx = dragIndexRef.current;
    const activeId = String(event.active.id);
    const isFileDrag =
      activeId.startsWith("file:") ||
      activeId.startsWith("dir:") ||
      activeId.startsWith("dir-pane:");

    const targetEntry = idx.get(refPanelId);
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
    document.body.style.cursor = "";
    const idx = dragIndexRef.current;
    dragIndexRef.current = new Map();
    setDraggingItem(null);
    setTabInsertPaneId(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
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

    handleTabDragEnd(activeId, overId, idx);
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

  function handleFileDragEnd(filePath: string, overId: string, idx: Map<string, { paneId: string; wsId: string }>, isDir: boolean) {
    const activeWs = workspaces.find((ws) => ws.id === activeWorkspaceIdRef.current);
    if (!activeWs) return;
    const panes = allPanes(activeWs.paneTree);

    // Folders open a fresh terminal at that cwd; files reuse an already-open editor.
    const makePanel = (): Tab => tabForDroppedPath(filePath, isDir);

    let existingPanelId: string | null = null;
    if (!isDir) {
      for (const pane of panes) {
        const found = pane.tabs.find((p) => p.kind === "editor" && p.path === filePath);
        if (found) { existingPanelId = found.id; break; }
      }
    }

    if (overId.startsWith("tab-insert:")) {
      const parts = overId.split(":");
      const refPanelId = parts[1];
      const side = parts[2];
      if (!refPanelId || (side !== "before" && side !== "after")) return;

      const targetEntry = idx.get(refPanelId);
      if (!targetEntry) return;
      const targetPaneId = targetEntry.paneId;
      const targetPane = panes.find((p) => p.id === targetPaneId);
      if (!targetPane) return;
      const refPanelIndex = targetPane.tabs.findIndex((p) => p.id === refPanelId);
      if (refPanelIndex === -1) return;

      const insertionIndex = refPanelIndex + (side === "after" ? 1 : 0);

      if (existingPanelId) {
        const sourcePaneId = idx.get(existingPanelId)?.paneId ?? null;
        if (!sourcePaneId) return;
        if (sourcePaneId === targetPaneId) {
          onReorderTab(activeWorkspaceIdRef.current, existingPanelId, insertionIndex);
        } else {
          onMoveTab(activeWorkspaceIdRef.current, existingPanelId, targetPaneId, insertionIndex);
        }
      } else {
        onOpenPanel(activeWorkspaceIdRef.current, targetPaneId, makePanel(), insertionIndex);
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
      if (existingPanelId) {
        const sourcePaneId = idx.get(existingPanelId)?.paneId ?? null;
        if (sourcePaneId === targetPaneId) return;
        onMoveTab(activeWorkspaceIdRef.current, existingPanelId, targetPaneId);
      } else {
        onOpenPanel(activeWorkspaceIdRef.current, targetPaneId, makePanel());
      }
    } else {
      const { workspacePaneLimit } = usePreferencesStore.getState();
      if (panes.length >= workspacePaneLimit) return;
      if (existingPanelId) {
        onSplitPaneAndPlace(activeWorkspaceIdRef.current, targetPaneId, zone, existingPanelId);
      } else {
        onSplitPaneAndOpenPanel(activeWorkspaceIdRef.current, targetPaneId, zone, makePanel());
      }
    }
  }

  function handleTabDragEnd(panelId: string, overId: string, idx: Map<string, { paneId: string; wsId: string }>) {
    const sourceEntry = idx.get(panelId);
    if (!sourceEntry) return;
    const { paneId: sourcePaneId, wsId: sourceWorkspaceId } = sourceEntry;
    const sourceWs = workspaces.find((ws) => ws.id === sourceWorkspaceId);
    if (!sourceWs) return;

    if (overId.startsWith("tab-insert:")) {
      const parts = overId.split(":");
      const refPanelId = parts[1];
      const side = parts[2];
      if (!refPanelId || !side) return;
      if (side !== "before" && side !== "after") return;

      const targetEntry = idx.get(refPanelId);
      if (!targetEntry) return;
      const targetPaneId = targetEntry.paneId;
      const targetPane = allPanes(sourceWs.paneTree).find((p) => p.id === targetPaneId);
      if (!targetPane) return;
      const refPanelIndex = targetPane.tabs.findIndex((p) => p.id === refPanelId);
      if (refPanelIndex === -1) return;

      const insertionIndex = refPanelIndex + (side === "after" ? 1 : 0);
      if (sourcePaneId === targetPaneId) {
        onReorderTab(sourceWorkspaceId, panelId, insertionIndex);
      } else {
        onMoveTab(sourceWorkspaceId, panelId, targetPaneId, insertionIndex);
      }
      return;
    }

    if (!overId.startsWith("zone:")) return;
    const parts = overId.split(":");
    const targetPaneId = parts[1]!;
    const zone = parts[2] as "top" | "bottom" | "left" | "right" | "center";

    const sourcePanes = allPanes(sourceWs.paneTree);
    if (!sourcePanes.some((p) => p.id === targetPaneId)) return;

    if (zone === "center") {
      if (sourcePaneId === targetPaneId) return;
      onMoveTab(sourceWorkspaceId, panelId, targetPaneId);
    } else {
      const { workspacePaneLimit } = usePreferencesStore.getState();
      if (sourcePanes.length >= workspacePaneLimit) return;
      onSplitPaneAndPlace(sourceWorkspaceId, targetPaneId, zone, panelId);
    }
  }

  const ctxValue = useMemo(() => ({ draggingItem }), [draggingItem]);

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
        <WorkspaceDndInsertContext.Provider value={tabInsertPaneId}>
          {children}
        </WorkspaceDndInsertContext.Provider>
      </WorkspaceDndContext.Provider>
      <DragOverlay dropAnimation={null}>
        {draggingItem?.kind === "tab" && (
          <div className="pointer-events-none flex items-center gap-1 text-[11px] text-foreground">
            <span className="shrink-0 opacity-70">{tabIcon(draggingItem.tab, draggingItem.workspaceId)}</span>
            <span className="max-w-[120px] truncate">{tabTitle(draggingItem.tab)}</span>
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
