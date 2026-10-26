export type NavWorkspace = {
  id: string;
  // Tab ids in the order the sidebar detail list shows them. Empty when its
  // detail is collapsed or the filter hides all.
  rowTabIds: string[];
};

export type NavStop = { workspaceId: string; tabId: string | null };

function stopsOf(workspaces: NavWorkspace[]): NavStop[] {
  return workspaces.flatMap((w): NavStop[] =>
    w.rowTabIds.length === 0
      ? [{ workspaceId: w.id, tabId: null }]
      : w.rowTabIds.map((tabId) => ({ workspaceId: w.id, tabId })),
  );
}

// Next/previous stop in the sidebar's reading order: every visible row of
// every workspace, with a workspace that shows no rows counting as one stop.
// A focused tab the sidebar does not list sits "before" its workspace's first
// stop: forward enters the workspace, backward leaves it.
export function linearNavTarget(
  workspaces: NavWorkspace[],
  current: { workspaceId: string; tabId: string | null },
  delta: 1 | -1,
): NavStop | null {
  const stops = stopsOf(workspaces);
  if (stops.length < 2) return null;
  const exact = stops.findIndex(
    (s) =>
      s.workspaceId === current.workspaceId &&
      (s.tabId === null || s.tabId === current.tabId),
  );
  if (exact !== -1) return stops[(exact + delta + stops.length) % stops.length];
  const first = stops.findIndex((s) => s.workspaceId === current.workspaceId);
  if (first === -1) return stops[delta === 1 ? 0 : stops.length - 1];
  return delta === 1 ? stops[first] : stops[(first - 1 + stops.length) % stops.length];
}
