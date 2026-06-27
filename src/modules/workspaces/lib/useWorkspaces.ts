import { useCallback, useEffect, useRef, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
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
import { type ClosedEntry, type Panel, type PaneNode, type Workspace, type WorkspaceGitConfig, isAutofocusPanel } from "./types";
import type { ExplorerRootMode } from "./explorerRoot";
import { newWorkspaceId, newPaneId, newSplitId, newPanelId } from "@/lib/ids";

export function captureClosedEntry(
  entries: ClosedEntry[],
  entry: ClosedEntry,
  cap = 10,
): ClosedEntry[] {
  return [entry, ...entries].slice(0, cap);
}

export function findReopenTarget(
  workspaces: Workspace[],
  activeWorkspaceId: string,
  entry: ClosedEntry,
): { workspaceId: string; paneId: string } | null {
  const targetWs =
    workspaces.find((w) => w.id === entry.workspaceId) ??
    workspaces.find((w) => w.id === activeWorkspaceId);
  if (!targetWs) return null;
  const pane = findPane(targetWs.paneTree, entry.paneId);
  return {
    workspaceId: targetWs.id,
    paneId: pane ? entry.paneId : targetWs.activePaneId,
  };
}

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

const DEFAULT_GIT_CONFIG: WorkspaceGitConfig = {
  commitMessage: "",
  pushOnCommit: false,
};

export function applyGitConfig(
  workspaces: Workspace[],
  workspaceId: string,
  patch: Partial<WorkspaceGitConfig>,
): Workspace[] {
  return workspaces.map((w) =>
    w.id === workspaceId
      ? { ...w, git: { ...(w.git ?? DEFAULT_GIT_CONFIG), ...patch } }
      : w,
  );
}

// Per-pane most-recently-used activation history (panelIds, most recent first).
// In memory only, never persisted. Bounds defensively; the live list is already
// capped by the number of open tabs in the pane (see paneActivationHistoryRef).
export const MRU_HISTORY_LIMIT = 50;

export function pushMru(history: string[], panelId: string, limit = MRU_HISTORY_LIMIT): string[] {
  return [panelId, ...history.filter((id) => id !== panelId)].slice(0, limit);
}

export function applyClosePanel(
  workspaces: Workspace[],
  workspaceId: string,
  panelId: string,
  history?: string[],
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
    const remainingIds = new Set(remaining.map((p) => p.id));
    const mruTarget = history?.find((id) => id !== panelId && remainingIds.has(id)) ?? null;
    const newActiveId =
      pane.activePanelId === panelId
        ? (mruTarget ?? (remaining[idx] ?? remaining[idx - 1])?.id ?? null)
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
  const closedPanelsRef = useRef<ClosedEntry[]>([]);

  // paneId -> MRU activation history (panelIds, most recent first). Drives which
  // tab gets focus when the active one closes. In memory only, never persisted.
  const paneActivationHistoryRef = useRef<Map<string, string[]>>(new Map());
  const recordActivation = useCallback((paneId: string, panelId: string) => {
    const map = paneActivationHistoryRef.current;
    map.set(paneId, pushMru(map.get(paneId) ?? [], panelId));
  }, []);

  // Reconcile the history against live panes/panels: drop dead panes and panels
  // (closed, moved between panes, collapsed splits). Keeps the map bounded and
  // ensures a stale id is never selected as the next active tab.
  useEffect(() => {
    const map = paneActivationHistoryRef.current;
    const live = new Map<string, Set<string>>();
    for (const w of workspaces) {
      for (const pane of allPanes(w.paneTree)) {
        live.set(pane.id, new Set(pane.panels.map((p) => p.id)));
      }
    }
    for (const paneId of [...map.keys()]) {
      const ids = live.get(paneId);
      if (!ids) { map.delete(paneId); continue; }
      const pruned = (map.get(paneId) ?? []).filter((id) => ids.has(id));
      if (pruned.length === 0) map.delete(paneId);
      else map.set(paneId, pruned);
    }
  }, [workspaces]);

  // When all workspaces are gone, flush state and destroy the window.
  // Uses claimClose() to avoid racing with the onCloseRequested handler in main.tsx
  // when the user closes the last workspace and clicks X simultaneously.
  useEffect(() => {
    if (workspaces.length === 0 && claimClose()) {
      void flushWorkspaceState().finally(async () => {
        // Signal Rust to stay alive after the window closes (macOS-style windowless mode).
        await invoke("enter_windowless_mode").catch(() => {});
        void getCurrentWindow().destroy();
      });
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
    recordActivation(paneId, newPanel.id);
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
  }, [recordActivation]);

  const activatePanel = useCallback((workspaceId: string, panelId: string) => {
    const ws = workspacesRef.current.find((w) => w.id === workspaceId);
    const pane = ws ? findPanelPane(ws.paneTree, panelId)?.pane : undefined;
    if (pane) recordActivation(pane.id, panelId);
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
  }, [recordActivation]);

  const closePanel = useCallback((workspaceId: string, panelId: string) => {
    const ws = workspacesRef.current.find((w) => w.id === workspaceId);
    let history: string[] | undefined;
    if (ws) {
      const found = findPanelPane(ws.paneTree, panelId);
      if (found) {
        history = paneActivationHistoryRef.current.get(found.pane.id);
        closedPanelsRef.current = captureClosedEntry(closedPanelsRef.current, {
          panel: found.panel,
          paneId: found.pane.id,
          workspaceId,
        });
      }
    }
    setWorkspaces((prev) => applyClosePanel(prev, workspaceId, panelId, history));
  }, []);

  const reopenClosed = useCallback(() => {
    const [entry, ...rest] = closedPanelsRef.current;
    if (!entry) return;
    const target = findReopenTarget(workspacesRef.current, activeWorkspaceId, entry);
    if (!target) return;
    closedPanelsRef.current = rest;
    const newPanel: Panel = (() => {
      const base = { ...entry.panel, id: newPanelId() };
      if (base.kind === "editor") return { ...base, dirty: false, preview: false, locked: false };
      if (base.kind === "terminal" || base.kind === "git-diff") return { ...base, locked: false };
      return base;
    })();
    openPanel(target.workspaceId, target.paneId, newPanel);
  }, [openPanel, activeWorkspaceId]);

  const replacePanel = useCallback((workspaceId: string, paneId: string, oldPanelId: string, newPanel: Panel) => {
    recordActivation(paneId, newPanel.id);
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
  }, [recordActivation]);

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
        return { id: p.id, kind: "editor", path: p.path, title: p.title, dirty: false, preview: false, locked: p.locked, autofocus: p.autofocus };
      }
      if (mode === "rendered" && p.kind === "editor" && isMarkdownPath(p.path)) {
        if (p.dirty) return p;
        return { id: p.id, kind: "markdown", path: p.path, title: p.title, locked: p.locked, autofocus: p.autofocus };
      }
      return p;
    });
  }, [updatePanelData]);

  const toggleOverlayPreview = useCallback((workspaceId: string, panelId: string) => {
    updatePanelData(workspaceId, panelId, (p) => {
      if (p.kind !== "editor") return p;
      return { ...p, previewMode: p.previewMode === "overlay" ? undefined : "overlay" };
    });
  }, [updatePanelData]);

  const toggleSplitPreview = useCallback((workspaceId: string, panelId: string) => {
    updatePanelData(workspaceId, panelId, (p) => {
      if (p.kind !== "editor") return p;
      return { ...p, previewMode: p.previewMode === "split" ? undefined : "split" };
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

  const setWorkspaceGitConfig = useCallback(
    (workspaceId: string, patch: Partial<WorkspaceGitConfig>) => {
      setWorkspaces((prev) => applyGitConfig(prev, workspaceId, patch));
    },
    [],
  );

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
    reopenClosed,
    updatePanelData,
    replacePanel,
    setTerminalPanelCwd,
    setWorkspaceCwd,
    setExplorerRootMode,
    setPinnedRoot,
    setFsRoot,
    setWorkspaceGitConfig,
    setTerminalRunningCommand,
    setPanelView,
    toggleOverlayPreview,
    toggleSplitPreview,
    findPanelGlobal,
    findPaneGlobal,
    resetWorkspaces,
    allPaneIds,
  };
}

export type UseWorkspacesReturn = ReturnType<typeof useWorkspaces>;
