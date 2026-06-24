import { useCallback, useEffect, useRef, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isMarkdownPath } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { claimClose, flushWorkspaceState } from "./workspaceState";
import { setRunningCommand } from "./terminalEphemeralStore";
import {
  allPaneIds,
  allPanes,
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
import { type Panel, type PaneNode, type Workspace, isAutofocusPanel } from "./types";
import type { ExplorerRootMode } from "./explorerRoot";
import { newWorkspaceId, newPaneId, newSplitId, newPanelId } from "@/lib/ids";

// New autofocus-capable tabs inherit the "autofocus in new tabs" preference,
// unless they already carry an explicit flag. Restored tabs never pass through
// here, so their persisted flag is preserved.
function withNewTabAutofocus(panel: Panel): Panel {
  if (!isAutofocusPanel(panel) || panel.autofocus !== undefined) return panel;
  return usePreferencesStore.getState().autofocusNewTabs
    ? { ...panel, autofocus: true }
    : panel;
}

export function applyExplorerRootMode(
  workspaces: Workspace[],
  workspaceId: string,
  mode: ExplorerRootMode,
): Workspace[] {
  return workspaces.map((w) =>
    w.id === workspaceId ? { ...w, explorerRootMode: mode } : w,
  );
}

export function applyPinnedRoot(
  workspaces: Workspace[],
  workspaceId: string,
  path: string,
): Workspace[] {
  const normalized = path.length > 1 ? path.replace(/\/$/, "") : path;
  return workspaces.map((w) =>
    w.id === workspaceId
      ? { ...w, pinnedRoot: normalized, explorerRootMode: "pinned" }
      : w,
  );
}

export function applyFsRoot(
  workspaces: Workspace[],
  workspaceId: string,
  path: string,
): Workspace[] {
  const normalized = path.length > 1 ? path.replace(/\/$/, "") : path;
  return workspaces.map((w) =>
    w.id === workspaceId ? { ...w, fsRoot: normalized } : w,
  );
}

export function applyClosePanel(
  workspaces: Workspace[],
  workspaceId: string,
  panelId: string,
): Workspace[] {
  return workspaces.map((w): Workspace => {
    if (w.id !== workspaceId) return w;
    const result = findPanelPane(w.paneTree, panelId);
    if (!result) return w;
    const { pane } = result;
    const remaining = pane.panels.filter((p) => p.id !== panelId);
    if (remaining.length === 0) {
      const newTree = removePaneFromTree(w.paneTree, pane.id);
      if (!newTree) {
        return {
          ...w,
          paneTree: updatePane(w.paneTree, pane.id, (p) => ({
            ...p,
            panels: [],
            activePanelId: null,
          })),
        };
      }
      const sibling = siblingPane(w.paneTree, pane.id);
      return {
        ...w,
        paneTree: newTree,
        activePaneId:
          w.activePaneId === pane.id
            ? (sibling?.id ?? firstPaneId(newTree))
            : w.activePaneId,
      };
    }
    const idx = pane.panels.findIndex((p) => p.id === panelId);
    const newActiveId =
      pane.activePanelId === panelId
        ? ((remaining[idx] ?? remaining[idx - 1])?.id ?? null)
        : pane.activePanelId;
    return {
      ...w,
      paneTree: updatePane(w.paneTree, pane.id, (p) => ({
        ...p,
        panels: remaining,
        activePanelId: newActiveId,
      })),
    };
  });
}

export async function collectRunningTerminals(
  ws: Workspace,
  getForegroundProcess: (panelId: string) => Promise<string | null>,
  getCommand: (panelId: string) => string | undefined,
): Promise<{ panelId: string; label: string }[]> {
  const terminals = allPanes(ws.paneTree)
    .flatMap((p) => p.panels)
    .filter((panel): panel is Extract<Panel, { kind: "terminal" }> => panel.kind === "terminal");
  const checked = await Promise.all(
    terminals.map(async (panel) => {
      const processName = await getForegroundProcess(panel.id);
      if (processName === null) return null;
      const label = getCommand(panel.id) ?? (processName || panel.title || "shell");
      return { panelId: panel.id, label };
    }),
  );
  return checked.filter(
    (x): x is { panelId: string; label: string } => x !== null,
  );
}

function newPaneNode(cwd?: string): PaneNode {
  const panelId = newPanelId();
  return {
    kind: "pane",
    id: newPaneId(),
    panels: [{ id: panelId, kind: "terminal", cwd }],
    activePanelId: panelId,
  };
}

function newWorkspace(cwd?: string): Workspace {
  const pane = newPaneNode(cwd);
  return {
    id: newWorkspaceId(),
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

  const previousWorkspaceIdRef = useRef<string | null>(null);

  // When all workspaces are gone, flush state and destroy the window.
  // Uses claimClose() to avoid racing with the onCloseRequested handler in main.tsx
  // when the user closes the last workspace and clicks X simultaneously.
  useEffect(() => {
    if (workspaces.length === 0 && claimClose()) {
      void flushWorkspaceState().finally(() => void getCurrentWindow().destroy());
    }
  }, [workspaces]);

  // ── Workspace operations ──────────────────────────────────────────────────

  const selectWorkspace = useCallback((id: string) => {
    setActiveWorkspaceId((prev) => {
      if (prev !== id) previousWorkspaceIdRef.current = prev;
      return id;
    });
  }, []);

  const addWorkspace = useCallback((cwd?: string): string => {
    const ws = newWorkspace(cwd);
    setWorkspaces((prev) => [...prev, ws]);
    selectWorkspace(ws.id);
    return ws.id;
  }, [selectWorkspace]);

  const reorderWorkspaces = useCallback((fromId: string, toId: string) => {
    setWorkspaces((prev) => {
      const from = prev.findIndex((w) => w.id === fromId);
      const to = prev.findIndex((w) => w.id === toId);
      if (from === -1 || to === -1 || from === to) return prev;
      return arrayMove(prev, from, to);
    });
  }, []);

  const closeWorkspace = useCallback((id: string) => {
    setWorkspaces((prev) => prev.filter((w) => w.id !== id));
    setActiveWorkspaceId((prev) => {
      if (prev !== id) return prev;
      const remaining = workspacesRef.current.filter((w) => w.id !== id);
      const prevId = previousWorkspaceIdRef.current;
      if (prevId && prevId !== id && remaining.some((w) => w.id === prevId)) return prevId;
      const closedIdx = workspacesRef.current.findIndex((w) => w.id === id);
      return (remaining[closedIdx] ?? remaining[closedIdx - 1])?.id ?? prev;
    });
  }, []);

  // ── Pane operations ───────────────────────────────────────────────────────

  const splitPane = useCallback((workspaceId: string, paneId: string, orientation: "horizontal" | "vertical"): string => {
    const freshPaneId = newPaneId();
    const freshSplitId = newSplitId();
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        return {
          ...w,
          paneTree: splitPaneInTree(w.paneTree, paneId, freshSplitId, freshPaneId, orientation),
          activePaneId: freshPaneId,
        };
      }),
    );
    return freshPaneId;
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

  const movePanel = useCallback((workspaceId: string, panelId: string, targetPaneId: string, targetIndex?: number) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        const sourceResult = findPanelPane(w.paneTree, panelId);
        if (!sourceResult || sourceResult.pane.id === targetPaneId) return w;
        const newTree = movePanelBetweenPanes(w.paneTree, panelId, targetPaneId, targetIndex);
        if (newTree === w.paneTree) return w;
        return { ...w, paneTree: newTree, activePaneId: targetPaneId };
      }),
    );
  }, []);

  const reorderPanel = useCallback((workspaceId: string, panelId: string, insertionIndex: number) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        const result = findPanelPane(w.paneTree, panelId);
        if (!result) return w;
        const { pane } = result;
        const from = pane.panels.findIndex((p) => p.id === panelId);
        if (from === -1) return w;
        // insertionIndex is the gap index in the original array (0 = before first tab).
        // Inserting before or after the dragged tab itself is a noop.
        if (insertionIndex === from || insertionIndex === from + 1) return w;
        // Convert gap index to arrayMove destination index (which operates after removal).
        const to = insertionIndex <= from ? insertionIndex : insertionIndex - 1;
        const newPanels = arrayMove(pane.panels, from, to);
        return { ...w, paneTree: updatePane(w.paneTree, pane.id, (p) => ({ ...p, panels: newPanels })) };
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
        const freshPaneId = newPaneId();
        const freshSplitId = newSplitId();
        const treeAfterSplit = splitPaneInTree(
          w.paneTree,
          targetPaneId,
          freshSplitId,
          freshPaneId,
          orientation,
          newPanePosition,
        );
        const treeAfterMove = movePanelBetweenPanes(treeAfterSplit, panelId, freshPaneId);
        if (treeAfterMove === w.paneTree) return w;
        return { ...w, paneTree: treeAfterMove, activePaneId: freshPaneId };
      }),
    );
  }, []);

  const splitPaneAndOpenPanel = useCallback((
    workspaceId: string,
    targetPaneId: string,
    direction: "left" | "right" | "top" | "bottom",
    panel: Panel,
  ) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        const { workspacePaneLimit } = usePreferencesStore.getState();
        if (allPanes(w.paneTree).length >= workspacePaneLimit) return w;
        const orientation = direction === "left" || direction === "right" ? "horizontal" : "vertical";
        const newPanePosition: "first" | "second" = direction === "left" || direction === "top" ? "first" : "second";
        const freshPaneId = newPaneId();
        const freshSplitId = newSplitId();
        const newTree = splitPaneAndInsertPanel(w.paneTree, targetPaneId, freshSplitId, freshPaneId, orientation, newPanePosition, withNewTabAutofocus(panel));
        if (newTree === w.paneTree) return w;
        return { ...w, paneTree: newTree, activePaneId: freshPaneId };
      }),
    );
  }, []);

  // ── Panel operations ──────────────────────────────────────────────────────

  const openPanel = useCallback((workspaceId: string, paneId: string, panel: Panel, insertionIndex?: number) => {
    const newPanel = withNewTabAutofocus(panel);
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
            newPanels.splice(idx, 0, newPanel);
            return { ...p, panels: newPanels, activePanelId: newPanel.id };
          }),
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
    setWorkspaces((prev) => applyClosePanel(prev, workspaceId, panelId));
  }, []);

  const replacePanel = useCallback((workspaceId: string, paneId: string, oldPanelId: string, newPanel: Panel) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        return {
          ...w,
          paneTree: updatePane(w.paneTree, paneId, (p) => {
            const idx = p.panels.findIndex((panel) => panel.id === oldPanelId);
            if (idx === -1) return p;
            const newPanels = [...p.panels];
            newPanels[idx] = newPanel;
            return { ...p, panels: newPanels, activePanelId: newPanel.id };
          }),
        };
      }),
    );
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
    const normalized = cwd.length > 1 ? cwd.replace(/\/$/, "") : cwd;
    updatePanelData(workspaceId, panelId, (p) => p.kind === "terminal" ? { ...p, cwd: normalized } : p);
  }, [updatePanelData]);

  const setTerminalRunningCommand = useCallback((_workspaceId: string, panelId: string, cmd: string | null) => {
    setRunningCommand(panelId, cmd);
  }, []);

  // Flip a markdown file panel between its rendered view (kind "markdown") and
  // the raw editor (kind "editor"), preserving id/path/title. Switching to
  // rendered is a no-op while the editor has unsaved changes.
  const setPanelView = useCallback((workspaceId: string, panelId: string, mode: "rendered" | "raw") => {
    updatePanelData(workspaceId, panelId, (p) => {
      if (mode === "raw" && p.kind === "markdown" && isMarkdownPath(p.path)) {
        return { id: p.id, kind: "editor", path: p.path, title: p.title, dirty: false, preview: false };
      }
      if (mode === "rendered" && p.kind === "editor" && isMarkdownPath(p.path)) {
        if (p.dirty) return p;
        return { id: p.id, kind: "markdown", path: p.path, title: p.title };
      }
      return p;
    });
  }, [updatePanelData]);

  const setWorkspaceCwd = useCallback((workspaceId: string, cwd: string) => {
    const normalized = cwd.length > 1 ? cwd.replace(/\/$/, "") : cwd;
    setWorkspaces((prev) =>
      prev.map((w) => w.id === workspaceId ? { ...w, cwd: normalized } : w)
    );
  }, []);

  const setExplorerRootMode = useCallback(
    (workspaceId: string, mode: ExplorerRootMode) => {
      setWorkspaces((prev) => applyExplorerRootMode(prev, workspaceId, mode));
    },
    [],
  );

  const setPinnedRoot = useCallback((workspaceId: string, path: string) => {
    setWorkspaces((prev) => applyPinnedRoot(prev, workspaceId, path));
  }, []);

  const setFsRoot = useCallback((workspaceId: string, path: string) => {
    setWorkspaces((prev) => applyFsRoot(prev, workspaceId, path));
  }, []);

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
    setActiveWorkspaceId: selectWorkspace,
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
    splitPaneAndOpenPanel,
    openPanel,
    activatePanel,
    closePanel,
    updatePanelData,
    replacePanel,
    setTerminalPanelCwd,
    setWorkspaceCwd,
    setExplorerRootMode,
    setPinnedRoot,
    setFsRoot,
    setTerminalRunningCommand,
    setPanelView,
    findPanelGlobal,
    findPaneGlobal,
    resetWorkspaces,
    allPaneIds,
  };
}

export type UseWorkspacesReturn = ReturnType<typeof useWorkspaces>;
