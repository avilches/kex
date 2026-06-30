// Single source of truth for the order in which workspaces appear in the
// sidebar. The state array keeps creation/drag order; the sidebar regroups it
// by status, so navigation (next/prev, select-by-index) must walk this same
// derived order or it diverges from what the user sees.

type Grouped = { id: string; statusId?: string };
type StatusLike = { id: string; label: string };

export type WorkspaceGroup<T> = { id: string; label: string | null; items: T[] };

export const NO_STATUS_GROUP_ID = "__none__";

export function groupWorkspaces<T extends Grouped>(
  workspaces: T[],
  statuses: StatusLike[],
): WorkspaceGroup<T>[] {
  const validIds = new Set(statuses.map((s) => s.id));
  const noStatus = workspaces.filter((w) => !w.statusId || !validIds.has(w.statusId));
  const result: WorkspaceGroup<T>[] = [];
  if (noStatus.length > 0) result.push({ id: NO_STATUS_GROUP_ID, label: null, items: noStatus });
  for (const status of statuses) {
    const members = workspaces.filter((w) => w.statusId === status.id);
    if (members.length > 0) result.push({ id: status.id, label: status.label, items: members });
  }
  return result;
}

// The workspaces reachable by keyboard navigation, in visual order. Mirrors
// exactly what the sidebar renders: a collapsed group contributes only its
// active member (the sole row it shows), everything else contributes all rows.
export function visibleWorkspaceOrder<T extends Grouped>(
  workspaces: T[],
  statuses: StatusLike[],
  collapsedGroups: Set<string>,
  activeId: string | null,
): T[] {
  const order: T[] = [];
  for (const group of groupWorkspaces(workspaces, statuses)) {
    const collapsible = group.label !== null;
    if (collapsible && collapsedGroups.has(group.id)) {
      const activeWs = group.items.find((w) => w.id === activeId);
      if (activeWs) order.push(activeWs);
    } else {
      order.push(...group.items);
    }
  }
  return order;
}
