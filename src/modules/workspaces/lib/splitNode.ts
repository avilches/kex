import type { Panel, PaneNode, SplitNode } from "./types";

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

export function findPanelPane(
  tree: SplitNode,
  panelId: string,
): { pane: PaneNode; panel: Panel } | null {
  if (tree.kind === "pane") {
    const panel = tree.panels.find((p) => p.id === panelId);
    return panel ? { pane: tree, panel } : null;
  }
  return findPanelPane(tree.first, panelId) ?? findPanelPane(tree.second, panelId);
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
    const newPane: PaneNode = { kind: "pane", id: newPaneId, panels: [], activePanelId: null };
    const [first, second] = newPanePosition === "first" ? [newPane, tree] : [tree, newPane];
    return { kind: "split", id: newSplitId, orientation, first, second, dividerPosition: 0.5 };
  }
  const first = splitPaneInTree(tree.first, targetPaneId, newSplitId, newPaneId, orientation, newPanePosition);
  const second = splitPaneInTree(tree.second, targetPaneId, newSplitId, newPaneId, orientation, newPanePosition);
  if (first === tree.first && second === tree.second) return tree;
  return { ...tree, first, second };
}

export function movePanelBetweenPanes(
  tree: SplitNode,
  panelId: string,
  targetPaneId: string,
  targetIndex?: number,
): SplitNode {
  const sourceResult = findPanelPane(tree, panelId);
  if (!sourceResult) return tree;
  if (sourceResult.pane.id === targetPaneId) return tree;

  const { pane: sourcePane, panel } = sourceResult;

  // Remove from source pane
  let result = updatePane(tree, sourcePane.id, (p) => {
    const remaining = p.panels.filter((x) => x.id !== panelId);
    const newActive =
      p.activePanelId === panelId
        ? (remaining[remaining.length - 1]?.id ?? null)
        : p.activePanelId;
    return { ...p, panels: remaining, activePanelId: newActive };
  });

  // Insert into target pane
  result = updatePane(result, targetPaneId, (p) => {
    const idx = targetIndex !== undefined ? Math.min(targetIndex, p.panels.length) : p.panels.length;
    const newPanels = [...p.panels];
    newPanels.splice(idx, 0, panel);
    return { ...p, panels: newPanels, activePanelId: panel.id };
  });

  // Auto-collapse source pane if now empty (never removes the last pane)
  const updatedSource = findPane(result, sourcePane.id);
  if (updatedSource && updatedSource.panels.length === 0) {
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
