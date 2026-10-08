import { allPanes, findPane, splitPaneAndInsertTab, updatePane } from "./splitNode";
import type { Tab, Workspace } from "./types";

export type SplitDirection = "left" | "right" | "top" | "bottom";

export type TabPlacement =
  | { kind: "pane"; paneId: string; index?: number }
  | { kind: "split"; paneId: string; direction: SplitDirection; splitId: string; newPaneId: string }
  | { kind: "auto"; splitId: string; newPaneId: string };

export type TabMoveRequest =
  | { kind: "pane"; workspaceId: string; paneId: string; index?: number }
  | { kind: "split"; workspaceId: string; paneId: string; direction: SplitDirection }
  | { kind: "auto"; workspaceId: string }
  | { kind: "new" };

export function workspaceTitleFromCwd(cwd?: string): string {
  return cwd ? (cwd.split(/[\\/]/).filter(Boolean).slice(-1)[0] ?? "shell") : "shell";
}

function insertIntoPane(ws: Workspace, paneId: string, tab: Tab, index?: number): Workspace | null {
  if (!findPane(ws.paneTree, paneId)) return null;
  const paneTree = updatePane(ws.paneTree, paneId, (p) => {
    const at = index === undefined ? p.tabs.length : Math.min(index, p.tabs.length);
    const tabs = [...p.tabs];
    tabs.splice(at, 0, tab);
    return { ...p, tabs, activeTabId: tab.id };
  });
  return { ...ws, paneTree, activePaneId: paneId };
}

function splitInto(
  ws: Workspace,
  paneId: string,
  direction: SplitDirection,
  splitId: string,
  newPaneId: string,
  tab: Tab,
  paneLimit: number,
): Workspace | null {
  if (!findPane(ws.paneTree, paneId)) return null;
  if (allPanes(ws.paneTree).length >= paneLimit) return null;
  const orientation = direction === "left" || direction === "right" ? "horizontal" : "vertical";
  const position = direction === "left" || direction === "top" ? "first" : "second";
  const paneTree = splitPaneAndInsertTab(ws.paneTree, paneId, splitId, newPaneId, orientation, position, tab);
  return { ...ws, paneTree, activePaneId: newPaneId };
}

export function attachTab(ws: Workspace, tab: Tab, placement: TabPlacement, paneLimit: number): Workspace | null {
  switch (placement.kind) {
    case "pane":
      return insertIntoPane(ws, placement.paneId, tab, placement.index);
    case "split":
      return splitInto(ws, placement.paneId, placement.direction, placement.splitId, placement.newPaneId, tab, paneLimit);
    case "auto": {
      const panes = allPanes(ws.paneTree);
      if (panes.length === 1) {
        const only = panes[0]!;
        if (only.tabs.length === 0) return insertIntoPane(ws, only.id, tab);
        return (
          splitInto(ws, only.id, "right", placement.splitId, placement.newPaneId, tab, paneLimit) ??
          insertIntoPane(ws, only.id, tab)
        );
      }
      const target = findPane(ws.paneTree, ws.activePaneId) ?? panes[0]!;
      return insertIntoPane(ws, target.id, tab);
    }
  }
}

export function workspaceForTab(
  tab: Tab,
  ids: { workspaceId: string; paneId: string },
  color: string | null | undefined,
): Workspace {
  const cwd = tab.kind === "terminal" ? tab.cwd : undefined;
  return {
    id: ids.workspaceId,
    title: workspaceTitleFromCwd(cwd),
    cwd,
    color,
    paneTree: { kind: "pane", id: ids.paneId, tabs: [tab], activeTabId: tab.id },
    activePaneId: ids.paneId,
  };
}
