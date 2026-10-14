import { allPanes, findPane, splitPaneAndInsertTab, updatePane } from "./splitNode";
import type { PaneNode, SplitNode, Tab, Workspace } from "./types";

export type SplitDirection = "left" | "right" | "top" | "bottom";

export type TabPlacement =
  | { kind: "pane"; paneId: string; index?: number }
  | { kind: "split"; paneId: string; direction: SplitDirection; splitId: string; newPaneId: string }
  | { kind: "auto" };

export type TabMoveRequest =
  | { kind: "pane"; workspaceId: string; paneId: string; index?: number }
  | { kind: "split"; workspaceId: string; paneId: string; direction: SplitDirection }
  | { kind: "auto"; workspaceId: string }
  | { kind: "new" };

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

// Follows the right edge of the layout: through a side-by-side split it goes to
// the right half, through a stacked one it stays on the top half.
export function rightmostPane(node: SplitNode): PaneNode {
  if (node.kind === "pane") return node;
  return rightmostPane(node.orientation === "horizontal" ? node.second : node.first);
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
    case "auto":
      return insertIntoPane(ws, rightmostPane(ws.paneTree).id, tab);
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
    title: "",
    cwd,
    color,
    paneTree: { kind: "pane", id: ids.paneId, tabs: [tab], activeTabId: tab.id },
    activePaneId: ids.paneId,
  };
}
