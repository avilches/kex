import type { SplitNode, Workspace } from "./types";

function withTitles(node: SplitNode, titles: ReadonlyMap<string, string>): SplitNode {
  if (node.kind === "pane") {
    let changed = false;
    const tabs = node.tabs.map((t) => {
      const title = t.kind === "terminal" ? titles.get(t.id) : undefined;
      if (title === undefined || t.kind !== "terminal" || t.agentTitle === title) return t;
      changed = true;
      return { ...t, agentTitle: title };
    });
    return changed ? { ...node, tabs } : node;
  }
  const first = withTitles(node.first, titles);
  const second = withTitles(node.second, titles);
  return first === node.first && second === node.second ? node : { ...node, first, second };
}

// Returns the same array when no terminal tab changes, so React skips the render and the save.
export function applyAgentTitles(workspaces: Workspace[], titles: ReadonlyMap<string, string>): Workspace[] {
  if (titles.size === 0) return workspaces;
  let changed = false;
  const next = workspaces.map((w) => {
    const paneTree = withTitles(w.paneTree, titles);
    if (paneTree === w.paneTree) return w;
    changed = true;
    return { ...w, paneTree };
  });
  return changed ? next : workspaces;
}
