import { fuzzyMatchLower } from "@/modules/command-palette/lib/fuzzy";
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
  label: FolderRowLabel | null;
  branch: string | null;
  process: string | null;
  kind: TabEntry["kind"] | null;
  agent: string;
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
  /** Entry of the focused tab of the active workspace; any kind carrying a folder. */
  activeTabEntry: TabEntry | null;
  /** One entry per tab of every workspace; browser tabs carry no folder. */
  entries: readonly TabEntry[];
};

function rowOf(
  path: string,
  workspaceId: string,
  hibernated: boolean,
  over: Partial<FolderRow> = {},
): FolderRow {
  return {
    key: `${workspaceId}:${path}`,
    path,
    label: null,
    branch: null,
    process: null,
    kind: null,
    agent: "",
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

function tabRowsOf(entries: readonly TabEntry[], skip: Set<string>): FolderRow[] {
  const byRecency = [...entries].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  const rows: FolderRow[] = [];
  const seen = new Set(skip);
  for (const e of byRecency) {
    if (!e.cwd) continue;
    pushUnique(rows, seen, rowOf(e.cwd, e.workspaceId, e.hibernated, {
      branch: e.branch || null,
      process: e.process || null,
      kind: e.kind,
      agent: e.agent,
    }));
  }
  return rows;
}

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
  const activeWs = input.workspaces.find((w) => w.id === input.activeWorkspaceId);
  if (activeWs) {
    const rows: FolderRow[] = [];
    const seen = new Set<string>();
    const activeEntry = input.activeTabEntry;
    if (activeEntry?.cwd) {
      pushUnique(rows, seen, rowOf(activeEntry.cwd, activeWs.id, false, {
        label: "Current tab",
        branch: activeEntry.branch || null,
        process: activeEntry.process || null,
        kind: activeEntry.kind,
        agent: activeEntry.agent,
      }));
      const main = mainCheckoutOf(activeEntry.cwd);
      if (main) {
        pushUnique(rows, seen, rowOf(main, activeWs.id, false, { label: "Main checkout" }));
      }
    }
    const root = activeWs.workspaceRoot ?? activeWs.fsRoot ?? null;
    if (root) {
      pushUnique(rows, seen, rowOf(root, activeWs.id, false, { label: "Workspace root" }));
    }
    for (const row of tabRowsOf(byWorkspace.get(activeWs.id) ?? [], seen)) {
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
    const seen = new Set<string>();
    if (root) {
      pushUnique(rows, seen, rowOf(root, ws.id, !!ws.hibernated, { label: "Workspace root" }));
    }
    for (const row of tabRowsOf(byWorkspace.get(ws.id) ?? [], seen)) {
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

// Subsequence match against the path (fuzzyMatchLower), so typing a folder or
// worktree name keeps rows whose path carries it in order. No reordering: rows
// keep their group order, empty groups disappear.
export function filterFolderGroups(
  groups: readonly FolderGroup[],
  query: string,
): FolderGroupMatched[] {
  const lowerQuery = query.trim().toLowerCase();
  if (!lowerQuery) {
    return groups.map((g) => ({ ...g, rows: g.rows.map((r) => ({ ...r })) }));
  }
  const out: FolderGroupMatched[] = [];
  for (const g of groups) {
    const rows: FolderRowMatched[] = [];
    for (const r of g.rows) {
      const match = fuzzyMatchLower(lowerQuery, r.path.toLowerCase());
      if (!match) continue;
      rows.push({ ...r, indices: match.indices });
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
