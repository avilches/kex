import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeRootPath } from "@/lib/pathUtils";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { arrayMove } from "@dnd-kit/sortable";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import {
  addAction,
  adoptActionAt,
  removeAction,
  reorderActions,
  reorderBefore,
  updateAction,
  type Action,
} from "@/modules/actions";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { globalActions } from "@/modules/actions/lib/globalActionsBinding";
import { unlinkRemovedActions } from "@/modules/actions/lib/actionStateStore";
import { toast } from "sonner";
import { claimClose, flushWorkspaceState } from "./workspaceState";
import { flushTabUses, recordTabClosed } from "./tabHistory";
import { setRunningCommand } from "./terminalEphemeralStore";
import { syncTabWorkspaceRoots } from "./tabWorkspaceRootStore";
import { previewResumeCmd, seedRestorePlan, type RestorePlan } from "@/modules/agents/lib/agentSessionRestore";
import { applyAgentTitles, clearAgentTitles as clearAgentTitlesFn } from "./agentTitles";
import { setWakeBackdrop } from "@/modules/terminal/lib/wakeBackdrop";
import { applyHibernate, applyWake, isHibernatedTab, terminalTabs } from "./hibernate";
import { wakeBackdrop } from "./hibernateLines";
import { readHibernateLines } from "./hibernateLinesIo";
import { unmarkHibernating } from "@/modules/agents/lib/hibernatingTabs";
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
import { type ClosedEntry, type Tab, type PaneNode, type TabHibernation, type Workspace, type WorkspaceGitConfig, isAutofocusTab } from "./types";
import type { ExplorerRootMode } from "./explorerRoot";
import { applyExplorerSnapshots, applySidebarView, type ExplorerSnapshot } from "./sidebarSnapshot";
import type { SidebarView } from "./sidebarState";
import { newActionId, newWorkspaceId, newPaneId, newSplitId, newTabId } from "@/lib/ids";
import {
  buildReopenedTab,
  captureClosedEntry,
  remapPrevTabId,
  resolveReopenSlot,
  captureClosedWorkspace,
  clearStaleFolds,
  insertRestoredWorkspace,
  pickReopen,
  reviveWorkspace,
} from "./closedStack";
import { dismissCloseNotice, showCloseNotice } from "./closedNotice";
import { withLiveRunOnStart, withLiveRunOnStartAll } from "./runOnStartSave";

// Whether a reopened closed tab is worth asking Rust for a live agent resume plan.
// Mirrors the same "Run on start" gate the startup restore flow already applies
// (useTerminalSession.ts), so a tab with it off never even fetches a plan it would
// discard anyway.
export function needsResumePlanLookup(tab: Tab): boolean {
  return tab.kind === "terminal" && tab.restoreOnRestart !== false;
}

export function planWake(tabs: readonly Tab[]): string[] {
  return tabs.filter(needsResumePlanLookup).map((t) => t.id);
}

export async function seedWakePlans(
  tabs: readonly Tab[],
  lookup: (tabId: string) => Promise<RestorePlan | null>,
  seed: (tabId: string, plan: RestorePlan) => void,
): Promise<void> {
  await Promise.all(
    planWake(tabs).map(async (tabId) => {
      const plan = await lookup(tabId);
      if (plan) seed(tabId, plan);
    }),
  );
}

// The terminal that mounts after the wake starts with the lines the tab showed when it went to
// sleep. They are read here, before the wake drops the stored file, and a read that fails only
// means the terminal starts empty.
export async function handOverLastLines(
  tabIds: readonly string[],
  read: (tabId: string) => Promise<string | null> = readHibernateLines,
  give: (tabId: string, backdrop: string) => void = setWakeBackdrop,
): Promise<void> {
  await Promise.all(
    tabIds.map(async (tabId) => {
      try {
        const stored = await read(tabId);
        const backdrop = stored ? wakeBackdrop(stored) : "";
        if (backdrop) give(tabId, backdrop);
      } catch {}
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
  const normalized = normalizeRootPath(path);
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

export function applyWorkspaceActions(
  workspaces: Workspace[],
  workspaceId: string,
  change: (actions: Action[]) => Action[],
): Workspace[] {
  return workspaces.map((w) => {
    if (w.id !== workspaceId) return w;
    const actions = change(w.actions ?? []);
    const keepActive = actions.some((a) => a.id === w.activeAction);
    return { ...w, actions, activeAction: keepActive ? w.activeAction : undefined };
  });
}

function workspaceActions(workspaces: readonly Workspace[], workspaceId: string): Action[] {
  return workspaces.find((w) => w.id === workspaceId)?.actions ?? [];
}

export function applySetActiveAction(
  workspaces: Workspace[],
  workspaceId: string,
  actionId: string | null,
): Workspace[] {
  return workspaces.map((w) => {
    if (w.id !== workspaceId) return w;
    const exists = actionId !== null && (w.actions ?? []).some((a) => a.id === actionId);
    return { ...w, activeAction: exists ? actionId : undefined };
  });
}

// Removes an action from its workspace and hands it back, for a promotion to the global list.
export function takeWorkspaceAction(
  workspaces: Workspace[],
  workspaceId: string,
  actionId: string,
): { workspaces: Workspace[]; action: Action | null } {
  const action = workspaces.find((w) => w.id === workspaceId)?.actions?.find((a) => a.id === actionId);
  if (!action) return { workspaces, action: null };
  return {
    workspaces: applyWorkspaceActions(workspaces, workspaceId, (list) => removeAction(list, actionId)),
    action,
  };
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

export function applyOpenTab(
  workspaces: Workspace[],
  workspaceId: string,
  paneId: string,
  tab: Tab,
  insertionIndex?: number,
): Workspace[] {
  return workspaces.map((w) => {
    if (w.id !== workspaceId) return w;
    return {
      ...w,
      paneTree: updatePane(w.paneTree, paneId, (p) => {
        const idx = tabInsertionIndex(p.tabs, p.activeTabId, insertionIndex);
        const newTabs = [...p.tabs];
        newTabs.splice(idx, 0, tab);
        return { ...p, tabs: newTabs, activeTabId: tab.id };
      }),
    };
  });
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

// A workspace left with no tabs folds away with its last tab only when it holds
// nothing at all: an empty chip with no name, color, icon, workspace root or
// actions has nothing to keep. The window's only workspace survives (the window
// would close with it), and so does any customized one; those that hold actions
// stay protected by the close-workspace confirmation dialog.
export function isBlankWorkspace(ws: Workspace): boolean {
  return (
    workspaceTabCount(ws) === 0 &&
    !ws.title.trim() &&
    !ws.color &&
    !ws.icon &&
    !ws.workspaceRoot &&
    !ws.actions?.length
  );
}

export function applyDropDeadScriptPanes(workspaces: Workspace[]): Workspace[] {
  let changed = false;
  const next = workspaces.map((w) => {
    if (!w.scriptPaneId || allPanes(w.paneTree).some((p) => p.id === w.scriptPaneId)) return w;
    changed = true;
    return { ...w, scriptPaneId: undefined };
  });
  return changed ? next : workspaces;
}

export function emptyWorkspaceToClose(workspaces: Workspace[]): Workspace | null {
  if (workspaces.length <= 1) return null;
  return workspaces.find(isBlankWorkspace) ?? null;
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
    .filter((tab): tab is Extract<Tab, { kind: "terminal" }> => tab.kind === "terminal" && !tab.hibernation);
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
  useEffect(() => { syncTabWorkspaceRoots(workspaces); }, [workspaces]);

  const previousWorkspaceIdRef = useRef<string | null>(null);
  const closedTabsRef = useRef<ClosedEntry[]>([]);
  useEffect(() => {
    closedTabsRef.current = clearStaleFolds(closedTabsRef.current, workspaces);
  }, [workspaces]);

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
      void Promise.all([flushTabUses(), flushWorkspaceState()]).finally(async () => {
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

  // `explicit` is a close the user asked for: even a blank workspace is recorded.
  const closeWorkspace = useCallback((id: string, explicit = false) => {
    const closing = workspacesRef.current.find((w) => w.id === id);
    if (closing) {
      const stash = useAgentStore.getState().stashClosedSession;
      for (const t of terminalTabs(closing)) stash(t.id);
      for (const pane of allPanes(closing.paneTree))
        for (const tab of pane.tabs) recordTabClosed(tab, id);
      const before = closedTabsRef.current;
      closedTabsRef.current = captureClosedWorkspace(
        before,
        withLiveRunOnStartAll(closing),
        workspacesRef.current.findIndex((w) => w.id === id),
        undefined,
        explicit,
      );
      if (closedTabsRef.current !== before) showCloseNotice(closedTabsRef.current);
    }
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
  // customized ones (name, color, icon, root, actions) are exempt.
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
        if (w.id !== workspaceId) return w;
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
    const newTab = withNewTabAutofocus(tab);
    recordActivation(paneId, newTab.id);
    setWorkspaces((prev) => applyOpenTab(prev, workspaceId, paneId, newTab, insertionIndex));
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

  const closeTab = useCallback((workspaceId: string, tabId: string, batchId?: string) => {
    const ws = workspacesRef.current.find((w) => w.id === workspaceId);
    let history: string[] | undefined;
    useAgentStore.getState().stashClosedSession(tabId);
    if (ws) {
      const found = findTabPane(ws.paneTree, tabId);
      if (found) {
        recordTabClosed(found.tab, workspaceId);
        if (found.tab.kind === "terminal" && found.tab.hibernation) unmarkHibernating([tabId]);
        history = paneActivationHistoryRef.current.get(found.pane.id);
        closedTabsRef.current = captureClosedEntry(closedTabsRef.current, {
          kind: "tab",
          tab: withLiveRunOnStart(found.tab),
          paneId: found.pane.id,
          workspaceId,
          prevTabId: found.pane.tabs[found.pane.tabs.findIndex((t) => t.id === tabId) - 1]?.id ?? null,
          lastOfWorkspace: workspaceTabCount(ws) === 1,
          ...(batchId ? { batchId } : {}),
        });
        showCloseNotice(closedTabsRef.current);
      }
    }
    // Applied to the ref right away too: closes batched in one tick must see
    // each other, or none of them knows it was the last tab of its workspace.
    workspacesRef.current = applyCloseTab(workspacesRef.current, workspaceId, tabId, history);
    setWorkspaces((prev) => applyCloseTab(prev, workspaceId, tabId, history));
  }, []);

  // Reopens the newest entry; with `onlyBatch` it stops at an entry of another
  // batch and leaves the stack alone. Returns what it reopened.
  const reopenOne = useCallback(async (onlyBatch?: string): Promise<ClosedEntry | null> => {
    const { picked, remaining } = pickReopen(closedTabsRef.current, workspacesRef.current);
    if (!picked) {
      if (!onlyBatch) closedTabsRef.current = remaining;
      return null;
    }
    if (onlyBatch && picked.entry.batchId !== onlyBatch) return null;
    closedTabsRef.current = remaining;

    // A reopened terminal tab that used to run an agent gets the same live,
    // just-in-time resume plan the startup flow computes, keyed by the id the
    // tab had before it was closed (agent-sessions.json is indexed by tab id).
    // Seeding it under the new id lets useTerminalSession's normal restore-plan
    // consumption pick it up with no other change to the spawn path.
    const seedPlan = async (tab: Tab, newId: string) => {
      if (!needsResumePlanLookup(tab)) return;
      const plan = await previewResumeCmd(tab.id);
      if (plan) seedRestorePlan(newId, plan);
    };

    if (picked.kind === "workspace") {
      const { workspace, idMap } = reviveWorkspace(picked.entry.workspace);
      // A sleeping tab keeps its id, and its plan is seeded when it wakes.
      const renamed = terminalTabs(picked.entry.workspace).filter((t) => !t.hibernation);
      await Promise.all(renamed.map((t) => seedPlan(t, idMap.get(t.id) ?? t.id)));
      setWorkspaces((prev) => insertRestoredWorkspace(prev, workspace, picked.entry.index));
      // The ref follows right away so the next entry of a batch finds the workspace.
      workspacesRef.current = insertRestoredWorkspace(workspacesRef.current, workspace, picked.entry.index);
      selectWorkspace(workspace.id);
      const agents = useAgentStore.getState();
      for (const [oldId, newId] of idMap) agents.restoreClosedSession(oldId, newId, workspace.id);
      return picked.entry;
    }

    const { entry } = picked;
    // A sleeping tab comes back asleep with its own id: its stored lines and agent session are
    // indexed by it, and its plan is seeded when it wakes.
    const asleep = isHibernatedTab(entry.tab);
    const newId = asleep ? entry.tab.id : newTabId();
    if (!asleep) await seedPlan(entry.tab, newId);
    const newTab = buildReopenedTab(entry.tab, newId);
    closedTabsRef.current = remapPrevTabId(closedTabsRef.current, entry.tab.id, newId);
    const ws = workspacesRef.current.find((w) => w.id === picked.workspaceId);
    const slot = ws ? resolveReopenSlot(entry, closedTabsRef.current, ws) : { paneId: picked.paneId, index: 0 };
    openTab(picked.workspaceId, slot.paneId, newTab, slot.index);
    workspacesRef.current = applyOpenTab(workspacesRef.current, picked.workspaceId, slot.paneId, withNewTabAutofocus(newTab), slot.index);
    selectWorkspace(picked.workspaceId);
    useAgentStore.getState().restoreClosedSession(entry.tab.id, newId, picked.workspaceId);
    return entry;
  }, [openTab, selectWorkspace]);

  const reopenClosed = useCallback(async () => {
    dismissCloseNotice();
    const first = await reopenOne();
    if (!first?.batchId) return;
    while (await reopenOne(first.batchId)) {
      // one undo returns every tab the same bulk close took
    }
  }, [reopenOne]);

  const replaceTab = useCallback((workspaceId: string, paneId: string, oldTabId: string, newTab: Tab) => {
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

  const setScriptPaneId = useCallback((workspaceId: string, paneId: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => w.id === workspaceId ? { ...w, scriptPaneId: paneId } : w),
    );
  }, []);

  // The runtime link of a script to its tab is not saved, so only the pane of the scripts can
  // be left pointing at a pane that no longer exists.
  const dropDeadScriptPanes = useCallback(() => {
    setWorkspaces((prev) => applyDropDeadScriptPanes(prev));
  }, []);

  const addWorkspaceAction = useCallback((workspaceId: string, action: Action) => {
    setWorkspaces((prev) => applyWorkspaceActions(prev, workspaceId, (list) => addAction(list, action)));
  }, []);

  // The runtime link of an Action is dropped here, not by watching the lists: a promotion
  // also takes an Action out of the workspace, and that one keeps running as a global Action.
  // It happens outside the state updater, which has to stay pure.
  const updateWorkspaceAction = useCallback(
    (workspaceId: string, actionId: string, patch: Partial<Omit<Action, "id">>) => {
      const change = (list: Action[]) => updateAction(list, actionId, patch);
      const before = workspaceActions(workspacesRef.current, workspaceId);
      unlinkRemovedActions(before, change(before));
      setWorkspaces((prev) => applyWorkspaceActions(prev, workspaceId, change));
    },
    [],
  );

  const removeWorkspaceAction = useCallback((workspaceId: string, actionId: string) => {
    const before = workspaceActions(workspacesRef.current, workspaceId);
    unlinkRemovedActions(before, removeAction(before, actionId));
    setWorkspaces((prev) => applyWorkspaceActions(prev, workspaceId, (list) => removeAction(list, actionId)));
  }, []);

  const reorderWorkspaceActions = useCallback((workspaceId: string, fromId: string, toId: string) => {
    setWorkspaces((prev) =>
      applyWorkspaceActions(prev, workspaceId, (list) => reorderActions(list, fromId, toId)),
    );
  }, []);

  const placeWorkspaceAction = useCallback((workspaceId: string, id: string, beforeId?: string) => {
    setWorkspaces((prev) => applyWorkspaceActions(prev, workspaceId, (list) => reorderBefore(list, id, beforeId)));
  }, []);

  const setActiveWorkspaceAction = useCallback((workspaceId: string, actionId: string | null) => {
    setWorkspaces((prev) => applySetActiveAction(prev, workspaceId, actionId));
  }, []);

  // Two steps so an action added in the same tick can still be promoted: the updater only
  // takes the action out and queues it (a Map keyed by workspace and action, so a repeated
  // updater run is harmless), and the effect below writes the global list outside any updater.
  const promotionsRef = useRef(new Map<string, { workspaceId: string; action: Action; beforeId?: string }>());
  const promoteWorkspaceAction = useCallback((workspaceId: string, actionId: string, beforeId?: string) => {
    setWorkspaces((prev) => {
      const taken = takeWorkspaceAction(prev, workspaceId, actionId);
      if (taken.action) promotionsRef.current.set(`${workspaceId}/${actionId}`, { workspaceId, action: taken.action, beforeId });
      return taken.workspaces;
    });
  }, []);

  useEffect(() => {
    if (promotionsRef.current.size === 0) return;
    const queue = [...promotionsRef.current.values()];
    promotionsRef.current.clear();
    for (const { workspaceId, action, beforeId } of queue) {
      globalActions.add(action, beforeId).catch((err: unknown) => {
        console.error("Could not save the global action", err);
        toast.error(`Could not make "${action.name}" global; it stays in the workspace`);
        setWorkspaces((prev) => applyWorkspaceActions(prev, workspaceId, (list) => addAction(list, action)));
      });
    }
  }, [workspaces]);

  // The inverse of the promotion: the Action leaves the global list and joins the workspace,
  // keeping its id. The global write goes first, so a failed move leaves the actions alone.
  const demoteGlobalAction = useCallback(
    (workspaceId: string, actionId: string, beforeId?: string) => {
      const action = globalActions.get().find((a) => a.id === actionId);
      if (!action) return;
      // Adoption can mint a fresh id and leave the old one behind: its link is dropped,
      // while a kept id keeps running and stays stoppable as a workspace Action.
      const clash = workspaceActions(workspacesRef.current, workspaceId).some((a) => a.id === actionId);
      if (clash) unlinkRemovedActions([action], []);
      void globalActions
        .change((list) => removeAction(list, actionId))
        .then(() => setWorkspaces((prev) => applyWorkspaceActions(prev, workspaceId, (list) => adoptActionAt(list, action, newActionId, beforeId).list)))
        .catch((err: unknown) => {
          console.error("Could not move the global action back", err);
          toast.error(`Could not move "${action.name}" to the workspace`);
        });
    },
    [],
  );

  const setAgentTitles = useCallback((titles: ReadonlyMap<string, string>) => {
    setWorkspaces((prev) => applyAgentTitles(prev, titles));
  }, []);

  const clearAgentTitles = useCallback((tabIds: ReadonlySet<string>) => {
    setWorkspaces((prev) => clearAgentTitlesFn(prev, tabIds));
  }, []);

  const hibernateWorkspace = useCallback((workspaceId: string, snapshots: Record<string, TabHibernation>) => {
    setWorkspaces((prev) => applyHibernate(prev, workspaceId, snapshots));
  }, []);

  // Seeds each tab's resume plan first, so the terminal that mounts finds it when it spawns.
  const wakeTabs = useCallback(async (workspaceId: string, tabIds: readonly string[]) => {
    const ws = workspacesRef.current.find((w) => w.id === workspaceId);
    if (!ws) return;
    const wanted = new Set(tabIds);
    const tabs = terminalTabs(ws).filter((t) => t.hibernation && wanted.has(t.id));
    if (tabs.length === 0) return;
    await runOnce(wakesInFlight, tabs.map((t) => t.id).sort().join(","), async () => {
      await seedWakePlans(tabs, previewResumeCmd, seedRestorePlan);
      await handOverLastLines(tabs.map((t) => t.id));
      unmarkHibernating(tabs.map((t) => t.id));
      setWorkspaces((prev) => applyWake(prev, workspaceId, new Set(tabs.map((t) => t.id))));
    });
  }, []);

  const moveTabToWorkspace = useCallback(
    async (sourceWorkspaceId: string, tabId: string, request: TabMoveRequest): Promise<string | null> => {
      const dest = buildMoveDestination(request);
      const { workspacePaneLimit } = usePreferencesStore.getState();
      const apply = (list: Workspace[]) =>
        applyMoveTabToWorkspace(list, sourceWorkspaceId, tabId, dest, workspacePaneLimit);
      if (apply(workspacesRef.current) === workspacesRef.current) return null;
      setWorkspaces(apply);
      return dest.workspaceId;
    },
    [],
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
    closedTabsRef.current = [];
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
    clearAgentTitles,
    wakeTabs,
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
    setScriptPaneId,
    dropDeadScriptPanes,
    addWorkspaceAction,
    updateWorkspaceAction,
    removeWorkspaceAction,
    reorderWorkspaceActions,
    placeWorkspaceAction,
    setActiveWorkspaceAction,
    promoteWorkspaceAction,
    demoteGlobalAction,
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
