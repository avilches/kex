import type { TabEntry } from "@/modules/command-palette/lib/tabEntries";
import type { Workspace } from "@/modules/workspaces/lib/types";

// The repo root of a worktree path: the tree before its `.claude/worktrees/<name>` segment.
// Same convention the command palette uses (WORKTREE_RE in tabEntries.ts).
const MAIN_CHECKOUT_RE = /[\\/]\.claude[\\/]worktrees[\\/][^\\/]+/;

export function mainCheckoutOf(path: string): string | null {
  const match = MAIN_CHECKOUT_RE.exec(path);
  return match ? path.slice(0, match.index) : null;
}

export type FolderRowLabel = "Current tab" | "Main checkout" | "Workspace root";

export type FolderRow = {
  key: string;
  path: string;
  // Where the search starts in the path: right after the home prefix, so the
  // home segment can never match a query (typing "ser" no longer hits "Users").
  matchOffset: number;
  label: FolderRowLabel | null;
  branch: string | null;
  process: string | null;
  workspaceId: string;
  hibernated: boolean;
};

export type FolderGroup = {
  workspaceId: string;
  workspaceTitle: string;
  workspaceColor: string | null;
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
  activeWorkspaceId: string;
  home: string | null;
  /** Entry of the focused tab of the active workspace; any kind carrying a folder. */
  activeTabEntry: TabEntry | null;
  /** One entry per tab of every workspace; browser tabs carry no folder. */
  entries: readonly TabEntry[];
};

function matchOffsetOf(path: string, home: string | null): number {
  if (!home) return 0;
  const norm = path.replace(/\\/g, "/");
  const h = home.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!h) return 0;
  if (norm === h) return norm.length;
  return norm.startsWith(`${h}/`) ? h.length + 1 : 0;
}

function rowOf(
  path: string,
  workspaceId: string,
  hibernated: boolean,
  home: string | null,
  over: Partial<FolderRow> = {},
): FolderRow {
  return {
    key: `${workspaceId}:${path}`,
    path,
    matchOffset: matchOffsetOf(path, home),
    label: null,
    branch: null,
    process: null,
    workspaceId,
    hibernated,
    ...over,
  };
}

function pushUnique(rows: FolderRow[], seen: Set<string>, row: FolderRow) {
  if (seen.has(row.path)) return;
  seen.add(row.path);
  rows.push(row);
}

function tabRowsOf(
  entries: readonly TabEntry[],
  seen: Set<string>,
  home: string | null,
): FolderRow[] {
  const byRecency = [...entries].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  const rows: FolderRow[] = [];
  for (const e of byRecency) {
    if (!e.cwd) continue;
    pushUnique(rows, seen, rowOf(e.cwd, e.workspaceId, e.hibernated, home, {
      branch: e.branch || null,
      process: e.process || null,
    }));
  }
  return rows;
}

// One path appears once in the whole palette: the seen set is shared across
// groups, so a route shown in an earlier group never comes back in a later one,
// and a workspace whose rows were all taken is skipped.
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
  const home = input.home;

  const activeWs = input.workspaces.find((w) => w.id === input.activeWorkspaceId);
  if (activeWs) {
    const rows: FolderRow[] = [];
    const activeEntry = input.activeTabEntry;
    if (activeEntry?.cwd) {
      pushUnique(rows, seen, rowOf(activeEntry.cwd, activeWs.id, false, home, {
        label: "Current tab",
        branch: activeEntry.branch || null,
        process: activeEntry.process || null,
      }));
      const main = mainCheckoutOf(activeEntry.cwd);
      if (main) {
        pushUnique(rows, seen, rowOf(main, activeWs.id, false, home, { label: "Main checkout" }));
      }
    }
    const root = activeWs.workspaceRoot ?? activeWs.fsRoot ?? null;
    if (root) {
      pushUnique(rows, seen, rowOf(root, activeWs.id, false, home, { label: "Workspace root" }));
    }
    for (const row of tabRowsOf(byWorkspace.get(activeWs.id) ?? [], seen, home)) {
      rows.push(row);
    }
    groups.push({
      workspaceId: activeWs.id,
      workspaceTitle: activeWs.title,
      workspaceColor: activeWs.color ?? null,
      active: true,
      hibernated: !!activeWs.hibernated,
      rows,
    });
  }

  for (const ws of input.workspaces) {
    if (ws.id === input.activeWorkspaceId) continue;
    const rows: FolderRow[] = [];
    const root = ws.workspaceRoot ?? ws.fsRoot ?? null;
    if (root) {
      pushUnique(rows, seen, rowOf(root, ws.id, !!ws.hibernated, home, { label: "Workspace root" }));
    }
    for (const row of tabRowsOf(byWorkspace.get(ws.id) ?? [], seen, home)) {
      rows.push(row);
    }
    if (rows.length === 0) continue;
    groups.push({
      workspaceId: ws.id,
      workspaceTitle: ws.title,
      workspaceColor: ws.color ?? null,
      active: false,
      hibernated: !!ws.hibernated,
      rows,
    });
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
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return groups.map((g) => ({ ...g, rows: g.rows.map((r) => ({ ...r })) }));
  }
  const out: FolderGroupMatched[] = [];
  for (const g of groups) {
    const rows: FolderRowMatched[] = [];
    for (const r of g.rows) {
      const lower = r.path.toLowerCase();
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
      rows.push({ ...r, indices: indices.sort((a, b) => a - b) });
    }
    if (rows.length > 0) {
      out.push({ ...g, rows });
    }
  }
  return out;
}

export function folderRowNote(row: FolderRow): string {
  return [row.label, row.branch, row.process]
    .filter(Boolean)
    .join(" \u00b7 ");
}
