// Color of the focused sidebar row: the workspace color wins, and the tab
// color only applies when the workspace has none.
export function sidebarChipColor(
  workspaceColor: string | null,
  tabColor: string | undefined,
): string | null {
  return workspaceColor ?? tabColor ?? null;
}

// Color of the highlighted line on top of the active tab in the pane strip:
// the tab color, else the workspace color, else null (theme indicator).
export function tabTopLineColor(
  tabColor: string | undefined,
  workspaceColor: string | null,
): string | null {
  return tabColor ?? workspaceColor;
}
