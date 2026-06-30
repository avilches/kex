import type { Tab, PaneNode, SplitNode } from "./types";

export function allPanes(tree: SplitNode): PaneNode[] {
  if (tree.kind === "pane") return [tree];
  return [...allPanes(tree.first), ...allPanes(tree.second)];
}

export function allPaneIds(tree: SplitNode): string[] {
  return allPanes(tree).map((p) => p.id);
}

export function findPane(tree: SplitNode, paneId: string): PaneNode | null {
  if (tree.kind === "pane") return tree.id === paneId ? tree : null;
  return findPane(tree.first, paneId) ?? findPane(tree.second, paneId);
}

/** The tab the user is currently focused on within a workspace (active pane's active tab). */
export function focusedTabId(
  tree: SplitNode,
  activePaneId: string,
): string | null {
  return findPane(tree, activePaneId)?.activeTabId ?? null;
}

export function findTabPane(
  tree: SplitNode,
  tabId: string,
): { pane: PaneNode; tab: Tab } | null {
  if (tree.kind === "pane") {
    const tab = tree.tabs.find((p) => p.id === tabId);
    return tab ? { pane: tree, tab } : null;
  }
  return findTabPane(tree.first, tabId) ?? findTabPane(tree.second, tabId);
}

export function firstPaneId(tree: SplitNode): string {
  if (tree.kind === "pane") return tree.id;
  return firstPaneId(tree.first);
}

export function siblingPane(tree: SplitNode, paneId: string): PaneNode | null {
  if (tree.kind === "pane") return null;
  if (tree.first.kind === "pane" && tree.first.id === paneId)
    return allPanes(tree.second)[0] ?? null;
  if (tree.second.kind === "pane" && tree.second.id === paneId) {
    const panes = allPanes(tree.first);
    return panes[panes.length - 1] ?? null;
  }
  return siblingPane(tree.first, paneId) ?? siblingPane(tree.second, paneId);
}

export function splitPaneInTree(
  tree: SplitNode,
  targetPaneId: string,
  newSplitId: string,
  newPaneId: string,
  orientation: "horizontal" | "vertical",
  newPanePosition: "first" | "second" = "second",
): SplitNode {
  if (tree.kind === "pane") {
    if (tree.id !== targetPaneId) return tree;
    const newPane: PaneNode = { kind: "pane", id: newPaneId, tabs: [], activeTabId: null };
    const [first, second] = newPanePosition === "first" ? [newPane, tree] : [tree, newPane];
    return { kind: "split", id: newSplitId, orientation, first, second, dividerPosition: 0.5 };
  }
  const first = splitPaneInTree(tree.first, targetPaneId, newSplitId, newPaneId, orientation, newPanePosition);
  const second = splitPaneInTree(tree.second, targetPaneId, newSplitId, newPaneId, orientation, newPanePosition);
  if (first === tree.first && second === tree.second) return tree;
  return { ...tree, first, second };
}

export function moveTabBetweenPanes(
  tree: SplitNode,
  tabId: string,
  targetPaneId: string,
  targetIndex?: number,
): SplitNode {
  const sourceResult = findTabPane(tree, tabId);
  if (!sourceResult) return tree;
  if (sourceResult.pane.id === targetPaneId) return tree;

  const { pane: sourcePane, tab } = sourceResult;

  // Remove from source pane
  let result = updatePane(tree, sourcePane.id, (p) => {
    const remaining = p.tabs.filter((x) => x.id !== tabId);
    const newActive =
      p.activeTabId === tabId
        ? (remaining[remaining.length - 1]?.id ?? null)
        : p.activeTabId;
    return { ...p, tabs: remaining, activeTabId: newActive };
  });

  // Insert into target pane
  result = updatePane(result, targetPaneId, (p) => {
    const idx = targetIndex !== undefined ? Math.min(targetIndex, p.tabs.length) : p.tabs.length;
    const newTabs = [...p.tabs];
    newTabs.splice(idx, 0, tab);
    return { ...p, tabs: newTabs, activeTabId: tab.id };
  });

  // Auto-collapse source pane if now empty (never removes the last pane)
  const updatedSource = findPane(result, sourcePane.id);
  if (updatedSource && updatedSource.tabs.length === 0) {
    const collapsed = removePaneFromTree(result, sourcePane.id);
    if (collapsed) return collapsed;
  }

  return result;
}

export function removePaneFromTree(tree: SplitNode, paneId: string): SplitNode | null {
  if (tree.kind === "pane") return tree.id === paneId ? null : tree;
  const first = removePaneFromTree(tree.first, paneId);
  const second = removePaneFromTree(tree.second, paneId);
  if (first === null && second === null) return null;
  if (first === null) return second;
  if (second === null) return first;
  if (first === tree.first && second === tree.second) return tree;
  return { ...tree, first, second };
}

export function updatePane(
  tree: SplitNode,
  paneId: string,
  updater: (p: PaneNode) => PaneNode,
): SplitNode {
  if (tree.kind === "pane") {
    if (tree.id !== paneId) return tree;
    const next = updater(tree);
    return next === tree ? tree : next;
  }
  const first = updatePane(tree.first, paneId, updater);
  const second = updatePane(tree.second, paneId, updater);
  if (first === tree.first && second === tree.second) return tree;
  return { ...tree, first, second };
}

export function updateDivider(tree: SplitNode, splitId: string, position: number): SplitNode {
  if (tree.kind === "pane") return tree;
  if (tree.id === splitId) {
    const clamped = Math.min(0.9, Math.max(0.1, position));
    if (clamped === tree.dividerPosition) return tree;  // no change
    return { ...tree, dividerPosition: clamped };
  }
  const first = updateDivider(tree.first, splitId, position);
  const second = updateDivider(tree.second, splitId, position);
  if (first === tree.first && second === tree.second) return tree;
  return { ...tree, first, second };
}

export type Rect = { left: number; right: number; top: number; bottom: number };

export function findPaneInDirection(
  activePaneId: string,
  direction: "up" | "down" | "left" | "right",
  rects: Map<string, Rect>,
): string | null {
  const activeRect = rects.get(activePaneId);
  if (!activeRect) return null;

  let best: { paneId: string; score: number } | null = null;

  for (const [paneId, rect] of rects) {
    if (paneId === activePaneId) continue;

    let isInDirection: boolean;
    let distance: number;
    let overlap: number;

    switch (direction) {
      case "right":
        isInDirection = rect.left >= activeRect.right - 1;
        distance = rect.left - activeRect.right;
        overlap = Math.max(0, Math.min(activeRect.bottom, rect.bottom) - Math.max(activeRect.top, rect.top));
        break;
      case "left":
        isInDirection = rect.right <= activeRect.left + 1;
        distance = activeRect.left - rect.right;
        overlap = Math.max(0, Math.min(activeRect.bottom, rect.bottom) - Math.max(activeRect.top, rect.top));
        break;
      case "down":
        isInDirection = rect.top >= activeRect.bottom - 1;
        distance = rect.top - activeRect.bottom;
        overlap = Math.max(0, Math.min(activeRect.right, rect.right) - Math.max(activeRect.left, rect.left));
        break;
      case "up":
        isInDirection = rect.bottom <= activeRect.top + 1;
        distance = activeRect.top - rect.bottom;
        overlap = Math.max(0, Math.min(activeRect.right, rect.right) - Math.max(activeRect.left, rect.left));
        break;
    }

    if (!isInDirection || distance < 0) continue;

    const score = distance * 10000 - overlap;
    if (!best || score < best.score) {
      best = { paneId, score };
    }
  }

  return best?.paneId ?? null;
}

export function splitPaneAndInsertTab(
  tree: SplitNode,
  targetPaneId: string,
  newSplitId: string,
  newPaneId: string,
  orientation: "horizontal" | "vertical",
  newPanePosition: "first" | "second",
  tab: Tab,
): SplitNode {
  const treeAfterSplit = splitPaneInTree(tree, targetPaneId, newSplitId, newPaneId, orientation, newPanePosition);
  if (treeAfterSplit === tree) return tree;
  return updatePane(treeAfterSplit, newPaneId, (p) => ({
    ...p,
    tabs: [tab],
    activeTabId: tab.id,
  }));
}
