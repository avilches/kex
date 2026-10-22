import { foldText } from "@/modules/command-palette/lib/fuzzy";
import type { TabEntry, WorkspaceEntry } from "@/modules/command-palette/lib/tabEntries";
import type { Workspace } from "@/modules/workspaces/lib/types";
import { resolveWorkspaceColor } from "@/modules/workspaces/lib/workspaceColor";

export type FolderRowLabel = "Current tab" | "Main checkout" | "Workspace Root" | "Home";

/** A checkout of the repository the current tab is in, as the worktree listing reports it. */
export type RepoWorktree = { path: string; branch: string | null; isMain: boolean };

export type FolderRow = {
  key: string;
  path: string;
  // The path as shown: the home prefix collapsed to "~".
  display: string;
  // How many characters shorter `display` is than `path`; match indices shift by it.
  displayShift: number;
  // Where the search starts in the path: right after the home prefix, so the
  // home segment can never match a query (typing "ser" no longer hits "Users").
  matchOffset: number;
  label: FolderRowLabel | null;
  branch: string | null;
  workspaceId: string;
  hibernated: boolean;
};

export type FolderGroup = {
  workspaceId: string;
  workspaceTitle: string;
  workspaceColor: string | null;
  workspaceIcon: string | null;
  active: boolean;
  hibernated: boolean;
  rows: FolderRow[];
};

export type FolderRowMatched = FolderRow & { indices?: number[] };

export type FolderGroupMatched = Omit<FolderGroup, "rows"> & {
  rows: FolderRowMatched[];
};

export type FolderGroupsInput = {
  workspaces: readonly Workspace[];
  /** Resolved identity of each workspace: its title template already expanded, as the WorkspaceBar shows it. */
  workspaceEntries: readonly WorkspaceEntry[];
  activeWorkspaceId: string;
  home: string | null;
  /** Entry of the focused tab of the active workspace; any kind carrying a folder. */
  activeTabEntry: TabEntry | null;
  /** One entry per tab of every workspace; browser tabs carry no folder. */
  entries: readonly TabEntry[];
  /** Every checkout of the repository the current tab is in; empty outside a repository or until the answer arrives. */
  worktrees: readonly RepoWorktree[];
  /** Branch of a folder; empty when it is not a repository or the answer has not arrived yet. */
  branchOf: (dir: string) => string;
};

function matchOffsetOf(path: string, home: string | null): number {
  if (!home) return 0;
  const norm = path.replace(/\\/g, "/");
  const h = home.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!h) return 0;
  if (norm === h) return norm.length;
  return norm.startsWith(`${h}/`) ? h.length + 1 : 0;
}

function displayOf(path: string, home: string | null): string {
  if (!home) return path;
  const norm = path.replace(/\\/g, "/");
  const h = home.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!h) return path;
  if (norm === h) return "~";
  return norm.startsWith(`${h}/`) ? `~${path.slice(h.length)}` : path;
}

function rowOf(
  path: string,
  workspaceId: string,
  hibernated: boolean,
  input: FolderGroupsInput,
  label: FolderRowLabel | null,
  branch: string | null = input.branchOf(path) || null,
): FolderRow {
  const display = displayOf(path, input.home);
  return {
    key: `${workspaceId}:${path}`,
    path,
    display,
    displayShift: path.length - display.length,
    matchOffset: matchOffsetOf(path, input.home),
    label,
    branch,
    workspaceId,
    hibernated,
  };
}

function pushUnique(rows: FolderRow[], seen: Set<string>, row: FolderRow) {
  if (seen.has(row.path)) return;
  seen.add(row.path);
  rows.push(row);
}

function byPath(a: FolderRow, b: FolderRow): number {
  return a.path.localeCompare(b.path, undefined, { sensitivity: "base" });
}

// The folders of the tabs: alphabetical, no repeats, no label.
function tabRowsOf(
  entries: readonly TabEntry[],
  seen: Set<string>,
  input: FolderGroupsInput,
): FolderRow[] {
  const rows: FolderRow[] = [];
  for (const e of entries) {
    if (!e.cwd) continue;
    pushUnique(rows, seen, rowOf(e.cwd, e.workspaceId, e.hibernated, input, null));
  }
  return rows.sort(byPath);
}

// One path appears once in the whole palette: the seen set is shared across
// groups, so a folder shown in an earlier group never comes back in a later one,
// and a workspace whose rows were all taken is skipped.
// Order: the active workspace (current tab folder, main checkout and its worktrees,
// workspace root, home, then its other folders), then every other workspace in position order (root, then folders).
export function buildFolderGroups(input: FolderGroupsInput): FolderGroup[] {
  const byWorkspace = new Map<string, TabEntry[]>();
  for (const e of input.entries) {
    if (!e.cwd) continue;
    let list = byWorkspace.get(e.workspaceId);
    if (!list) {
      list = [];
      byWorkspace.set(e.workspaceId, list);
    }
    list.push(e);
  }

  const groups: FolderGroup[] = [];
  const seen = new Set<string>();
  const identity = new Map(input.workspaceEntries.map((e) => [e.workspaceId, e] as const));
  const headOf = (ws: Workspace, active: boolean) => {
    const e = identity.get(ws.id);
    return {
      workspaceId: ws.id,
      workspaceTitle: e?.title ?? ws.title,
      workspaceColor: e ? e.color : resolveWorkspaceColor(ws.color, ws.id),
      workspaceIcon: e?.icon ?? ws.icon ?? null,
      active,
      hibernated: !!ws.hibernated,
    };
  };
  const rootOf = (ws: Workspace) => ws.workspaceRoot ?? ws.fsRoot ?? null;

  const activeWs = input.workspaces.find((w) => w.id === input.activeWorkspaceId);
  if (activeWs) {
    const rows: FolderRow[] = [];
    const sleeping = !!activeWs.hibernated;
    const cwd = input.activeTabEntry?.cwd;
    if (cwd) {
      pushUnique(rows, seen, rowOf(cwd, activeWs.id, sleeping, input, "Current tab"));
    }
    // The main checkout right under the current tab, then the other worktrees alphabetically.
    const main = input.worktrees.find((w) => w.isMain);
    if (main) {
      pushUnique(rows, seen, rowOf(main.path, activeWs.id, sleeping, input, "Main checkout", main.branch));
    }
    const linked = input.worktrees
      .filter((w) => !w.isMain)
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" }));
    for (const w of linked) {
      pushUnique(rows, seen, rowOf(w.path, activeWs.id, sleeping, input, null, w.branch));
    }
    const root = rootOf(activeWs);
    if (root) {
      pushUnique(rows, seen, rowOf(root, activeWs.id, sleeping, input, "Workspace Root"));
    }
    const home = input.home?.replace(/[\\/]+$/, "");
    if (home) {
      pushUnique(rows, seen, rowOf(home, activeWs.id, sleeping, input, "Home"));
    }
    rows.push(...tabRowsOf(byWorkspace.get(activeWs.id) ?? [], seen, input));
    groups.push({ ...headOf(activeWs, true), rows });
  }

  for (const ws of input.workspaces) {
    if (ws.id === input.activeWorkspaceId) continue;
    const rows: FolderRow[] = [];
    const root = rootOf(ws);
    if (root) {
      pushUnique(rows, seen, rowOf(root, ws.id, !!ws.hibernated, input, "Workspace Root"));
    }
    rows.push(...tabRowsOf(byWorkspace.get(ws.id) ?? [], seen, input));
    if (rows.length === 0) continue;
    groups.push({ ...headOf(ws, false), rows });
  }
  return groups;
}

// Every word typed must appear as a plain substring of the path (case
// insensitive); the returned indices are the characters that matched, so each
// row shows why it is there. Groups keep their order, rows keep their order,
// groups left with no rows disappear.
export function filterFolderGroups(
  groups: readonly FolderGroup[],
  query: string,
): FolderGroupMatched[] {
  const tokens = foldText(query.trim()).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return groups.map((g) => ({ ...g, rows: g.rows.map((r) => ({ ...r })) }));
  }
  const out: FolderGroupMatched[] = [];
  for (const g of groups) {
    const rows: FolderRowMatched[] = [];
    for (const r of g.rows) {
      const lower = foldText(r.path);
      const indices: number[] = [];
      let ok = true;
      for (const token of tokens) {
        const at = lower.indexOf(token, r.matchOffset);
        if (at < 0) {
          ok = false;
          break;
        }
        for (let i = at; i < at + token.length; i++) {
          if (!indices.includes(i)) indices.push(i);
        }
      }
      if (!ok) continue;
      rows.push({
        ...r,
        indices: indices.map((i) => i - r.displayShift).sort((a, b) => a - b),
      });
    }
    if (rows.length > 0) {
      out.push({ ...g, rows });
    }
  }
  return out;
}
