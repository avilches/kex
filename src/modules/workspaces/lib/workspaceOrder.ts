// Single source of truth for the order in which workspaces appear in the
// sidebar. The state array keeps creation/drag order; the sidebar regroups it
// by group, so navigation (next/prev, select-by-index) must walk this same
// derived order or it diverges from what the user sees.

type Grouped = { id: string; groupId?: string };
type GroupLike = { id: string; label: string };

export type WorkspaceGroup<T> = { id: string; label: string | null; items: T[] };

const NO_GROUP_ID = "__none__";

export function groupWorkspaces<T extends Grouped>(
  workspaces: T[],
  groups: GroupLike[],
): WorkspaceGroup<T>[] {
  const validIds = new Set(groups.map((g) => g.id));
  const noGroup = workspaces.filter((w) => !w.groupId || !validIds.has(w.groupId));
  const result: WorkspaceGroup<T>[] = [];
  if (noGroup.length > 0) result.push({ id: NO_GROUP_ID, label: null, items: noGroup });
  for (const group of groups) {
    const members = workspaces.filter((w) => w.groupId === group.id);
    if (members.length > 0) result.push({ id: group.id, label: group.label, items: members });
  }
  return result;
}

// Like groupWorkspaces but keeps every group present: the no-group group is
// always first (so a workspace can lose its group) and every declared group
// appears even with zero members, so each is a drop target while dragging.
// Empty groups render as a bare header, not a placeholder box.
export function groupWorkspacesForDrag<T extends Grouped>(
  workspaces: T[],
  groups: GroupLike[],
): WorkspaceGroup<T>[] {
  const validIds = new Set(groups.map((g) => g.id));
  const noGroup = workspaces.filter((w) => !w.groupId || !validIds.has(w.groupId));
  const result: WorkspaceGroup<T>[] = [{ id: NO_GROUP_ID, label: null, items: noGroup }];
  for (const group of groups) {
    result.push({
      id: group.id,
      label: group.label,
      items: workspaces.filter((w) => w.groupId === group.id),
    });
  }
  return result;
}

const GROUP_DROP_PREFIX = "group-drop:";

export function groupDropId(groupId: string): string {
  return GROUP_DROP_PREFIX + groupId;
}

// Returns the group id if `dropId` is a group drop target, else null (an item).
export function parseGroupDropId(dropId: string): string | null {
  return dropId.startsWith(GROUP_DROP_PREFIX) ? dropId.slice(GROUP_DROP_PREFIX.length) : null;
}

// The group a WorkspaceGroup<T> id represents: the no-group group maps to null.
export function groupIdFromGroupId(groupId: string): string | null {
  return groupId === NO_GROUP_ID ? null : groupId;
}

// The workspaces reachable by keyboard navigation, in visual order. Mirrors
// exactly what the sidebar renders: a collapsed group contributes only its
// active member (the sole row it shows), everything else contributes all rows.
export function visibleWorkspaceOrder<T extends Grouped>(
  workspaces: T[],
  groups: GroupLike[],
  collapsedGroups: Set<string>,
  activeId: string | null,
): T[] {
  const order: T[] = [];
  for (const group of groupWorkspaces(workspaces, groups)) {
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

// Drops any group that no longer has a workspace pointing at it, preserving
// the declaration order of the ones that remain. Called after any change that
// can empty a group (moving a workspace out, closing it) so an empty group
// never lingers, invisible, in the persisted list.
export function pruneEmptyGroups<G extends { id: string }>(
  groups: G[],
  workspaces: Grouped[],
): G[] {
  const usedIds = new Set(workspaces.map((w) => w.groupId).filter((id): id is string => !!id));
  return groups.filter((g) => usedIds.has(g.id));
}

// Prunes `groups` after moving `workspaceId` to `nextGroupId`, computing the
// post-move membership internally instead of trusting the caller to already
// have an up-to-date workspaces array. React state updates don't land
// synchronously, so a caller that reads its own `workspaces` state right
// after scheduling the move would see the PRE-move membership and could
// prune the very group the workspace just joined instead of the one it left.
export function reconcileGroupsAfterMove<G extends { id: string }, T extends Grouped>(
  groups: G[],
  workspacesBeforeMove: T[],
  workspaceId: string,
  nextGroupId: string | null,
): G[] {
  const workspacesAfterMove = workspacesBeforeMove.map((w) =>
    w.id === workspaceId ? { ...w, groupId: nextGroupId ?? undefined } : w,
  );
  return pruneEmptyGroups(groups, workspacesAfterMove);
}
