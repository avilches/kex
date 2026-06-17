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
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { allPanes, findPanelPane } from "./lib/splitNode";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { basename, panelIcon, panelTitle } from "./lib/panelTitle";
import type { Panel, Workspace } from "./lib/types";
import type { UseWorkspacesReturn } from "./lib/useWorkspaces";
import { newPanelId } from "@/lib/ids";

type DraggingItem =
  | { kind: "panel"; panel: Panel; workspaceId: string }
  | { kind: "file"; path: string };

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

  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  useEffect(() => { activeWorkspaceIdRef.current = activeWorkspaceId; }, [activeWorkspaceId]);

  // panelId → { paneId, wsId } — built once at dragStart, used by handleDragOver (hot path).
  const dragIndexRef = useRef<Map<string, { paneId: string; wsId: string }>>(new Map());

  const buildDragIndex = useCallback(() => {
    const idx = new Map<string, { paneId: string; wsId: string }>();
    for (const ws of workspaces) {
      for (const pane of allPanes(ws.paneTree)) {
        for (const panel of pane.panels) {
          idx.set(panel.id, { paneId: pane.id, wsId: ws.id });
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
      setDraggingItem({ kind: "file", path: activeId.slice(5) });
      return;
    }
    if (activeId.startsWith("dir:")) {
      setDraggingItem({ kind: "file", path: activeId.slice(4) });
      return;
    }
    const entry = dragIndexRef.current.get(activeId);
    if (entry) {
      const ws = workspaces.find((w) => w.id === entry.wsId);
      if (ws) {
        const result = findPanelPane(ws.paneTree, activeId);
        if (result) setDraggingItem({ kind: "panel", panel: result.panel, workspaceId: ws.id });
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
    const isFileDrag = activeId.startsWith("file:");

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
      handleFileDragEnd(activeId.slice(5), overId, idx);
      return;
    }

    handlePanelDragEnd(activeId, overId, idx);
  }

  function handleFileDragEnd(filePath: string, overId: string, idx: Map<string, { paneId: string; wsId: string }>) {
    const activeWs = workspaces.find((ws) => ws.id === activeWorkspaceIdRef.current);
    if (!activeWs) return;
    const panes = allPanes(activeWs.paneTree);

    let existingPanelId: string | null = null;
    for (const pane of panes) {
      const found = pane.panels.find((p) => p.kind === "editor" && p.path === filePath);
      if (found) { existingPanelId = found.id; break; }
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
      const refPanelIndex = targetPane.panels.findIndex((p) => p.id === refPanelId);
      if (refPanelIndex === -1) return;

      const insertionIndex = refPanelIndex + (side === "after" ? 1 : 0);

      if (existingPanelId) {
        const sourcePaneId = idx.get(existingPanelId)?.paneId ?? null;
        if (!sourcePaneId) return;
        if (sourcePaneId === targetPaneId) {
          onReorderPanel(activeWorkspaceIdRef.current, existingPanelId, insertionIndex);
        } else {
          onMovePanel(activeWorkspaceIdRef.current, existingPanelId, targetPaneId, insertionIndex);
        }
      } else {
        const panel: Panel = { id: newPanelId(), kind: "editor", path: filePath, preview: false, dirty: false };
        onOpenPanel(activeWorkspaceIdRef.current, targetPaneId, panel, insertionIndex);
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
        onMovePanel(activeWorkspaceIdRef.current, existingPanelId, targetPaneId);
      } else {
        const panel: Panel = { id: newPanelId(), kind: "editor", path: filePath, preview: false, dirty: false };
        onOpenPanel(activeWorkspaceIdRef.current, targetPaneId, panel);
      }
    } else {
      const { workspacePaneLimit } = usePreferencesStore.getState();
      if (panes.length >= workspacePaneLimit) return;
      if (existingPanelId) {
        onSplitPaneAndPlace(activeWorkspaceIdRef.current, targetPaneId, zone, existingPanelId);
      } else {
        onSplitPaneAndOpenFile(activeWorkspaceIdRef.current, targetPaneId, zone, filePath);
      }
    }
  }

  function handlePanelDragEnd(panelId: string, overId: string, idx: Map<string, { paneId: string; wsId: string }>) {
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
      const refPanelIndex = targetPane.panels.findIndex((p) => p.id === refPanelId);
      if (refPanelIndex === -1) return;

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

    const sourcePanes = allPanes(sourceWs.paneTree);
    if (!sourcePanes.some((p) => p.id === targetPaneId)) return;

    if (zone === "center") {
      if (sourcePaneId === targetPaneId) return;
      onMovePanel(sourceWorkspaceId, panelId, targetPaneId);
    } else {
      const { workspacePaneLimit } = usePreferencesStore.getState();
      if (sourcePanes.length >= workspacePaneLimit) return;
      onSplitPaneAndPlace(sourceWorkspaceId, targetPaneId, zone, panelId);
    }
  }

  const ctxValue = useMemo(() => ({ draggingItem }), [draggingItem]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
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
