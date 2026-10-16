import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { arrayMove } from "@dnd-kit/sortable";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { claimClose, flushWorkspaceState } from "./workspaceState";
import { setRunningCommand } from "./terminalEphemeralStore";
import { previewResumeCmd, seedRestorePlan, type RestorePlan } from "@/modules/agents/lib/agentSessionRestore";
import { applyAgentTitles } from "./agentTitles";
import { applyHibernate, applyWake, editorTabIds, terminalTabs } from "./hibernate";
import { unmarkHibernating } from "@/modules/agents/lib/hibernatingTabs";
import { discardUnflushedBuffers } from "@/modules/editor/lib/unflushedBuffers";
import {
  allPaneIds,
  allPanes,
  findPane,
  findTabPane,
  firstPaneId,
  moveTabBetweenPanes,
  removePaneFromTree,
  siblingPane,
  splitPaneAndInsertTab,
  splitPaneInTree,
  updateDivider,
  updatePane,
} from "./splitNode";
import { attachTab, workspaceForTab, type TabMoveRequest, type TabPlacement } from "./tabTransfer";
import { type ClosedEntry, type Tab, type PaneNode, type Script, type TabHibernation, type Workspace, type WorkspaceGitConfig, isAutofocusTab, scriptsToDelete } from "./types";
import type { ExplorerRootMode } from "./explorerRoot";
import { applyExplorerSnapshots, applySidebarView, type ExplorerSnapshot } from "./sidebarSnapshot";
import type { SidebarView } from "./sidebarState";
import { newWorkspaceId, newPaneId, newSplitId, newTabId } from "@/lib/ids";

export function captureClosedEntry(
  entries: ClosedEntry[],
  entry: ClosedEntry,
  cap = 10,
): ClosedEntry[] {
  return [entry, ...entries].slice(0, cap);
}

export function buildReopenedTab(tab: Tab, newId: string): Tab {
  const base = { ...tab, id: newId };
  if (base.kind === "editor") return { ...base, dirty: false, preview: false, locked: false };
  if (base.kind === "git-diff" || base.kind === "git-commit-file") return { ...base, preview: false, locked: false };
  if (base.kind === "terminal") return { ...base, locked: false };
  return base;
}

// Whether a reopened closed tab is worth asking Rust for a live agent resume plan.
// Mirrors the same "Run on start" gate the startup restore flow already applies
// (useTerminalSession.ts), so a tab with it off never even fetches a plan it would
// discard anyway.
export function needsResumePlanLookup(tab: Tab): boolean {
  return tab.kind === "terminal" && tab.restoreOnRestart !== false;
}

export function planWake(ws: Workspace): string[] {
  return terminalTabs(ws).filter(needsResumePlanLookup).map((t) => t.id);
}

export async function seedWakePlans(
  ws: Workspace,
  lookup: (tabId: string) => Promise<RestorePlan | null>,
  seed: (tabId: string, plan: RestorePlan) => void,
): Promise<void> {
  await Promise.all(
    planWake(ws).map(async (tabId) => {
      const plan = await lookup(tabId);
      if (plan) seed(tabId, plan);
    }),
  );
}

// A double click on Restore would otherwise seed the resume plans twice, and a
// leftover plan could resurrect a stale session on a later wake. The second
// caller gets the in-flight promise so it only proceeds once the first applied.
export function runOnce(inFlight: Map<string, Promise<void>>, key: string, task: () => Promise<void>): Promise<void> {
  const running = inFlight.get(key);
  if (running) return running;
  const p = (async () => {
    try {
      await task();
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, p);
  return p;
}

const wakesInFlight = new Map<string, Promise<void>>();

// Walks the closed stack from the newest entry. An entry whose workspace no
// longer exists is dropped for good; one whose workspace is hibernated is kept
// in place and skipped, so it becomes the next undo once the workspace wakes.
// A tab is never reopened in a workspace other than the one it was closed in.
export function pickReopen(
  entries: ClosedEntry[],
  workspaces: Workspace[],
): { picked: { entry: ClosedEntry; workspaceId: string; paneId: string } | null; remaining: ClosedEntry[] } {
  const remaining: ClosedEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const ws = workspaces.find((w) => w.id === entry.workspaceId);
    if (!ws) continue;
    if (ws.hibernated) {
      remaining.push(entry);
      continue;
    }
    const paneId = findPane(ws.paneTree, entry.paneId) ? entry.paneId : ws.activePaneId;
    return {
      picked: { entry, workspaceId: ws.id, paneId },
      remaining: [...remaining, ...entries.slice(i + 1)],
    };
  }
  return { picked: null, remaining };
}

// New autofocus-capable tabs get the flag when "autofocusNewTabs" is on (also in
// "always", so they keep it if the mode is switched back),
// unless they already carry an explicit flag. Restored tabs never pass through
// here, so their persisted flag is preserved.
function withNewTabAutofocus(tab: Tab): Tab {
  if (!isAutofocusTab(tab) || tab.autofocus !== undefined) return tab;
  const { autofocusMode, autofocusNewTabs } = usePreferencesStore.getState();
  return autofocusMode === "always" || autofocusNewTabs
    ? { ...tab, autofocus: true }
    : tab;
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

export function applyShowHidden(
  workspaces: Workspace[],
  workspaceId: string,
  value: boolean,
): Workspace[] {
  return workspaces.map((w) =>
    w.id === workspaceId ? { ...w, showHidden: value } : w,
  );
}

export function applyWorkspaceRoot(
  workspaces: Workspace[],
  workspaceId: string,
  path: string,
): Workspace[] {
  const normalized = path.length > 1 ? path.replace(/\/$/, "") : path;
  return workspaces.map((w) =>
    w.id === workspaceId
      ? { ...w, workspaceRoot: normalized, explorerRootMode: "workspace" }
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

export function applyWorkspaceGroup(
  workspaces: Workspace[],
  workspaceId: string,
  groupId: string | null | undefined,
): Workspace[] {
  return workspaces.map((w) =>
    w.id === workspaceId ? { ...w, groupId: groupId ?? undefined } : w,
  );
}

// Where a freshly opened tab lands. An explicit index (drag/reorder) wins;
// otherwise it sits right after the active tab, falling back to the end when
// there is no active tab (empty or freshly split pane).
export function tabInsertionIndex(
  tabs: Tab[],
  activeTabId: string | null,
  insertionIndex?: number,
): number {
  if (insertionIndex !== undefined) return Math.min(insertionIndex, tabs.length);
  const activeIdx = tabs.findIndex((p) => p.id === activeTabId);
  return activeIdx >= 0 ? activeIdx + 1 : tabs.length;
}

// A new workspace is inserted right after the active one and inherits its
// group, so it lands in the same sidebar group (groupWorkspaces filters by
// group preserving array order, so array adjacency == in-group adjacency).
export function insertWorkspaceAfterActive(
  workspaces: Workspace[],
  activeWorkspaceId: string,
  newWorkspace: Workspace,
): Workspace[] {
  const activeIdx = workspaces.findIndex((w) => w.id === activeWorkspaceId);
  if (activeIdx === -1) return [...workspaces, newWorkspace];
  const active = workspaces[activeIdx]!;
  const placed = active.groupId ? { ...newWorkspace, groupId: active.groupId } : newWorkspace;
  const next = [...workspaces];
  next.splice(activeIdx + 1, 0, placed);
  return next;
}

// Per-pane most-recently-used activation history (tabIds, most recent first).
// In memory only, never persisted. Bounds defensively; the live list is already
// capped by the number of open tabs in the pane (see paneActivationHistoryRef).
export const MRU_HISTORY_LIMIT = 50;

export function pushMru(history: string[], tabId: string, limit = MRU_HISTORY_LIMIT): string[] {
  return [tabId, ...history.filter((id) => id !== tabId)].slice(0, limit);
}

export function applyCloseTab(
  workspaces: Workspace[],
  workspaceId: string,
  tabId: string,
  history?: string[],
): Workspace[] {
  return workspaces.map((w): Workspace => {
    if (w.id !== workspaceId) return w;
    const result = findTabPane(w.paneTree, tabId);
    if (!result) return w;
    const { pane } = result;
    const remaining = pane.tabs.filter((p) => p.id !== tabId);
    if (remaining.length === 0) {
      const newTree = removePaneFromTree(w.paneTree, pane.id);
      if (!newTree) {
        return {
          ...w,
          // Empty means expanded: the bar hides the chevron, and a tab opened
          // into the workspace shows up in the nested list without a toggle.
          detailExpanded: true,
          paneTree: updatePane(w.paneTree, pane.id, (p) => ({
            ...p,
            tabs: [],
            activeTabId: null,
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
    const idx = pane.tabs.findIndex((p) => p.id === tabId);
    const remainingIds = new Set(remaining.map((p) => p.id));
    const mruTarget = history?.find((id) => id !== tabId && remainingIds.has(id)) ?? null;
    const newActiveId =
      pane.activeTabId === tabId
        ? (mruTarget ?? (remaining[idx] ?? remaining[idx - 1])?.id ?? null)
        : pane.activeTabId;
    return {
      ...w,
      paneTree: updatePane(w.paneTree, pane.id, (p) => ({
        ...p,
        tabs: remaining,
        activeTabId: newActiveId,
      })),
    };
  });
}

export function workspaceTabCount(ws: Workspace): number {
  return allPanes(ws.paneTree).reduce((n, p) => n + p.tabs.length, 0);
}

// A workspace left with no tabs folds away with its last tab: an empty chip has
// nothing to show. The window's only workspace survives (the window would close
// with it), and so does one holding configured scripts, whose deletion the
// close-workspace confirmation dialog still owns.
export function emptyWorkspaceToClose(workspaces: Workspace[]): Workspace | null {
  if (workspaces.length <= 1) return null;
  return (
    workspaces.find((w) => workspaceTabCount(w) === 0 && scriptsToDelete(w) === 0) ?? null
  );
}

export type TabMoveDestination =
  | { kind: "existing"; workspaceId: string; placement: TabPlacement }
  | { kind: "new"; workspaceId: string; paneId: string; color: string | null | undefined };

// Moves a tab to another workspace in one pass so the tab keeps its id (and so
// its PTY). Returns the same array when the move is invalid, so the tab is
// never dropped from the source without having landed somewhere.
export function applyMoveTabToWorkspace(
  workspaces: Workspace[],
  sourceWorkspaceId: string,
  tabId: string,
  dest: TabMoveDestination,
  paneLimit: number,
): Workspace[] {
  const source = workspaces.find((w) => w.id === sourceWorkspaceId);
  const found = source ? findTabPane(source.paneTree, tabId) : null;
  if (!found) return workspaces;
  const { tab } = found;

  if (dest.kind === "new") {
    const detached = applyCloseTab(workspaces, sourceWorkspaceId, tabId);
    return insertWorkspaceAfterActive(detached, sourceWorkspaceId, workspaceForTab(tab, dest, dest.color));
  }

  if (dest.workspaceId === sourceWorkspaceId) return workspaces;
  const target = workspaces.find((w) => w.id === dest.workspaceId);
  if (target?.hibernated) return workspaces;
  const attached = target ? attachTab(target, tab, dest.placement, paneLimit) : null;
  if (!attached) return workspaces;
  return applyCloseTab(workspaces, sourceWorkspaceId, tabId).map((w) =>
    w.id === dest.workspaceId ? attached : w,
  );
}

export async function collectRunningTerminals(
  ws: Workspace,
  getForegroundProcess: (tabId: string) => Promise<string | null>,
  getCommand: (tabId: string) => string | undefined,
): Promise<{ tabId: string; label: string }[]> {
  const terminals = allPanes(ws.paneTree)
    .flatMap((p) => p.tabs)
    .filter((tab): tab is Extract<Tab, { kind: "terminal" }> => tab.kind === "terminal");
  const checked = await Promise.all(
    terminals.map(async (tab) => {
      const processName = await getForegroundProcess(tab.id);
      if (processName === null) return null;
      const label = getCommand(tab.id) ?? (processName || tab.title || "shell");
      return { tabId: tab.id, label };
    }),
  );
  return checked.filter(
    (x): x is { tabId: string; label: string } => x !== null,
  );
}

function newPaneNode(cwd?: string): PaneNode {
  const tabId = newTabId();
  return {
    kind: "pane",
    id: newPaneId(),
    tabs: [{ id: tabId, kind: "terminal", cwd }],
    activeTabId: tabId,
  };
}

function newWorkspace(cwd?: string): Workspace {
  const pane = newPaneNode(cwd);
  const randomColor = usePreferencesStore.getState().randomWorkspaceColor;
  return {
    id: newWorkspaceId(),
    title: "",
    cwd,
    color: randomColor ? undefined : null,
    paneTree: pane,
    activePaneId: pane.id,
    detailExpanded: true,
  };
}

function buildMoveDestination(request: TabMoveRequest): TabMoveDestination {
  if (request.kind === "new") {
    const randomColor = usePreferencesStore.getState().randomWorkspaceColor;
    return {
      kind: "new",
      workspaceId: newWorkspaceId(),
      paneId: newPaneId(),
      color: randomColor ? undefined : null,
    };
  }
  const fresh = { splitId: newSplitId(), newPaneId: newPaneId() };
  const placement: TabPlacement =
    request.kind === "pane"
      ? { kind: "pane", paneId: request.paneId, index: request.index }
      : request.kind === "split"
        ? { kind: "split", paneId: request.paneId, direction: request.direction, ...fresh }
        : { kind: "auto" };
  return { kind: "existing", workspaceId: request.workspaceId, placement };
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
  const closedTabsRef = useRef<ClosedEntry[]>([]);

  // paneId -> MRU activation history (tabIds, most recent first). Drives which
  // tab gets focus when the active one closes. In memory only, never persisted.
  const paneActivationHistoryRef = useRef<Map<string, string[]>>(new Map());
  const recordActivation = useCallback((paneId: string, tabId: string) => {
    const map = paneActivationHistoryRef.current;
    map.set(paneId, pushMru(map.get(paneId) ?? [], tabId));
  }, []);

  // Reconcile the history against live panes/tabs: drop dead panes and tabs
  // (closed, moved between panes, collapsed splits). Keeps the map bounded and
  // ensures a stale id is never selected as the next active tab.
  useEffect(() => {
    const map = paneActivationHistoryRef.current;
    const live = new Map<string, Set<string>>();
    for (const w of workspaces) {
      for (const pane of allPanes(w.paneTree)) {
        live.set(pane.id, new Set(pane.tabs.map((p) => p.id)));
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
    setWorkspaces((prev) => insertWorkspaceAfterActive(prev, activeWorkspaceId, ws));
    selectWorkspace(ws.id);
    return ws.id;
  }, [selectWorkspace, activeWorkspaceId]);

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

  // A workspace that reaches zero tabs closes with its last tab, whatever the
  // path (tab close, shell exit, move to another workspace, bulk closes): the
  // fold is decided on committed state, so batched closes in one tick see the
  // updated workspace too. Never leaves the window empty; workspaces with
  // scripts are exempt so the close confirmation dialog still protects them.
  useEffect(() => {
    const fold = emptyWorkspaceToClose(workspaces);
    if (fold) closeWorkspace(fold.id);
  }, [workspaces, closeWorkspace]);

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

  const moveTab = useCallback((workspaceId: string, tabId: string, targetPaneId: string, targetIndex?: number) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        const sourceResult = findTabPane(w.paneTree, tabId);
        if (!sourceResult || sourceResult.pane.id === targetPaneId) return w;
        const newTree = moveTabBetweenPanes(w.paneTree, tabId, targetPaneId, targetIndex);
        if (newTree === w.paneTree) return w;
        return { ...w, paneTree: newTree, activePaneId: targetPaneId };
      }),
    );
  }, []);

  const reorderTab = useCallback((workspaceId: string, tabId: string, insertionIndex: number) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        const result = findTabPane(w.paneTree, tabId);
        if (!result) return w;
        const { pane } = result;
        const from = pane.tabs.findIndex((p) => p.id === tabId);
        if (from === -1) return w;
        // insertionIndex is the gap index in the original array (0 = before first tab).
        // Inserting before or after the dragged tab itself is a noop.
        if (insertionIndex === from || insertionIndex === from + 1) return w;
        // Convert gap index to arrayMove destination index (which operates after removal).
        const to = insertionIndex <= from ? insertionIndex : insertionIndex - 1;
        const newTabs = arrayMove(pane.tabs, from, to);
        return { ...w, paneTree: updatePane(w.paneTree, pane.id, (p) => ({ ...p, tabs: newTabs })) };
      }),
    );
  }, []);

  const splitPaneAndPlace = useCallback((
    workspaceId: string,
    targetPaneId: string,
    direction: "left" | "right" | "top" | "bottom",
    tabId: string,
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
        const treeAfterMove = moveTabBetweenPanes(treeAfterSplit, tabId, freshPaneId);
        if (treeAfterMove === w.paneTree) return w;
        return { ...w, paneTree: treeAfterMove, activePaneId: freshPaneId };
      }),
    );
  }, []);

  const splitPaneAndOpenTab = useCallback((
    workspaceId: string,
    targetPaneId: string,
    direction: "left" | "right" | "top" | "bottom",
    tab: Tab,
  ): string => {
    const freshPaneId = newPaneId();
    const freshSplitId = newSplitId();
    const sealedTab = withNewTabAutofocus(tab);
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId || w.hibernated) return w;
        const { workspacePaneLimit } = usePreferencesStore.getState();
        if (allPanes(w.paneTree).length >= workspacePaneLimit) return w;
        const orientation = direction === "left" || direction === "right" ? "horizontal" : "vertical";
        const newPanePosition: "first" | "second" = direction === "left" || direction === "top" ? "first" : "second";
        const newTree = splitPaneAndInsertTab(w.paneTree, targetPaneId, freshSplitId, freshPaneId, orientation, newPanePosition, sealedTab);
        if (newTree === w.paneTree) return w;
        return { ...w, paneTree: newTree, activePaneId: freshPaneId };
      }),
    );
    return freshPaneId;
  }, []);

  // ── Tab operations ────────────────────────────────────────────────────────

  const openTab = useCallback((workspaceId: string, paneId: string, tab: Tab, insertionIndex?: number) => {
    if (workspacesRef.current.find((w) => w.id === workspaceId)?.hibernated) return;
    const newTab = withNewTabAutofocus(tab);
    recordActivation(paneId, newTab.id);
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        return {
          ...w,
          paneTree: updatePane(w.paneTree, paneId, (p) => {
            const idx = tabInsertionIndex(p.tabs, p.activeTabId, insertionIndex);
            const newTabs = [...p.tabs];
            newTabs.splice(idx, 0, newTab);
            return { ...p, tabs: newTabs, activeTabId: newTab.id };
          }),
        };
      }),
    );
  }, [recordActivation]);

  const activateTab = useCallback((workspaceId: string, tabId: string) => {
    const ws = workspacesRef.current.find((w) => w.id === workspaceId);
    const pane = ws ? findTabPane(ws.paneTree, tabId)?.pane : undefined;
    if (pane) recordActivation(pane.id, tabId);
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        const result = findTabPane(w.paneTree, tabId);
        if (!result) return w;
        return {
          ...w,
          activePaneId: result.pane.id,
          paneTree: updatePane(w.paneTree, result.pane.id, (p) => ({
            ...p,
            activeTabId: tabId,
          })),
        };
      }),
    );
  }, [recordActivation]);

  // Like activateTab but leaves activePaneId untouched: makes tabId the active
  // tab of its own pane without moving the user's focus to that pane. Used to
  // surface a script's output tab without stealing focus from wherever the
  // user currently is.
  const revealTab = useCallback((workspaceId: string, tabId: string) => {
    const ws = workspacesRef.current.find((w) => w.id === workspaceId);
    const pane = ws ? findTabPane(ws.paneTree, tabId)?.pane : undefined;
    if (pane) recordActivation(pane.id, tabId);
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        const result = findTabPane(w.paneTree, tabId);
        if (!result) return w;
        return {
          ...w,
          paneTree: updatePane(w.paneTree, result.pane.id, (p) => ({
            ...p,
            activeTabId: tabId,
          })),
        };
      }),
    );
  }, [recordActivation]);

  const closeTab = useCallback((workspaceId: string, tabId: string) => {
    const ws = workspacesRef.current.find((w) => w.id === workspaceId);
    let history: string[] | undefined;
    useAgentStore.getState().stashClosedSession(tabId);
    if (ws) {
      const found = findTabPane(ws.paneTree, tabId);
      if (found) {
        history = paneActivationHistoryRef.current.get(found.pane.id);
        closedTabsRef.current = captureClosedEntry(closedTabsRef.current, {
          tab: found.tab,
          paneId: found.pane.id,
          workspaceId,
        });
      }
    }
    setWorkspaces((prev) => applyCloseTab(prev, workspaceId, tabId, history));
  }, []);

  const reopenClosed = useCallback(async () => {
    const { picked, remaining } = pickReopen(closedTabsRef.current, workspacesRef.current);
    closedTabsRef.current = remaining;
    if (!picked) return;
    const { entry } = picked;
    const target = picked;

    const newId = newTabId();
    // A reopened terminal tab that used to run an agent gets the same live,
    // just-in-time resume plan the startup flow computes, keyed by the id the
    // tab had before it was closed (agent-sessions.json is indexed by tab id).
    // Seeding it under the new id lets useTerminalSession's normal restore-plan
    // consumption pick it up with no other change to the spawn path.
    if (needsResumePlanLookup(entry.tab)) {
      const plan = await previewResumeCmd(entry.tab.id);
      if (plan) seedRestorePlan(newId, plan);
    }

    const newTab = buildReopenedTab(entry.tab, newId);
    openTab(target.workspaceId, target.paneId, newTab);
    useAgentStore.getState().restoreClosedSession(entry.tab.id, newId, target.workspaceId);
  }, [openTab]);

  const replaceTab = useCallback((workspaceId: string, paneId: string, oldTabId: string, newTab: Tab) => {
    if (workspacesRef.current.find((w) => w.id === workspaceId)?.hibernated) return;
    const sealedTab = newTab;
    recordActivation(paneId, sealedTab.id);
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        return {
          ...w,
          activePaneId: paneId,
          paneTree: updatePane(w.paneTree, paneId, (p) => {
            const idx = p.tabs.findIndex((tab) => tab.id === oldTabId);
            if (idx === -1) return p;
            const newTabs = [...p.tabs];
            newTabs[idx] = sealedTab;
            return { ...p, tabs: newTabs, activeTabId: sealedTab.id };
          }),
        };
      }),
    );
  }, [recordActivation]);

  const updateTabData = useCallback((workspaceId: string, tabId: string, updater: (p: Tab) => Tab) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        const result = findTabPane(w.paneTree, tabId);
        if (!result) return w;
        return {
          ...w,
          paneTree: updatePane(w.paneTree, result.pane.id, (p) => ({
            ...p,
            tabs: p.tabs.map((tab) => tab.id === tabId ? updater(tab) : tab),
          })),
        };
      }),
    );
  }, []);

  const setTerminalTabCwd = useCallback((workspaceId: string, tabId: string, cwd: string) => {
    const normalized = cwd.length > 1 ? cwd.replace(/\/$/, "") : cwd;
    updateTabData(workspaceId, tabId, (p) => p.kind === "terminal" ? { ...p, cwd: normalized } : p);
  }, [updateTabData]);

  const setTerminalRunningCommand = useCallback((_workspaceId: string, tabId: string, cmd: string | null) => {
    setRunningCommand(tabId, cmd);
  }, []);

  const toggleOverlayPreview = useCallback((workspaceId: string, tabId: string) => {
    updateTabData(workspaceId, tabId, (p) => {
      if (p.kind !== "editor") return p;
      return { ...p, previewMode: p.previewMode === "overlay" ? undefined : "overlay" };
    });
  }, [updateTabData]);

  const toggleSplitPreview = useCallback((workspaceId: string, tabId: string) => {
    updateTabData(workspaceId, tabId, (p) => {
      if (p.kind !== "editor") return p;
      return { ...p, previewMode: p.previewMode === "split" ? undefined : "split" };
    });
  }, [updateTabData]);

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

  const setShowHidden = useCallback(
    (workspaceId: string, value: boolean) => {
      setWorkspaces((prev) => applyShowHidden(prev, workspaceId, value));
    },
    [],
  );

  const setWorkspaceSidebarView = useCallback((workspaceId: string, view: SidebarView) => {
    setWorkspaces((prev) => applySidebarView(prev, workspaceId, view));
  }, []);

  const applyExplorerSnapshotBatch = useCallback((batch: Map<string, ExplorerSnapshot>) => {
    setWorkspaces((prev) => applyExplorerSnapshots(prev, batch));
  }, []);

  const setWorkspaceRoot = useCallback((workspaceId: string, path: string) => {
    setWorkspaces((prev) => applyWorkspaceRoot(prev, workspaceId, path));
  }, []);

  const clearWorkspaceRoot = useCallback((workspaceId: string) => {
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === workspaceId
          ? { ...w, workspaceRoot: undefined, explorerRootMode: "filesystem" }
          : w,
      ),
    );
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

  const setWorkspaceTitle = useCallback((workspaceId: string, title: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => w.id === workspaceId ? { ...w, title } : w),
    );
  }, []);

  const setWorkspaceColor = useCallback((workspaceId: string, color: string | null) => {
    setWorkspaces((prev) =>
      prev.map((w) => w.id === workspaceId ? { ...w, color } : w),
    );
  }, []);

  const setWorkspaceIcon = useCallback((workspaceId: string, icon: string | null) => {
    setWorkspaces((prev) =>
      prev.map((w) => w.id === workspaceId ? { ...w, icon: icon ?? undefined } : w),
    );
  }, []);

  const setWorkspaceDetailExpanded = useCallback((workspaceId: string, expanded: boolean) => {
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === workspaceId
          ? { ...w, detailExpanded: expanded || undefined }
          : w,
      ),
    );
  }, []);

  const setWorkspaceGroup = useCallback((workspaceId: string, groupId: string | null) => {
    setWorkspaces((prev) => applyWorkspaceGroup(prev, workspaceId, groupId));
  }, []);

  const addScript = useCallback((workspaceId: string, config: Script) => {
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === workspaceId
          ? { ...w, scripts: [...(w.scripts ?? []), config] }
          : w,
      ),
    );
  }, []);

  const updateScript = useCallback(
    (workspaceId: string, configId: string, patch: Partial<Omit<Script, "id">>) => {
      setWorkspaces((prev) =>
        prev.map((w) =>
          w.id !== workspaceId
            ? w
            : {
                ...w,
                scripts: (w.scripts ?? []).map((c) =>
                  c.id === configId ? { ...c, ...patch } : c,
                ),
              },
        ),
      );
    },
    [],
  );

  const removeScript = useCallback((workspaceId: string, configId: string) => {
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id !== workspaceId
          ? w
          : {
              ...w,
              scripts: (w.scripts ?? []).filter((c) => c.id !== configId),
              activeScript:
                w.activeScript === configId ? undefined : w.activeScript,
            },
      ),
    );
  }, []);

  const reorderScripts = useCallback((workspaceId: string, fromId: string, toId: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        const configs = w.scripts ?? [];
        const from = configs.findIndex((c) => c.id === fromId);
        const to = configs.findIndex((c) => c.id === toId);
        if (from === -1 || to === -1 || from === to) return w;
        const next = [...configs];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item!);
        return { ...w, scripts: next };
      }),
    );
  }, []);

  const setActiveScript = useCallback((workspaceId: string, configId: string | null) => {
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === workspaceId
          ? { ...w, activeScript: configId ?? undefined }
          : w,
      ),
    );
  }, []);

  const setScriptPaneId = useCallback((workspaceId: string, paneId: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => w.id === workspaceId ? { ...w, scriptPaneId: paneId } : w),
    );
  }, []);

  const validateScriptTabs = useCallback(
    (workspaceId: string, livingTabIds: Set<string>) => {
      setWorkspaces((prev) =>
        prev.map((w) => {
          if (w.id !== workspaceId) return w;
          const configs = w.scripts ?? [];
          const cleaned = configs.map((c) =>
            c.tabId && !livingTabIds.has(c.tabId)
              ? { ...c, tabId: undefined }
              : c,
          );
          const paneStillLive = w.scriptPaneId ? allPanes(w.paneTree).some((p) => p.id === w.scriptPaneId) : true;
          const scriptPaneId = paneStillLive ? w.scriptPaneId : undefined;
          if (cleaned.every((c, i) => c === configs[i]) && scriptPaneId === w.scriptPaneId) return w;
          return { ...w, scripts: cleaned, scriptPaneId };
        }),
      );
    },
    [],
  );

  const setAgentTitles = useCallback((titles: ReadonlyMap<string, string>) => {
    setWorkspaces((prev) => applyAgentTitles(prev, titles));
  }, []);

  const hibernateWorkspace = useCallback((workspaceId: string, snapshots?: Record<string, TabHibernation>) => {
    setWorkspaces((prev) => applyHibernate(prev, workspaceId, Date.now(), snapshots));
  }, []);

  const wakeWorkspace = useCallback(async (workspaceId: string) => {
    const ws = workspacesRef.current.find((w) => w.id === workspaceId);
    if (!ws?.hibernated) return;
    await runOnce(wakesInFlight, workspaceId, async () => {
      await seedWakePlans(ws, previewResumeCmd, seedRestorePlan);
      discardUnflushedBuffers(editorTabIds(ws));
      unmarkHibernating(terminalTabs(ws).map((t) => t.id));
      setWorkspaces((prev) => applyWake(prev, workspaceId));
    });
  }, []);

  // A hibernated destination is woken first instead of refused. The move is
  // validated before waking so an impossible one does not wake anything, and
  // again after it in case the tab went away meanwhile. The updater wakes `prev`
  // itself as a safety net; wakeWorkspace awaits any wake already in flight.
  const moveTabToWorkspace = useCallback(
    async (sourceWorkspaceId: string, tabId: string, request: TabMoveRequest): Promise<string | null> => {
      const dest = buildMoveDestination(request);
      const { workspacePaneLimit } = usePreferencesStore.getState();
      const apply = (list: Workspace[]) =>
        applyMoveTabToWorkspace(applyWake(list, dest.workspaceId), sourceWorkspaceId, tabId, dest, workspacePaneLimit);
      const canMove = () => {
        const base = applyWake(workspacesRef.current, dest.workspaceId);
        return applyMoveTabToWorkspace(base, sourceWorkspaceId, tabId, dest, workspacePaneLimit) !== base;
      };
      if (!canMove()) return null;
      if (request.kind !== "new") {
        await wakeWorkspace(request.workspaceId);
        if (!canMove()) return null;
      }
      setWorkspaces(apply);
      return dest.workspaceId;
    },
    [wakeWorkspace],
  );

  // ── Derived ───────────────────────────────────────────────────────────────

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const findTabGlobal = useCallback((tabId: string) => {
    for (const w of workspacesRef.current) {
      const result = findTabPane(w.paneTree, tabId);
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
    moveTab,
    moveTabToWorkspace,
    reorderTab,
    splitPaneAndPlace,
    splitPaneAndOpenTab,
    openTab,
    hibernateWorkspace,
    setAgentTitles,
    wakeWorkspace,
    activateTab,
    revealTab,
    closeTab,
    reopenClosed,
    updateTabData,
    replaceTab,
    setTerminalTabCwd,
    setWorkspaceCwd,
    setExplorerRootMode,
    setShowHidden,
    setWorkspaceSidebarView,
    applyExplorerSnapshotBatch,
    setWorkspaceRoot,
    clearWorkspaceRoot,
    setFsRoot,
    setWorkspaceGitConfig,
    setWorkspaceTitle,
    setWorkspaceColor,
    setWorkspaceIcon,
    setWorkspaceDetailExpanded,
    setWorkspaceGroup,
    addScript,
    updateScript,
    removeScript,
    reorderScripts,
    setActiveScript,
    setScriptPaneId,
    validateScriptTabs,
    setTerminalRunningCommand,
    toggleOverlayPreview,
    toggleSplitPreview,
    findTabGlobal,
    findPaneGlobal,
    resetWorkspaces,
    allPaneIds,
  };
}

export type UseWorkspacesReturn = ReturnType<typeof useWorkspaces>;
