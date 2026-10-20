import { pathBasename } from "@/lib/pathUtils";
import type { Workspace } from "@/modules/workspaces/lib/types";
import type { ClosedTabRecord } from "@/modules/workspaces/lib/closedTabHistory";
import { RECENT_LIMIT } from "./tabRank";
import type { TabEntry } from "./tabEntries";

export type ClosedTabEntry = ClosedTabRecord & {
  key: string;
  title: string;
  detail: string;
  workspaceTitle: string;
  workspaceColor: string | null;
  workspaceIcon: string | null;
  hibernated: boolean;
};

// Closed rows are capped apart from live tabs so a long history cannot crowd them out.
export const CLOSED_SEARCH_LIMIT = 12;
export const CLOSED_RECENT_LIMIT = Math.min(RECENT_LIMIT, 6);

export const closedRowKey = (entry: Pick<ClosedTabRecord, "kind" | "path">) =>
  `closed:${entry.kind}:${entry.path}`;

function liveIdentity(entry: TabEntry): string | null {
  const path = entry.kind === "terminal" ? entry.cwd : entry.detail;
  if (!path) return null;
  return `${entry.kind === "terminal" ? "terminal" : "file"}\0${path}`;
}

function sortClosed(a: ClosedTabRecord, b: ClosedTabRecord): number {
  return b.uses - a.uses || b.lastUsedAt - a.lastUsedAt || b.closedAt - a.closedAt;
}

export function buildClosedTabEntries(
  records: readonly ClosedTabRecord[],
  workspaces: readonly Workspace[],
  liveTabs: readonly TabEntry[],
  workspaceTitle: (ws: Workspace) => string,
): ClosedTabEntry[] {
  const live = new Set(liveTabs.map(liveIdentity).filter(Boolean));
  const byId = new Map(workspaces.map((w) => [w.id, w]));
  const out: ClosedTabEntry[] = [];
  const seen = new Set<string>();
  for (const record of [...records].sort(sortClosed)) {
    const identity = `${record.kind}\0${record.path}`;
    if (live.has(identity) || seen.has(identity)) continue;
    seen.add(identity);
    const ws = byId.get(record.workspaceId);
    out.push({
      ...record,
      key: closedRowKey(record),
      title: pathBasename(record.path, { tolerateTrailingSlash: true }) || record.path,
      detail: record.path,
      workspaceTitle: ws ? workspaceTitle(ws) : "",
      workspaceColor: ws?.color ?? null,
      workspaceIcon: ws?.icon ?? null,
      hibernated: !!ws?.hibernated,
    });
  }
  return out;
}
