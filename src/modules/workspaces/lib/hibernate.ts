import type { ShortcutId } from "@/modules/shortcuts/shortcuts";
import { allPanes } from "./splitNode";
import type { SplitNode, Tab, TabHibernation, Workspace } from "./types";

type TerminalTab = Extract<Tab, { kind: "terminal" }>;

export function stripTabs(node: SplitNode): SplitNode {
  if (node.kind === "pane") return { ...node, tabs: [], activeTabId: null };
  return { ...node, first: stripTabs(node.first), second: stripTabs(node.second) };
}

const strippedCache = new WeakMap<SplitNode, SplitNode>();

export function strippedTree(node: SplitNode): SplitNode {
  let out = strippedCache.get(node);
  if (!out) {
    out = stripTabs(node);
    strippedCache.set(node, out);
  }
  return out;
}

// Shortcuts that act on tabs, terminals, editors or scripts have nothing to act
// on while the workspace is asleep (its tabs are in the tree but not mounted), and
// the Sidebar and the zen layout are not shown, so changing their state would only
// surprise the user on wake. `tab.close` is the exception: it closes the workspace.
const BLOCKED_PREFIXES = ["tab.", "pane.", "terminal.", "editor.", "markdown.", "file.", "path.", "sidebar.", "explorer."];
const BLOCKED_IDS: readonly ShortcutId[] = ["search.focus", "workspace.run", "view.zenMode"];

export function blockedWhileHibernated(id: ShortcutId): boolean {
  if (id === "tab.close") return false;
  return BLOCKED_IDS.includes(id) || BLOCKED_PREFIXES.some((p) => id.startsWith(p));
}

// Editors are about to be unmounted (their unsaved state goes with them) and a
// floating browser window is destroyed, so neither flag may outlive hibernation.
function clearTransientTabState(node: SplitNode, snapshots: Readonly<Record<string, TabHibernation>>): SplitNode {
  if (node.kind === "pane") {
    return {
      ...node,
      tabs: node.tabs.map((t) => {
        if (t.kind === "terminal") return snapshots[t.id] ? { ...t, hibernation: snapshots[t.id] } : t;
        if (t.kind === "editor" || t.kind === "markdown") return { ...t, dirty: false };
        if (t.kind === "browser") return { ...t, floating: false };
        return t;
      }),
    };
  }
  return { ...node, first: clearTransientTabState(node.first, snapshots), second: clearTransientTabState(node.second, snapshots) };
}

export function applyHibernate(
  workspaces: Workspace[],
  workspaceId: string,
  now: number = Date.now(),
  snapshots: Readonly<Record<string, TabHibernation>> = {},
): Workspace[] {
  return workspaces.map((w) =>
    w.id === workspaceId
      ? {
          ...w,
          hibernated: true,
          hibernatedAt: w.hibernated ? w.hibernatedAt : now,
          paneTree: clearTransientTabState(w.paneTree, snapshots),
        }
      : w,
  );
}

// Two units at most: "5m", "3h 20m", "2d 4h". A zero second unit is left out.
export function formatHibernatedFor(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "less than a minute";
  const unit = (big: number, bigLabel: string, small: number, smallLabel: string) =>
    small > 0 ? `${big}${bigLabel} ${small}${smallLabel}` : `${big}${bigLabel}`;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return unit(hours, "h", minutes % 60, "m");
  return unit(Math.floor(hours / 24), "d", hours % 24, "h");
}

function clearTabSnapshots(node: SplitNode): SplitNode {
  if (node.kind === "pane") {
    return {
      ...node,
      tabs: node.tabs.map((t) => {
        if (t.kind !== "terminal" || !t.hibernation) return t;
        const { hibernation: _hibernation, ...rest } = t;
        return rest;
      }),
    };
  }
  return { ...node, first: clearTabSnapshots(node.first), second: clearTabSnapshots(node.second) };
}

export function applyWake(workspaces: Workspace[], workspaceId: string): Workspace[] {
  return workspaces.map((w) => {
    if (w.id !== workspaceId) return w;
    const { hibernated: _hibernated, hibernatedAt: _hibernatedAt, ...rest } = w;
    return { ...rest, paneTree: clearTabSnapshots(rest.paneTree) };
  });
}

// A workspace with no tabs has nothing to put to sleep.
export function hasTabs(ws: Workspace): boolean {
  return allPanes(ws.paneTree).some((p) => p.tabs.length > 0);
}

export function terminalTabs(ws: Workspace): TerminalTab[] {
  return allPanes(ws.paneTree)
    .flatMap((p) => p.tabs)
    .filter((t): t is TerminalTab => t.kind === "terminal");
}

export function editorTabIds(ws: Workspace): string[] {
  return allPanes(ws.paneTree)
    .flatMap((p) => p.tabs)
    .filter((t) => t.kind === "editor" || t.kind === "markdown")
    .map((t) => t.id);
}

// What the restore will type into the tab: the agent resume command, else the run-on-start command.
export function restoreCommandFor(tab: TerminalTab, plan: { resumeCmd: string } | null | undefined): string | undefined {
  return plan?.resumeCmd.trim() || (tab.restoreOnRestart ? tab.persistentCommand : undefined) || undefined;
}

export function enableRunOnStart(tab: Tab, runningCommand?: string): Tab {
  if (tab.kind !== "terminal") return tab;
  return {
    ...tab,
    restoreOnRestart: true,
    persistentCommand: tab.persistentCommand ?? runningCommand,
  };
}

export function isPendingStale(pendingId: string | null, workspaces: readonly { id: string }[]): boolean {
  return pendingId !== null && !workspaces.some((w) => w.id === pendingId);
}

// The global shortcut listener runs in capture phase before the Radix dialog, so a modal
// does not block it; any workspace dialog awaiting an answer must disable them.
export function workspaceDialogPending(hibernatePendingId: string | null, closePendingId: string | null | undefined): boolean {
  return hibernatePendingId !== null || (closePendingId ?? null) !== null;
}
