import type { ShortcutId } from "@/modules/shortcuts/shortcuts";
import { allPanes } from "./splitNode";
import type { PaneNode, SplitNode, Tab, Workspace } from "./types";

type TerminalTab = Extract<Tab, { kind: "terminal" }>;

export function stripTabs(node: SplitNode): SplitNode {
  if (node.kind === "pane") return { ...node, tabs: [], activeTabId: null };
  return { ...node, first: stripTabs(node.first), second: stripTabs(node.second) };
}

// Editors are about to be unmounted (their unsaved state goes with them) and a
// floating browser window is destroyed, so neither flag may outlive hibernation.
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
// on while the workspace is asleep (its tabs are in the tree but not mounted).
const BLOCKED_PREFIXES = ["tab.", "pane.", "terminal.", "editor.", "markdown.", "file.", "path."];

export function blockedWhileHibernated(id: ShortcutId): boolean {
  return id === "search.focus" || id === "workspace.run" || BLOCKED_PREFIXES.some((p) => id.startsWith(p));
}

function clearTransientTabState(node: SplitNode): SplitNode {
  if (node.kind === "pane") {
    const pane: PaneNode = {
      ...node,
      tabs: node.tabs.map((t) => {
        if (t.kind === "editor" || t.kind === "markdown") return { ...t, dirty: false };
        if (t.kind === "browser") return { ...t, floating: false };
        return t;
      }),
    };
    return pane;
  }
  return { ...node, first: clearTransientTabState(node.first), second: clearTransientTabState(node.second) };
}

export function applyHibernate(workspaces: Workspace[], workspaceId: string): Workspace[] {
  return workspaces.map((w) =>
    w.id === workspaceId ? { ...w, hibernated: true, paneTree: clearTransientTabState(w.paneTree) } : w,
  );
}

export function applyWake(workspaces: Workspace[], workspaceId: string): Workspace[] {
  return workspaces.map((w) => {
    if (w.id !== workspaceId) return w;
    const { hibernated: _hibernated, ...rest } = w;
    return rest;
  });
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

export function enableRunOnStart(tab: Tab, runningCommand?: string): Tab {
  if (tab.kind !== "terminal") return tab;
  return {
    ...tab,
    restoreOnRestart: true,
    persistentCommand: tab.persistentCommand ?? runningCommand,
  };
}
