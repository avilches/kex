import { ancestorsToExpand, isUnder } from "./explorerRoot";
import { parseView, type SidebarView } from "./sidebarState";
import type { Workspace } from "./types";

export type SidebarScroll = { root: string; top: number };

export type ExplorerSnapshot = {
  expanded: string[];
  selectedPath: string | null;
  scroll: SidebarScroll | null;
};

export type WorkspaceSidebar = ExplorerSnapshot & { view: SidebarView };

export const DEFAULT_WORKSPACE_SIDEBAR: WorkspaceSidebar = {
  view: "explorer",
  expanded: [],
  selectedPath: null,
  scroll: null,
};

export type RestoredExplorer = {
  expanded: string[];
  selectedPath: string | null;
  scrollTop: number;
};

const MAX_EXPANDED = 500;

// The explorer only works with absolute paths; a relative or `..` path read
// from disk could point outside every root it would be compared against.
function isSafeAbsolutePath(p: unknown): p is string {
  if (typeof p !== "string") return false;
  if (!p.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(p)) return false;
  return !p.split(/[\\/]/).includes("..");
}

export function sanitizeWorkspaceSidebar(raw: unknown): WorkspaceSidebar | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const expanded = Array.isArray(r.expanded)
    ? [...new Set(r.expanded.filter(isSafeAbsolutePath))].slice(0, MAX_EXPANDED)
    : [];
  const sc = r.scroll as Record<string, unknown> | null | undefined;
  const scroll =
    sc &&
    isSafeAbsolutePath(sc.root) &&
    typeof sc.top === "number" &&
    Number.isFinite(sc.top) &&
    sc.top >= 0
      ? { root: sc.root, top: sc.top }
      : null;
  return {
    view: parseView(r.view),
    expanded,
    selectedPath: isSafeAbsolutePath(r.selectedPath) ? r.selectedPath : null,
    scroll,
  };
}

export function restoreExplorerSnapshot(
  snapshot: ExplorerSnapshot | null | undefined,
  root: string,
): RestoredExplorer {
  if (!snapshot) return { expanded: [], selectedPath: null, scrollTop: 0 };
  const open = new Set<string>();
  const openWithParents = (path: string, isDir: boolean) => {
    const probe = isDir ? `${path.replace(/\/$/, "")}/_` : path;
    for (const dir of ancestorsToExpand(root, probe)) open.add(dir);
  };
  for (const p of snapshot.expanded) {
    if (p !== root && isUnder(p, root)) openWithParents(p, true);
  }
  const selected =
    snapshot.selectedPath && snapshot.selectedPath !== root && isUnder(snapshot.selectedPath, root)
      ? snapshot.selectedPath
      : null;
  if (selected) openWithParents(selected, false);
  const scrollTop = snapshot.scroll && snapshot.scroll.root === root ? snapshot.scroll.top : 0;
  return { expanded: [...open], selectedPath: selected, scrollTop };
}

// The previous root is never in its own open set, so it is added here: going
// up must leave the folder we came from open. If it no longer exists on disk
// (the root was deleted and we climbed to an ancestor), it and everything
// under it is dropped instead.
export function carryOverExpanded(
  expanded: Iterable<string>,
  previousRoot: string | null,
  root: string,
  previousRootGone = false,
): string[] {
  const kept = previousRoot && previousRootGone
    ? [...expanded].filter((p) => !isUnder(p, previousRoot))
    : [...expanded];
  const paths = previousRoot && !previousRootGone ? [previousRoot, ...kept] : kept;
  return restoreExplorerSnapshot({ expanded: paths, selectedPath: null, scroll: null }, root)
    .expanded;
}

export type InitialRestore = { snapshot: ExplorerSnapshot | null; root: string | null };

// The mount snapshot applies to the first root the explorer shows and never again:
// a root that goes through "none" (A, none, A) or changes is a mid-session change.
export function stepInitialRestore(
  state: InitialRestore,
  rootPath: string | null,
): { state: InitialRestore; useInitial: boolean } {
  if (!rootPath) {
    return {
      state: state.root !== null ? { snapshot: null, root: null } : state,
      useInitial: false,
    };
  }
  if (state.snapshot && (state.root ?? rootPath) === rootPath) {
    return { state: { snapshot: state.snapshot, root: rootPath }, useInitial: true };
  }
  return { state: { snapshot: null, root: null }, useInitial: false };
}

export function applySidebarView(
  workspaces: Workspace[],
  id: string,
  view: SidebarView,
): Workspace[] {
  const target = workspaces.find((w) => w.id === id);
  if (!target || (target.sidebar?.view ?? DEFAULT_WORKSPACE_SIDEBAR.view) === view) {
    return workspaces;
  }
  return workspaces.map((w) =>
    w === target
      ? { ...w, sidebar: { ...(w.sidebar ?? DEFAULT_WORKSPACE_SIDEBAR), view } }
      : w,
  );
}

function sameExplorer(a: ExplorerSnapshot, b: ExplorerSnapshot): boolean {
  return (
    a.selectedPath === b.selectedPath &&
    a.scroll?.root === b.scroll?.root &&
    a.scroll?.top === b.scroll?.top &&
    a.expanded.length === b.expanded.length &&
    a.expanded.every((p, i) => p === b.expanded[i])
  );
}

// Every explorer mount reports a snapshot that usually equals the stored one;
// returning the same array spares a re-render and a workspace save.
export function applyExplorerSnapshots(
  workspaces: Workspace[],
  batch: Map<string, ExplorerSnapshot>,
): Workspace[] {
  let changed = false;
  const next = workspaces.map((w) => {
    const snap = batch.get(w.id);
    if (!snap || (w.sidebar && sameExplorer(w.sidebar, snap))) return w;
    changed = true;
    return { ...w, sidebar: { ...(w.sidebar ?? DEFAULT_WORKSPACE_SIDEBAR), ...snap } };
  });
  return changed ? next : workspaces;
}
