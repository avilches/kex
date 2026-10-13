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

export function sanitizeWorkspaceSidebar(raw: unknown): WorkspaceSidebar | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const expanded = Array.isArray(r.expanded)
    ? [
        ...new Set(
          r.expanded.filter((p): p is string => typeof p === "string" && p.length > 0),
        ),
      ].slice(0, MAX_EXPANDED)
    : [];
  const sc = r.scroll as Record<string, unknown> | null | undefined;
  const scroll =
    sc &&
    typeof sc.root === "string" &&
    typeof sc.top === "number" &&
    Number.isFinite(sc.top) &&
    sc.top >= 0
      ? { root: sc.root, top: sc.top }
      : null;
  return {
    view: parseView(r.view),
    expanded,
    selectedPath: typeof r.selectedPath === "string" && r.selectedPath ? r.selectedPath : null,
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
