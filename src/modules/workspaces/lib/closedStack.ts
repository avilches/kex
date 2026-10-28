import { newTabId } from "@/lib/ids";
import { allPanes, findPane, findTabPane, updatePane } from "./splitNode";
import type {
  ClosedEntry,
  ClosedTabEntry,
  ClosedWorkspaceEntry,
  SplitNode,
  Tab,
  Workspace,
} from "./types";
import { actionsToDelete } from "./types";

export const CLOSED_STACK_CAP = 10;

export function captureClosedEntry(
  entries: ClosedEntry[],
  entry: ClosedEntry,
  cap = CLOSED_STACK_CAP,
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

function hasTabs(ws: Workspace): boolean {
  return allPanes(ws.paneTree).some((p) => p.tabs.length > 0);
}

function withTab(ws: Workspace, entry: ClosedTabEntry): Workspace {
  const panes = allPanes(ws.paneTree);
  const paneId = findPane(ws.paneTree, entry.paneId) ? entry.paneId : panes[0]!.id;
  return {
    ...ws,
    activePaneId: paneId,
    paneTree: updatePane(ws.paneTree, paneId, (p) => ({
      ...p,
      tabs: [...p.tabs, entry.tab],
      activeTabId: entry.tab.id,
    })),
  };
}

// Records a closed workspace. One left empty by closing its last tab (the
// entry is flagged `lastOfWorkspace`) takes that tab back from the stack, so a
// single undo returns the workspace with the tab. The tabs closed earlier stay
// as entries and reopen into the restored workspace one by one. An empty
// workspace with nothing to bring back is not recorded, unless the user closed
// it on purpose (`explicit`).
export function captureClosedWorkspace(
  entries: ClosedEntry[],
  ws: Workspace,
  index: number,
  cap = CLOSED_STACK_CAP,
  explicit = false,
): ClosedEntry[] {
  const top = entries[0];
  let snapshot = ws;
  let below = entries;
  let batchId: string | undefined;
  if (!hasTabs(ws)) {
    if (top?.kind === "tab" && top.workspaceId === ws.id && top.lastOfWorkspace) {
      snapshot = withTab(ws, top);
      below = entries.slice(1);
      batchId = top.batchId;
    } else if (!explicit && actionsToDelete(ws) === 0) {
      return entries;
    }
  }
  const entry: ClosedWorkspaceEntry = { kind: "workspace", workspace: snapshot, index };
  if (batchId) entry.batchId = batchId;
  return captureClosedEntry(below, entry, cap);
}

export type ReopenPick =
  | { kind: "tab"; entry: ClosedTabEntry; workspaceId: string; paneId: string }
  | { kind: "workspace"; entry: ClosedWorkspaceEntry };

// Walks the closed stack from the newest entry. A tab entry whose workspace no
// longer exists is dropped for good.
// A tab is never reopened in a workspace other than the one it was closed in.
// A workspace entry is picked unless that workspace is already open.
export function pickReopen(
  entries: ClosedEntry[],
  workspaces: Workspace[],
): { picked: ReopenPick | null; remaining: ClosedEntry[] } {
  const remaining: ClosedEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const after = [...remaining, ...entries.slice(i + 1)];
    if (entry.kind === "workspace") {
      if (workspaces.some((w) => w.id === entry.workspace.id)) continue;
      return { picked: { kind: "workspace", entry }, remaining: after };
    }
    const ws = workspaces.find((w) => w.id === entry.workspaceId);
    if (!ws) continue;
    const paneId = findPane(ws.paneTree, entry.paneId) ? entry.paneId : ws.activePaneId;
    return { picked: { kind: "tab", entry, workspaceId: ws.id, paneId }, remaining: after };
  }
  return { picked: null, remaining };
}

export type ReopenSlot = { paneId: string; index: number };

// Where a reopened tab goes: right after the tab that was on its left when it
// closed, in whatever pane that tab is in now. A predecessor that was closed
// too is looked up in the stack and its own predecessor takes over, so the tab
// lands where the gap is. Without an open predecessor it goes first in its old
// pane, or in the active one when that pane is gone.
export function resolveReopenSlot(
  entry: ClosedTabEntry,
  others: ClosedEntry[],
  ws: Workspace,
): ReopenSlot {
  const seen = new Set<string>([entry.tab.id]);
  let prev = entry.prevTabId;
  while (prev && !seen.has(prev)) {
    seen.add(prev);
    const open = findTabPane(ws.paneTree, prev);
    if (open) return { paneId: open.pane.id, index: open.pane.tabs.findIndex((t) => t.id === prev) + 1 };
    const closed = others.find(
      (e): e is ClosedTabEntry => e.kind === "tab" && e.workspaceId === ws.id && e.tab.id === prev,
    );
    prev = closed ? closed.prevTabId : null;
  }
  return { paneId: findPane(ws.paneTree, entry.paneId) ? entry.paneId : ws.activePaneId, index: 0 };
}

// A reopened tab gets a new id; entries that pointed at the old one as their
// predecessor follow it, or their position would be lost.
export function remapPrevTabId(entries: ClosedEntry[], oldId: string, newId: string): ClosedEntry[] {
  return entries.map((e) => (e.kind === "tab" && e.prevTabId === oldId ? { ...e, prevTabId: newId } : e));
}

function reviveTab(tab: Tab, id: string): Tab {
  const base = { ...tab, id };
  if (base.kind === "editor" || base.kind === "markdown") return { ...base, dirty: false };
  if (base.kind === "browser") return { ...base, floating: false };
  return base;
}

// Gives a closed workspace the tabs it needs to mount again. Every tab gets a
// fresh id: the old ones carry marks that outlive the close (abandoned editor
// buffers, agent records). The exception is the hibernated terminals, which never
// had a PTY to kill and whose stored agent session is indexed by the tab id the
// wake-up will look up. Scripts follow their tab to its new id.
export function reviveWorkspace(
  ws: Workspace,
  mint: () => string = newTabId,
): { workspace: Workspace; idMap: ReadonlyMap<string, string> } {
  const idMap = new Map<string, string>();
  const reviveTree = (node: SplitNode): SplitNode => {
    if (node.kind === "split") {
      return { ...node, first: reviveTree(node.first), second: reviveTree(node.second) };
    }
    const tabs = node.tabs.map((t) => {
      const id = t.kind === "terminal" && t.hibernation ? t.id : mint();
      idMap.set(t.id, id);
      return reviveTab(t, id);
    });
    return {
      ...node,
      tabs,
      activeTabId: node.activeTabId ? (idMap.get(node.activeTabId) ?? null) : null,
    };
  };
  const paneTree = reviveTree(ws.paneTree);
  return { workspace: { ...ws, paneTree }, idMap };
}

// Puts a restored workspace back at the position it had, clamped to the list.
// Returns the same array when a workspace with that id is already there.
export function insertRestoredWorkspace(
  workspaces: Workspace[],
  restored: Workspace,
  index: number,
): Workspace[] {
  if (workspaces.some((w) => w.id === restored.id)) return workspaces;
  const next = [...workspaces];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, restored);
  return next;
}

// A tab flagged as the last of its workspace only stands for that close while
// the workspace is still empty. Once it holds a tab again (a new one, or one
// moved in), the flag would wrongly fold an older tab into a later close.
export function clearStaleFolds(entries: ClosedEntry[], workspaces: Workspace[]): ClosedEntry[] {
  const open = new Set(workspaces.filter(hasTabs).map((w) => w.id));
  let changed = false;
  const next = entries.map((e) => {
    if (e.kind !== "tab" || !e.lastOfWorkspace || !open.has(e.workspaceId)) return e;
    changed = true;
    const { lastOfWorkspace: _flag, ...rest } = e;
    return rest;
  });
  return changed ? next : entries;
}

function sleepingIds(entry: ClosedEntry): string[] {
  if (entry.kind === "tab") return entry.tab.kind === "terminal" && entry.tab.hibernation ? [entry.tab.id] : [];
  const ids: string[] = [];
  for (const pane of allPanes(entry.workspace.paneTree))
    for (const t of pane.tabs) if (t.kind === "terminal" && t.hibernation) ids.push(t.id);
  return ids;
}

// Sleeping tabs whose stored lines nobody can bring back: they were in the old stack and are in
// neither the new one nor an open tab. A reopened tab keeps its id, so it is still "present".
export function orphanedSleepers(
  before: readonly ClosedEntry[],
  after: readonly ClosedEntry[],
  open: ReadonlySet<string>,
): string[] {
  const kept = new Set(after.flatMap(sleepingIds));
  return before.flatMap(sleepingIds).filter((id) => !kept.has(id) && !open.has(id));
}
