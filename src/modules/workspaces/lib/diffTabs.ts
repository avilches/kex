import type { PaneNode, Tab } from "./types";

type DiffTab = Extract<Tab, { kind: "git-diff" | "git-commit-file" }>;

// What identifies "the same diff" regardless of the tab's id or preview
// state: a working-tree diff by repo+path+mode, a commit diff by repo+sha+path.
export type DiffIdentity =
  | { kind: "git-diff"; repoRoot: string; path: string; mode: "-" | "+" }
  | { kind: "git-commit-file"; repoRoot: string; sha: string; path: string };

export function isDiffTab(tab: Tab): tab is DiffTab {
  return tab.kind === "git-diff" || tab.kind === "git-commit-file";
}

function sameDiff(tab: DiffTab, candidate: DiffIdentity): boolean {
  if (tab.kind !== candidate.kind) return false;
  if (tab.kind === "git-diff" && candidate.kind === "git-diff") {
    return (
      tab.repoRoot === candidate.repoRoot &&
      tab.path === candidate.path &&
      tab.mode === candidate.mode
    );
  }
  if (tab.kind === "git-commit-file" && candidate.kind === "git-commit-file") {
    return (
      tab.repoRoot === candidate.repoRoot &&
      tab.sha === candidate.sha &&
      tab.path === candidate.path
    );
  }
  return false;
}

export type DiffTabPlan =
  | { action: "activate"; tabId: string; shouldUnpin: boolean }
  | { action: "replace"; oldTabId: string; paneId: string }
  | { action: "create" };

// Decides what opening `candidate` should do to the tab layout, without
// touching any state itself: reuse an already-open match anywhere in the
// workspace, recycle the repo's preview slot wherever it lives (one per
// repoRoot per workspace, preferring the active pane; git-diff and
// git-commit-file share it), or create a new tab. `pin` is true
// for a gesture (double click, explicit menu action) that must leave the
// diff open permanently instead of in the recyclable preview slot.
export function planDiffTabOpen(
  panes: PaneNode[],
  activePaneId: string,
  candidate: DiffIdentity,
  pin: boolean,
): DiffTabPlan {
  for (const pane of panes) {
    for (const tab of pane.tabs) {
      if (isDiffTab(tab) && sameDiff(tab, candidate)) {
        return { action: "activate", tabId: tab.id, shouldUnpin: pin && tab.preview === true };
      }
    }
  }
  if (!pin) {
    let found: { oldTabId: string; paneId: string } | null = null;
    for (const pane of panes) {
      const tab = pane.tabs.find(
        (t) => isDiffTab(t) && t.preview && t.repoRoot === candidate.repoRoot,
      );
      if (!tab) continue;
      if (pane.id === activePaneId) return { action: "replace", oldTabId: tab.id, paneId: pane.id };
      found ??= { oldTabId: tab.id, paneId: pane.id };
    }
    if (found) return { action: "replace", ...found };
  }
  return { action: "create" };
}
