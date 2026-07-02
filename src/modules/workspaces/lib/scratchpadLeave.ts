type PaneLike = {
  id: string;
  activeTabId?: string | null;
  tabs: ReadonlyArray<{ id: string }>;
};

// Which leaves must close their scratchpad when `targetTabId` becomes the
// active tab: the tab being left in the target pane, plus the active tab of
// the pane being left when the activation crosses panes. Blur cannot cover
// these (keyboard and programmatic activations move no DOM focus first).
export function scratchpadLeafsToClose(
  panes: ReadonlyArray<PaneLike>,
  activePaneId: string,
  targetTabId: string,
): string[] {
  const target = panes.find((p) => p.tabs.some((t) => t.id === targetTabId));
  if (!target) return [];
  const out: string[] = [];
  if (target.activeTabId && target.activeTabId !== targetTabId) {
    out.push(target.activeTabId);
  }
  if (target.id !== activePaneId) {
    const from = panes.find((p) => p.id === activePaneId);
    if (
      from?.activeTabId &&
      from.activeTabId !== targetTabId &&
      !out.includes(from.activeTabId)
    ) {
      out.push(from.activeTabId);
    }
  }
  return out;
}
