import { foldText } from "@/modules/command-palette/lib/fuzzy";
import type { TabEntry, WorkspaceEntry } from "@/modules/command-palette/lib/tabEntries";
import type { Workspace } from "@/modules/workspaces/lib/types";
import { resolveWorkspaceColor } from "@/modules/workspaces/lib/workspaceColor";

export type FolderRowLabel = "Current tab" | "Main checkout" | "Workspace Root" | "Home";

/** The fixed rows right after the current tab; each has its own shortcut, always the same one. */
export type FolderSlot = "root" | "main" | "home";

/** One checkout of a repository, as the worktree listing reports it. */
export type RepoWorktree = { path: string; branch: string | null; isMain: boolean };

/** What the new-tab shortcut does on a repository: add the worktrees that are not listed, or take the added ones away. */
export type RepoHint = { kind: "show"; count: number } | { kind: "hide" };

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
  // Everything the folder is, in order: a folder can be the current tab, the workspace root and home at once.
  labels: FolderRowLabel[];
  branch: string | null;
  // The main checkout of the repository the folder belongs to; the repository itself
  // until its worktree listing arrives; null outside a repository.
  repoKey: string | null;
  // Name of that repository, shown on the small heading of a group of its folders.
  repoName: string | null;
  // A fixed row (workspace root, main checkout, home) right after the current tab, outside any repository group.
  // The current tab never is one, even when it is also the workspace root: it stays first, under its repository.
  pinned: boolean;
  // Which fixed shortcuts pick it; empty for every other row.
  slots: FolderSlot[];
  // How many folders of its repository sit together in its workspace.
  cluster: number;
  // How many worktrees its repository has, main checkout included; 0 until the listing arrives.
  worktreeCount: number;
  // Its repository's worktree listing has not arrived yet.
  worktreesLoading: boolean;
  // Added with the new-tab shortcut: drawn nested under the repository's folders.
  nested: boolean;
  // Its repository group has a heading with the repository name above the first folder: two or
  // more folders together, or the repository of the current tab, which opens the list.
  headed: boolean;
  // What the new-tab shortcut does with the repository of this row; drawn on the row that has the focus,
  // or on the repository heading while the focus is elsewhere.
  repoHint: RepoHint | null;
  workspaceId: string;
};

export type FolderGroup = {
  workspaceId: string;
  workspaceTitle: string;
  workspaceColor: string | null;
  workspaceIcon: string | null;
  active: boolean;
  rows: FolderRow[];
};

// Indices of the characters that matched, per piece of text the row shows.
export type FolderRowMatched = FolderRow & {
  indices?: number[];
  branchIndices?: number[];
  // Per label, in the order of `labels`.
  labelIndices?: number[][];
  repoNameIndices?: number[];
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
  /** Repositories whose worktrees were added with Tab: repository key to the workspace they were added to. */
  expansions: ReadonlyMap<string, string>;
  /** A worktree that stays listed after its repository was collapsed: repository key to the workspace and path of the worktree. */
  kept: ReadonlyMap<string, { workspaceId: string; path: string }>;
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

function repoNameOf(repoKey: string | null): string | null {
  if (!repoKey) return null;
  return repoKey.split(/[\\/]/).filter(Boolean).pop() ?? repoKey;
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

type RowExtras = {
  branch: string | null;
  repoKey: string;
  pinned: boolean;
  nested: boolean;
  slot: FolderSlot;
};

function rowOf(
  b: Builder,
  path: string,
  workspaceId: string,
  label: FolderRowLabel | null,
  extras: Partial<RowExtras> = {},
): FolderRow {
  const { input } = b;
  const display = displayOf(path, input.home);
  const repoKey = extras.repoKey ?? repoKeyOf(b, path);
  return {
    key: `${workspaceId}:${path}`,
    path,
    display,
    displayShift: path.length - display.length,
    matchOffset: matchOffsetOf(path, input.home),
    labels: label ? [label] : [],
    branch: "branch" in extras ? (extras.branch ?? null) : input.branchOf(path) || null,
    repoKey,
    repoName: repoNameOf(repoKey),
    pinned: extras.pinned ?? false,
    slots: extras.slot ? [extras.slot] : [],
    cluster: 1,
    headed: false,
    worktreeCount: 0,
    worktreesLoading: false,
    nested: extras.nested ?? false,
    repoHint: null,
    workspaceId,
  };
}

function pushUnique(b: Builder, rows: FolderRow[], row: FolderRow) {
  if (b.seen.has(row.path)) return;
  b.seen.add(row.path);
  rows.push(row);
}

// The worktrees of a repository that no row shows yet: its main checkout first, then the rest alphabetically.
function missingWorktrees(b: Builder, key: string): RepoWorktree[] {
  const missing = (b.worktreesOfKey.get(key) ?? []).filter((w) => !b.seen.has(w.path));
  return missing.sort((x, y) => Number(y.isMain) - Number(x.isMain) || compare(x.path, y.path));
}

type RawGroup = {
  head: Omit<FolderGroup, "rows">;
  current: FolderRow | null;
  pinned: FolderRow[];
  root: FolderRow | null;
  loose: FolderRow[];
};

// Within a repository the current tab goes first, then the workspace root of another workspace, then its main
// checkout, then the rest by path, and the worktrees added with the new-tab shortcut last.
function inCluster(a: FolderRow, b: FolderRow): number {
  const rank = (r: FolderRow) =>
    r.nested
      ? 4
      : r.labels.includes("Current tab")
        ? 0
        : r.labels.includes("Workspace Root")
          ? 1
          : r.path === r.repoKey
            ? 2
            : 3;
  return rank(a) - rank(b) || compare(a.path, b.path);
}

// The workspace root first, then the loose folders by repository and path.
function restOf(raw: RawGroup): FolderRow[] {
  const loose = [...raw.loose].sort(
    (a, b) => compare(a.repoKey ?? a.path, b.repoKey ?? b.path) || compare(a.path, b.path),
  );
  return raw.root ? [raw.root, ...loose] : loose;
}

// Each repository gathers all its folders where its first one is.
function clusterRows(rest: readonly FolderRow[]): FolderRow[] {
  const clusters = new Map<string, FolderRow[]>();
  for (const row of rest) {
    const id = row.repoKey ?? `\u0000${row.path}`;
    const list = clusters.get(id);
    if (list) list.push(row);
    else clusters.set(id, [row]);
  }
  return [...clusters.values()].flatMap((rows) => rows.sort(inCluster));
}

function finalize(b: Builder, raw: RawGroup, addedHere: ReadonlySet<string>): FolderGroup {
  const rest = restOf(raw);
  const currentKey = raw.current?.repoKey ?? null;
  // The repository of the current tab opens the list, with the current tab first in it.
  const mine = raw.current
    ? [raw.current, ...rest.filter((r) => currentKey && r.repoKey === currentKey)].sort(inCluster)
    : [];
  const [first, ...mineRest] = mine;
  const others = clusterRows(
    currentKey ? rest.filter((r) => r.repoKey !== currentKey) : rest,
  );
  const clustered = [...mine, ...others];
  const size = new Map<string, number>();
  for (const row of clustered) {
    if (row.repoKey) size.set(row.repoKey, (size.get(row.repoKey) ?? 0) + 1);
  }
  const withHeading = new Set([...size].filter(([key, n]) => n >= 2 || key === currentKey).map(([key]) => key));
  const hintOf = (key: string): RepoHint | null => {
    const missing = missingWorktrees(b, key).length;
    if (missing > 0) return { kind: "show", count: missing };
    return addedHere.has(key) ? { kind: "hide" } : null;
  };
  for (const row of clustered) {
    if (!row.repoKey) continue;
    row.repoHint = hintOf(row.repoKey);
    const rows = size.get(row.repoKey) ?? 1;
    row.cluster = rows;
    row.headed = withHeading.has(row.repoKey);
    row.worktreeCount = b.worktreesOfKey.get(row.repoKey)?.length ?? 0;
    row.worktreesLoading = !b.worktreesOfKey.has(row.repoKey);
  }
  // The heading goes once, right above the first folder of the repository after the fixed rows; the
  // current tab carries it only when the repository has nothing else to show.
  if (first && mineRest.length > 0) first.headed = false;
  for (const row of raw.pinned) {
    if (!row.repoKey) continue;
    row.repoHint = hintOf(row.repoKey);
  }
  return { ...raw.head, rows: [...(first ? [first] : []), ...raw.pinned, ...mineRest, ...others] };
}

// One path appears once in the whole palette: the seen set is shared across
// groups, so a folder shown in an earlier group never comes back in a later one,
// and a workspace whose rows were all taken is skipped.
// Order: the active workspace (the current tab, then the fixed rows: workspace root, main checkout of
// the current tab's repository and home, each with its own shortcut and shown even when another row
// repeats its path, then the other folders of the current tab's repository and the rest), then every other
// workspace in position order. The folders of one repository sit together under a small heading with its
// name, its main checkout first.
// Worktrees are not listed until the new-tab shortcut asks for them on a row of their repository.
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

  const identity = new Map(input.workspaceEntries.map((e) => [e.workspaceId, e] as const));
  const headOf = (ws: Workspace, active: boolean) => {
    const e = identity.get(ws.id);
    return {
      workspaceId: ws.id,
      workspaceTitle: e?.title ?? ws.title,
      workspaceColor: e ? e.color : resolveWorkspaceColor(ws.color, ws.id),
      workspaceIcon: e?.icon ?? ws.icon ?? null,
      active,
    };
  };
  const rootOf = (ws: Workspace) => ws.workspaceRoot ?? ws.fsRoot ?? null;
  const looseOf = (ws: Workspace): FolderRow[] => {
    const rows: FolderRow[] = [];
    for (const e of byWorkspace.get(ws.id) ?? []) {
      pushUnique(b, rows, rowOf(b, e.cwd, e.workspaceId, null));
    }
    return rows;
  };

  const raws: RawGroup[] = [];
  const activeWs = input.workspaces.find((w) => w.id === input.activeWorkspaceId);
  if (activeWs) {
    const pinned: FolderRow[] = [];
    const currentRows: FolderRow[] = [];
    const cwd = input.activeTabEntry?.cwd;
    if (cwd) {
      pushUnique(b, currentRows, rowOf(b, cwd, activeWs.id, "Current tab"));
    }
    // A folder that is several of these at once is one row carrying all its labels and keys.
    const addFixed = (
      path: string,
      label: FolderRowLabel,
      slot: FolderSlot,
      extras: Partial<RowExtras> = {},
    ) => {
      const same = [...currentRows, ...pinned].find((r) => r.path === path);
      if (!same) {
        pinned.push(rowOf(b, path, activeWs.id, label, { pinned: true, slot, ...extras }));
        return;
      }
      same.labels.push(label);
      same.slots.push(slot);
      if ("branch" in extras) same.branch = extras.branch ?? null;
    };
    const rootPath = rootOf(activeWs);
    if (rootPath) addFixed(rootPath, "Workspace Root", "root");
    const currentRepo = currentRows[0]?.repoKey;
    const mainCheckout = currentRepo
      ? b.worktreesOfKey.get(currentRepo)?.find((w) => w.isMain)
      : undefined;
    if (currentRepo && mainCheckout) {
      addFixed(mainCheckout.path, "Main checkout", "main", {
        branch: mainCheckout.branch,
        repoKey: currentRepo,
      });
    }
    const home = input.home?.replace(/[\\/]+$/, "");
    if (home) addFixed(home, "Home", "home");
    for (const row of pinned) b.seen.add(row.path);
    raws.push({
      head: headOf(activeWs, true),
      current: currentRows[0] ?? null,
      pinned,
      root: null,
      loose: looseOf(activeWs),
    });
  }
  for (const ws of input.workspaces) {
    if (ws.id === input.activeWorkspaceId) continue;
    const rootPath = rootOf(ws);
    const rootRows: FolderRow[] = [];
    if (rootPath) {
      pushUnique(b, rootRows, rowOf(b, rootPath, ws.id, "Workspace Root"));
    }
    const loose = looseOf(ws);
    if (rootRows.length + loose.length === 0) continue;
    raws.push({ head: headOf(ws, false), current: null, pinned: [], root: rootRows[0] ?? null, loose });
  }

  // Tab pressed on a repository: the worktrees missing from the list join the folders of the workspace it was pressed in.
  // A collapsed repository still lists the one worktree that had the focus when it was collapsed.
  const addedIn = new Map<string, Set<string>>();
  const addNested = (key: string, workspaceId: string, only: string | null) => {
    const raw = raws.find((g) => g.head.workspaceId === workspaceId);
    if (!raw) return null;
    const added = missingWorktrees(b, key)
      .filter((w) => only === null || w.path === only)
      .map((w) =>
        rowOf(b, w.path, workspaceId, w.isMain ? "Main checkout" : null, {
          branch: w.branch,
          repoKey: key,
          nested: true,
        }),
      );
    for (const row of added) b.seen.add(row.path);
    raw.loose.push(...added);
    return added.length;
  };
  for (const [key, workspaceId] of input.expansions) {
    if (!addNested(key, workspaceId, null)) continue;
    const keys = addedIn.get(workspaceId) ?? new Set<string>();
    keys.add(key);
    addedIn.set(workspaceId, keys);
  }
  for (const [key, { workspaceId, path }] of input.kept) {
    if (!input.expansions.has(key)) addNested(key, workspaceId, path);
  }

  return raws.map((raw) => finalize(b, raw, addedIn.get(raw.head.workspaceId) ?? new Set()));
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
// row shows: its path (never inside the home prefix), its branch, its label, the name of its
// repository or the title of its workspace. The returned indices are the characters that matched,
// per piece of text, so each row shows why it is there. Groups keep their order, rows keep
// their order, groups left with no rows disappear.
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
      const labels = r.labels.map((l) => foldText(l));
      const repoName = r.headed ? foldText(r.repoName ?? "") : "";
      let indices: number[] | undefined;
      let branchIndices: number[] | undefined;
      let labelIndices: number[][] | undefined;
      let repoNameIndices: number[] | undefined;
      let rowTitleIndices: number[] | undefined;
      let ok = true;
      for (const token of tokens) {
        const inPath = path.indexOf(token, r.matchOffset);
        const inBranch = branch.indexOf(token);
        const inLabel = labels.map((l) => l.indexOf(token));
        const inRepo = repoName.indexOf(token);
        const inTitle = title.indexOf(token);
        if (inPath < 0 && inBranch < 0 && inLabel.every((i) => i < 0) && inRepo < 0 && inTitle < 0) {
          ok = false;
          break;
        }
        if (inPath >= 0) {
          indices = merge(indices, runOf(inPath, token.length).map((i) => i - r.displayShift));
        }
        if (inBranch >= 0) branchIndices = merge(branchIndices, runOf(inBranch, token.length));
        inLabel.forEach((at, i) => {
          if (at < 0) return;
          labelIndices ??= labels.map(() => []);
          labelIndices[i] = merge(labelIndices[i], runOf(at, token.length));
        });
        if (inRepo >= 0) repoNameIndices = merge(repoNameIndices, runOf(inRepo, token.length));
        if (inTitle >= 0) rowTitleIndices = merge(rowTitleIndices, runOf(inTitle, token.length));
      }
      if (!ok) continue;
      if (rowTitleIndices) titleIndices = merge(titleIndices, rowTitleIndices);
      const sort = (list: number[] | undefined) => list?.sort((a, b) => a - b);
      rows.push({
        ...r,
        indices: sort(indices),
        branchIndices: sort(branchIndices),
        labelIndices: labelIndices?.map((list) => list.sort((a, b) => a - b)),
        repoNameIndices: sort(repoNameIndices),
      });
    }
    if (rows.length > 0) {
      out.push({ ...g, rows, titleIndices: titleIndices?.sort((a, b) => a - b) });
    }
  }
  return out;
}
