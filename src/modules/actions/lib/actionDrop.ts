import type { Action } from "./types";

export type Scope = "global" | "workspace";
export type ScopedLists = Readonly<Record<Scope, readonly Action[]>>;
export type ActionRef = { scope: Scope; action: Action };

export const columnDropId = (scope: Scope): string => `col:${scope}`;

export function parseColumnDropId(id: string): Scope | null {
  return id === "col:global" ? "global" : id === "col:workspace" ? "workspace" : null;
}

export function locateAction(lists: ScopedLists, id: string): ActionRef | null {
  for (const scope of ["global", "workspace"] as const) {
    const action = lists[scope].find((a) => a.id === id);
    if (action) return { scope, action };
  }
  return null;
}

export type DropResult =
  | { kind: "reorder"; scope: Scope; fromId: string; toId: string }
  | { kind: "move"; from: Scope; to: Scope; id: string };

// Where a drag ended. Inside a column only the same kind (script or app) trades places;
// on the other column, over a row or its frame, the Action moves there and lands last of its
// kind. A column that cannot take drops (no workspace is open) refuses.
export function resolveDrop(
  lists: ScopedLists,
  available: Readonly<Record<Scope, boolean>>,
  activeId: string,
  overId: string,
): DropResult | null {
  const from = locateAction(lists, activeId);
  if (!from || activeId === overId) return null;
  const column = parseColumnDropId(overId);
  const over = column ? null : locateAction(lists, overId);
  const to = column ?? over?.scope;
  if (!to || !available[to]) return null;
  if (to !== from.scope) return { kind: "move", from: from.scope, to, id: activeId };
  if (!over || over.action.runInTerminal !== from.action.runInTerminal) return null;
  return { kind: "reorder", scope: to, fromId: activeId, toId: overId };
}

// Which droppables a drag may land on: the rows of its own column that share its kind, and
// everything in the other column (a row or the column frame), never its own frame.
export function isDropCandidate(lists: ScopedLists, containerId: string, activeId: string): boolean {
  const active = locateAction(lists, activeId);
  if (!active) return false;
  const column = parseColumnDropId(containerId);
  if (column) return column !== active.scope;
  const over = locateAction(lists, containerId);
  if (!over) return false;
  return over.scope !== active.scope || over.action.runInTerminal === active.action.runInTerminal;
}
