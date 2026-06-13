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
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { allPanes, findPanelPane } from "./lib/splitNode";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { basename, panelIcon, panelTitle } from "./lib/panelTitle";
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
    if (activeId.startsWith("dir:")) {
      setDraggingItem({ kind: "file", path: activeId.slice(4) });
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
      const activeWs = workspaces.find((ws) => ws.id === activeWorkspaceIdRef.current);
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

      let targetPaneId: string | null = null;
      let refPanelIndex = -1;
      for (const pane of panes) {
        const idx = pane.panels.findIndex((p) => p.id === refPanelId);
        if (idx !== -1) { targetPaneId = pane.id; refPanelIndex = idx; break; }
      }
      if (!targetPaneId || refPanelIndex === -1) return;

      const insertionIndex = refPanelIndex + (side === "after" ? 1 : 0);

      if (existingPanelId) {
        const sourceResult = findPanelPane(activeWs.paneTree, existingPanelId);
        if (!sourceResult) return;
        if (sourceResult.pane.id === targetPaneId) {
          onReorderPanel(activeWorkspaceIdRef.current, existingPanelId, insertionIndex);
        } else {
          onMovePanel(activeWorkspaceIdRef.current, existingPanelId, targetPaneId, insertionIndex);
        }
      } else {
        const panel: Panel = { id: crypto.randomUUID(), kind: "editor", path: filePath, preview: false, dirty: false };
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
        const sourceResult = findPanelPane(activeWs.paneTree, existingPanelId);
        if (sourceResult?.pane.id === targetPaneId) return;
        onMovePanel(activeWorkspaceIdRef.current, existingPanelId, targetPaneId);
      } else {
        const panel: Panel = { id: crypto.randomUUID(), kind: "editor", path: filePath, preview: false, dirty: false };
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
      if (allPanes(sourceWs.paneTree).length >= workspacePaneLimit) return;
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
