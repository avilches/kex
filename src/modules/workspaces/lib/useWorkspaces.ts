import { useCallback, useEffect, useRef, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import {
  allPaneIds,
  findPane,
  findPanelPane,
  firstPaneId,
  movePanelBetweenPanes,
  removePaneFromTree,
  siblingPane,
  splitPaneInTree,
  updateDivider,
  updatePane,
} from "./splitNode";
import type { Panel, PaneNode, Workspace } from "./types";

function newPaneNode(cwd?: string): PaneNode {
  const panelId = crypto.randomUUID();
  return {
    kind: "pane",
    id: crypto.randomUUID(),
    panels: [{ id: panelId, kind: "terminal", cwd }],
    activePanelId: panelId,
  };
}

function newWorkspace(cwd?: string): Workspace {
  const pane = newPaneNode(cwd);
  return {
    id: crypto.randomUUID(),
    title: cwd ? (cwd.split(/[\\/]/).filter(Boolean).slice(-1)[0] ?? "shell") : "shell",
    cwd,
    paneTree: pane,
    activePaneId: pane.id,
  };
}

export function useWorkspaces(initial?: { cwd?: string; initialWorkspaces?: Workspace[]; initialActiveIndex?: number }) {
  // Pre-compute stable initial state once so both useState lazies share the same objects
  const initRef = useRef<{ workspaces: Workspace[]; activeId: string } | null>(null);
  if (initRef.current === null) {
    const savedWs = initial?.initialWorkspaces;
    if (savedWs && savedWs.length > 0) {
      const idx = Math.max(0, Math.min(initial?.initialActiveIndex ?? 0, savedWs.length - 1));
      initRef.current = { workspaces: savedWs, activeId: savedWs[idx]!.id };
    } else {
      const ws = newWorkspace(initial?.cwd);
      initRef.current = { workspaces: [ws], activeId: ws.id };
    }
  }

  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => initRef.current!.workspaces);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() => initRef.current!.activeId);

  const workspacesRef = useRef(workspaces);
  useEffect(() => { workspacesRef.current = workspaces; }, [workspaces]);

  // ── Workspace operations ──────────────────────────────────────────────────

  const addWorkspace = useCallback((cwd?: string): string => {
    const ws = newWorkspace(cwd);
    setWorkspaces((prev) => [...prev, ws]);
    setActiveWorkspaceId(ws.id);
    return ws.id;
  }, []);

  const reorderWorkspaces = useCallback((fromId: string, toId: string) => {
    setWorkspaces((prev) => {
      const from = prev.findIndex((w) => w.id === fromId);
      const to = prev.findIndex((w) => w.id === toId);
      if (from === -1 || to === -1 || from === to) return prev;
      return arrayMove(prev, from, to);
    });
  }, []);

  const closeWorkspace = useCallback((id: string) => {
    setWorkspaces((prev) => {
      if (prev.length <= 1) return prev; // never close last workspace
      return prev.filter((w) => w.id !== id);
    });
    setActiveWorkspaceId((prev) => {
      if (prev !== id) return prev;
      const remaining = workspacesRef.current.filter((w) => w.id !== id);
      return remaining[remaining.length - 1]?.id ?? prev;
    });
  }, []);

  // ── Pane operations ───────────────────────────────────────────────────────

  const splitPane = useCallback((workspaceId: string, paneId: string, orientation: "horizontal" | "vertical"): string => {
    const newPaneId = crypto.randomUUID();
    const newSplitId = crypto.randomUUID();
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        return {
          ...w,
          paneTree: splitPaneInTree(w.paneTree, paneId, newSplitId, newPaneId, orientation),
          activePaneId: newPaneId,
        };
      }),
    );
    return newPaneId;
  }, []);

  const closePane = useCallback((workspaceId: string, paneId: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        const newTree = removePaneFromTree(w.paneTree, paneId);
        if (!newTree) return w; // never remove last pane
        const sibling = siblingPane(w.paneTree, paneId);
        const newActiveId =
          w.activePaneId === paneId
            ? (sibling?.id ?? firstPaneId(newTree))
            : w.activePaneId;
        return { ...w, paneTree: newTree, activePaneId: newActiveId };
      }),
    );
  }, []);

  const focusPane = useCallback((workspaceId: string, paneId: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => w.id !== workspaceId ? w : { ...w, activePaneId: paneId }),
    );
  }, []);

  const setPaneDivider = useCallback((workspaceId: string, splitId: string, position: number) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        return { ...w, paneTree: updateDivider(w.paneTree, splitId, position) };
      }),
    );
  }, []);

  const movePanel = useCallback((workspaceId: string, panelId: string, targetPaneId: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        const sourceResult = findPanelPane(w.paneTree, panelId);
        if (!sourceResult || sourceResult.pane.id === targetPaneId) return w;
        const newTree = movePanelBetweenPanes(w.paneTree, panelId, targetPaneId);
        if (newTree === w.paneTree) return w;
        return { ...w, paneTree: newTree, activePaneId: targetPaneId };
      }),
    );
  }, []);

  const splitPaneAndPlace = useCallback((
    workspaceId: string,
    targetPaneId: string,
    direction: "left" | "right" | "top" | "bottom",
    panelId: string,
  ) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        const orientation = direction === "left" || direction === "right" ? "horizontal" : "vertical";
        const newPanePosition: "first" | "second" = direction === "left" || direction === "top" ? "first" : "second";
        const newPaneId = crypto.randomUUID();
        const newSplitId = crypto.randomUUID();
        const treeAfterSplit = splitPaneInTree(
          w.paneTree,
          targetPaneId,
          newSplitId,
          newPaneId,
          orientation,
          newPanePosition,
        );
        const treeAfterMove = movePanelBetweenPanes(treeAfterSplit, panelId, newPaneId);
        if (treeAfterMove === w.paneTree) return w;
        return { ...w, paneTree: treeAfterMove, activePaneId: newPaneId };
      }),
    );
  }, []);

  // ── Panel operations ──────────────────────────────────────────────────────

  const openPanel = useCallback((workspaceId: string, paneId: string, panel: Panel) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        return {
          ...w,
          paneTree: updatePane(w.paneTree, paneId, (p) => ({
            ...p,
            panels: [...p.panels, panel],
            activePanelId: panel.id,
          })),
        };
      }),
    );
  }, []);

  const activatePanel = useCallback((workspaceId: string, panelId: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        const result = findPanelPane(w.paneTree, panelId);
        if (!result) return w;
        return {
          ...w,
          activePaneId: result.pane.id,
          paneTree: updatePane(w.paneTree, result.pane.id, (p) => ({
            ...p,
            activePanelId: panelId,
          })),
        };
      }),
    );
  }, []);

  const closePanel = useCallback((workspaceId: string, panelId: string) => {
    let workspaceRemoved = false;

    setWorkspaces((prev) => {
      const updated = prev.flatMap((w): Workspace[] => {
        if (w.id !== workspaceId) return [w];
        const result = findPanelPane(w.paneTree, panelId);
        if (!result) return [w];
        const { pane } = result;
        const remaining = pane.panels.filter((p) => p.id !== panelId);
        if (remaining.length === 0) {
          // Last panel in pane — close the pane
          const newTree = removePaneFromTree(w.paneTree, pane.id);
          if (!newTree) return []; // Last pane — would close workspace
          const sibling = siblingPane(w.paneTree, pane.id);
          return [{
            ...w,
            paneTree: newTree,
            activePaneId: w.activePaneId === pane.id
              ? (sibling?.id ?? firstPaneId(newTree))
              : w.activePaneId,
          }];
        }
        // Prefer the tab to the right; if none, the one to the left
        const idx = pane.panels.findIndex((p) => p.id === panelId);
        const newActiveId =
          pane.activePanelId === panelId
            ? ((remaining[idx] ?? remaining[idx - 1])?.id ?? null)
            : pane.activePanelId;
        return [{
          ...w,
          paneTree: updatePane(w.paneTree, pane.id, (p) => ({
            ...p,
            panels: remaining,
            activePanelId: newActiveId,
          })),
        }];
      });
      if (updated.length === 0) return prev; // never close last workspace
      workspaceRemoved = !updated.find((w) => w.id === workspaceId);
      return updated;
    });

    // Only switch active workspace if this workspace was actually removed
    setActiveWorkspaceId((prevId) => {
      if (!workspaceRemoved || prevId !== workspaceId) return prevId;
      const remaining = workspacesRef.current.filter((w) => w.id !== workspaceId);
      return remaining[remaining.length - 1]?.id ?? prevId;
    });
  }, []);

  const updatePanelData = useCallback((workspaceId: string, panelId: string, updater: (p: Panel) => Panel) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        const result = findPanelPane(w.paneTree, panelId);
        if (!result) return w;
        return {
          ...w,
          paneTree: updatePane(w.paneTree, result.pane.id, (p) => ({
            ...p,
            panels: p.panels.map((panel) => panel.id === panelId ? updater(panel) : panel),
          })),
        };
      }),
    );
  }, []);

  const setTerminalPanelCwd = useCallback((workspaceId: string, panelId: string, cwd: string) => {
    updatePanelData(workspaceId, panelId, (p) => p.kind === "terminal" ? { ...p, cwd } : p);
  }, [updatePanelData]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const findPanelGlobal = useCallback((panelId: string) => {
    for (const w of workspacesRef.current) {
      const result = findPanelPane(w.paneTree, panelId);
      if (result) return { workspace: w, ...result };
    }
    return null;
  }, []);

  const findPaneGlobal = useCallback((paneId: string) => {
    for (const w of workspacesRef.current) {
      const pane = findPane(w.paneTree, paneId);
      if (pane) return { workspace: w, pane };
    }
    return null;
  }, []);

  const resetWorkspaces = useCallback((cwd?: string) => {
    const ws = newWorkspace(cwd);
    setWorkspaces([ws]);
    setActiveWorkspaceId(ws.id);
  }, []);

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
    splitPaneAndPlace,
    openPanel,
    activatePanel,
    closePanel,
    updatePanelData,
    setTerminalPanelCwd,
    findPanelGlobal,
    findPaneGlobal,
    resetWorkspaces,
    allPaneIds,
  };
}

export type UseWorkspacesReturn = ReturnType<typeof useWorkspaces>;
