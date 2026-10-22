import { foldText } from "@/modules/command-palette/lib/fuzzy";
import type { TabEntry, WorkspaceEntry } from "@/modules/command-palette/lib/tabEntries";
import type { Workspace } from "@/modules/workspaces/lib/types";
import { resolveWorkspaceColor } from "@/modules/workspaces/lib/workspaceColor";

export type FolderRowLabel = "Current tab" | "Main checkout" | "Workspace Root" | "Home";

/** One checkout of a repository, as the worktree listing reports it. */
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
  // The main checkout of the repository the folder belongs to; the repository itself
  // until its worktree listing arrives; null outside a repository.
  repoKey: string | null;
  // Worktrees of its repository that are not in the list yet: Tab adds them.
  hiddenWorktrees: number;
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

// Indices of the characters that matched, per piece of text the row shows.
export type FolderRowMatched = FolderRow & {
  indices?: number[];
  branchIndices?: number[];
  labelIndices?: number[];
};

export type FolderGroupMatched = Omit<FolderGroup, "rows"> & {
  rows: FolderRowMatched[];
  titleIndices?: number[];
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
  /** Branch of a folder; empty when it is not a repository or the answer has not arrived yet. */
  branchOf: (dir: string) => string;
  /** Top level of the repository a folder is in; empty outside a repository or until the answer arrives. */
  repoOf: (dir: string) => string;
  /** Every checkout of each repository, keyed by the repository top level that was asked. */
  worktreesByRepo: ReadonlyMap<string, readonly RepoWorktree[]>;
  /** Repositories whose worktrees were added with Tab: repository key to the key of the row it was pressed on. */
  expansions: ReadonlyMap<string, string>;
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

function compare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

// Rows of one repository sit together, its main checkout first; repositories and
// folders otherwise in alphabetical order.
function byRepoThenPath(a: FolderRow, b: FolderRow): number {
  const isMain = (r: FolderRow) => Number(r.path !== r.repoKey);
  return (
    compare(a.repoKey ?? a.path, b.repoKey ?? b.path) ||
    isMain(a) - isMain(b) ||
    compare(a.path, b.path)
  );
}

type Builder = {
  input: FolderGroupsInput;
  seen: Set<string>;
  // Repository key of every top level asked, and every worktree of a repository by its key.
  keyOfRoot: Map<string, string>;
  worktreesOfKey: Map<string, readonly RepoWorktree[]>;
};

function builderOf(input: FolderGroupsInput): Builder {
  const keyOfRoot = new Map<string, string>();
  const worktreesOfKey = new Map<string, readonly RepoWorktree[]>();
  for (const [root, list] of input.worktreesByRepo) {
    const key = list.find((w) => w.isMain)?.path ?? root;
    keyOfRoot.set(root, key);
    if (!worktreesOfKey.has(key)) worktreesOfKey.set(key, list);
  }
  return { input, seen: new Set(), keyOfRoot, worktreesOfKey };
}

function repoKeyOf(b: Builder, path: string): string | null {
  const root = b.input.repoOf(path);
  if (!root) return null;
  return b.keyOfRoot.get(root) ?? root;
}

function rowOf(
  b: Builder,
  path: string,
  workspaceId: string,
  hibernated: boolean,
  label: FolderRowLabel | null,
  known?: { branch: string | null; repoKey: string },
): FolderRow {
  const { input } = b;
  const display = displayOf(path, input.home);
  return {
    key: `${workspaceId}:${path}`,
    path,
    display,
    displayShift: path.length - display.length,
    matchOffset: matchOffsetOf(path, input.home),
    label,
    branch: known ? known.branch : input.branchOf(path) || null,
    repoKey: known ? known.repoKey : repoKeyOf(b, path),
    hiddenWorktrees: 0,
    workspaceId,
    hibernated,
  };
}

function pushUnique(b: Builder, rows: FolderRow[], row: FolderRow) {
  if (b.seen.has(row.path)) return;
  b.seen.add(row.path);
  rows.push(row);
}

// The folders of the tabs: no repeats, no label, each repository together and alphabetical.
function tabRowsOf(b: Builder, entries: readonly TabEntry[]): FolderRow[] {
  const rows: FolderRow[] = [];
  for (const e of entries) {
    if (!e.cwd) continue;
    pushUnique(b, rows, rowOf(b, e.cwd, e.workspaceId, e.hibernated, null));
  }
  return rows.sort(byRepoThenPath);
}

// The worktrees of a repository that no row shows yet: its main checkout first, then the rest alphabetically.
function missingWorktrees(b: Builder, key: string): RepoWorktree[] {
  const missing = (b.worktreesOfKey.get(key) ?? []).filter((w) => !b.seen.has(w.path));
  return missing.sort((x, y) => Number(y.isMain) - Number(x.isMain) || compare(x.path, y.path));
}

// One path appears once in the whole palette: the seen set is shared across
// groups, so a folder shown in an earlier group never comes back in a later one,
// and a workspace whose rows were all taken is skipped.
// Order: the active workspace (current tab folder, home, workspace root, then its other
// folders), then every other workspace in position order (root, then folders). Worktrees
// of a repository are not listed until Tab asks for them on one of its rows.
export function buildFolderGroups(input: FolderGroupsInput): FolderGroup[] {
  const b = builderOf(input);
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
      pushUnique(b, rows, rowOf(b, cwd, activeWs.id, sleeping, "Current tab"));
    }
    const home = input.home?.replace(/[\\/]+$/, "");
    if (home) {
      pushUnique(b, rows, rowOf(b, home, activeWs.id, sleeping, "Home"));
    }
    const root = rootOf(activeWs);
    if (root) {
      pushUnique(b, rows, rowOf(b, root, activeWs.id, sleeping, "Workspace Root"));
    }
    rows.push(...tabRowsOf(b, byWorkspace.get(activeWs.id) ?? []));
    groups.push({ ...headOf(activeWs, true), rows });
  }

  for (const ws of input.workspaces) {
    if (ws.id === input.activeWorkspaceId) continue;
    const rows: FolderRow[] = [];
    const root = rootOf(ws);
    if (root) {
      pushUnique(b, rows, rowOf(b, root, ws.id, !!ws.hibernated, "Workspace Root"));
    }
    rows.push(...tabRowsOf(b, byWorkspace.get(ws.id) ?? []));
    if (rows.length === 0) continue;
    groups.push({ ...headOf(ws, false), rows });
  }

  // Tab pressed on a row: the worktrees missing from the list go right under it.
  for (const [key, afterRowKey] of input.expansions) {
    for (const g of groups) {
      const at = g.rows.findIndex((r) => r.key === afterRowKey);
      if (at < 0) continue;
      const added = missingWorktrees(b, key).map((w) =>
        rowOf(b, w.path, g.workspaceId, g.hibernated, w.isMain ? "Main checkout" : null, {
          branch: w.branch,
          repoKey: key,
        }),
      );
      for (const row of added) b.seen.add(row.path);
      g.rows.splice(at + 1, 0, ...added);
      break;
    }
  }

  for (const g of groups) {
    for (const row of g.rows) {
      if (row.repoKey) row.hiddenWorktrees = missingWorktrees(b, row.repoKey).length;
    }
  }
  return groups;
}

function runOf(at: number, length: number): number[] {
  return Array.from({ length }, (_, i) => at + i);
}

function merge(into: number[] | undefined, more: number[]): number[] {
  const out = into ?? [];
  for (const i of more) if (!out.includes(i)) out.push(i);
  return out;
}

// Every word typed must appear as a plain substring (case and accent insensitive) of something the
// row shows: its path (never inside the home prefix), its branch, its label (while the Tab hint
// is not taking its place) or the title of its workspace. The returned indices are the characters
// that matched, per piece of text, so each row shows why it is there. Groups keep their order,
// rows keep their order, groups left with no rows disappear.
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
    const title = foldText(g.workspaceTitle);
    let titleIndices: number[] | undefined;
    const rows: FolderRowMatched[] = [];
    for (const r of g.rows) {
      const path = foldText(r.path);
      const branch = foldText(r.branch ?? "");
      const label = r.hiddenWorktrees > 0 ? "" : foldText(r.label ?? "");
      let indices: number[] | undefined;
      let branchIndices: number[] | undefined;
      let labelIndices: number[] | undefined;
      let rowTitleIndices: number[] | undefined;
      let ok = true;
      for (const token of tokens) {
        const inPath = path.indexOf(token, r.matchOffset);
        const inBranch = branch.indexOf(token);
        const inLabel = label.indexOf(token);
        const inTitle = title.indexOf(token);
        if (inPath < 0 && inBranch < 0 && inLabel < 0 && inTitle < 0) {
          ok = false;
          break;
        }
        if (inPath >= 0) {
          indices = merge(indices, runOf(inPath, token.length).map((i) => i - r.displayShift));
        }
        if (inBranch >= 0) branchIndices = merge(branchIndices, runOf(inBranch, token.length));
        if (inLabel >= 0) labelIndices = merge(labelIndices, runOf(inLabel, token.length));
        if (inTitle >= 0) rowTitleIndices = merge(rowTitleIndices, runOf(inTitle, token.length));
      }
      if (!ok) continue;
      if (rowTitleIndices) titleIndices = merge(titleIndices, rowTitleIndices);
      const sort = (list: number[] | undefined) => list?.sort((a, b) => a - b);
      rows.push({
        ...r,
        indices: sort(indices),
        branchIndices: sort(branchIndices),
        labelIndices: sort(labelIndices),
      });
    }
    if (rows.length > 0) {
      out.push({ ...g, rows, titleIndices: titleIndices?.sort((a, b) => a - b) });
    }
  }
  return out;
}
