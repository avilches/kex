import { splitActionName } from "@/modules/actions/lib/actionName";
import type { BarItem } from "@/modules/actions/lib/actionsBar";
import type { PaletteItem } from "../types";
import {
  CLOSED_RECENT_LIMIT,
  CLOSED_SEARCH_LIMIT,
  type ClosedTabEntry,
} from "./closedEntries";
import { foldText, fuzzyMatchLower, passesQuality } from "./fuzzy";
import { type LearnedMap, learnedBoost } from "./learned";
import { mruRank } from "./mru";
import { buildSearchBlobs, commandRowKey } from "./rankCommands";
import type { TabEntry, WorkspaceEntry } from "./tabEntries";
import {
  byRecency,
  byRecentList,
  RECENT_LIMIT,
  SEARCH_LIMIT,
  tabRowKey,
  workspaceRowKey,
} from "./tabRank";

export type MergedRow =
  | {
      kind: "command";
      key: string;
      item: PaletteItem;
      highlight?: RowHighlight;
    }
  | { kind: "action"; key: string; item: BarItem; highlight?: RowHighlight }
  | {
      kind: "tab";
      key: string;
      entry: TabEntry;
      highlight?: RowHighlight;
      // The tab the user is in right now: always the first row, under its own heading.
      current?: boolean;
    }
  | {
      kind: "workspace";
      key: string;
      entry: WorkspaceEntry;
      highlight?: RowHighlight;
    }
  | {
      kind: "closed";
      key: string;
      entry: ClosedTabEntry;
      highlight?: RowHighlight;
    };

// Which display slot the highlighted characters belong to, so an item applies them to the right span:
// "title" is the row's first line, "workspace" the workspace name on the right and "detail" the
// second line of a closed row.
export type RowHighlight = {
  field: "title" | "workspace" | "detail";
  indices: number[];
};

export type MergeInput = {
  commands: PaletteItem[];
  /** The workspace and global Actions the Header would offer right now, runnable ones only. */
  actions?: BarItem[];
  tabs: TabEntry[];
  workspaces: WorkspaceEntry[];
  closed?: ClosedTabEntry[];
  term: string;
  activeTabId: string | null;
  /** Workspace the user is in; the idle list offers every other one so the palette can jump to it. */
  activeWorkspaceId?: string | null;
  learned: LearnedMap;
  mru: Record<string, number>;
};

// Commands, workspaces and the title of a tab all score with the same fuzzy function, so
// their points compare directly. The other tab fields match by substring and carry no such
// points: they sit below every fuzzy hit, one step per field class.
const TIER_STEP = 1000;
const SUBSTRING_BASE = -TIER_STEP;
// An action whose letters only match scattered ("Toggle full pane" for "top") must not push a tab
// found by its process, branch or location down the list: it drops below every tab tier.
const SCATTERED_PENALTY = 5 * TIER_STEP;

type Hit = { points: number; indices: number[] };

function asHighlight(
  hit: Hit,
  field: RowHighlight["field"],
): RowHighlight | undefined {
  return hit.indices.length > 0 ? { field, indices: hit.indices } : undefined;
}

function substringHit(query: string, field: string): Hit | null {
  if (!field) return null;
  const i = foldText(field).indexOf(query);
  if (i < 0) return null;
  const indices = Array.from({ length: query.length }, (_, k) => i + k);
  return { points: 1 - i / (field.length + 1), indices };
}

function fuzzyHit(query: string, field: string): Hit | null {
  const m = fuzzyMatchLower(query, field);
  if (m === null || !passesQuality(query.length, m.score)) return null;
  return { points: m.score, indices: m.indices };
}

type FieldScored = { points: number; highlight?: RowHighlight };

function tabPoints(e: TabEntry, q: string): FieldScored | null {
  const title = fuzzyHit(q, e.title);
  if (title !== null)
    return { points: title.points, highlight: asHighlight(title, "title") };
  const note = substringHit(q, e.note ?? "");
  if (note !== null) return { points: SUBSTRING_BASE + note.points };
  const workspace = fuzzyHit(q, e.workspaceTitle);
  if (workspace !== null)
    return {
      points: SUBSTRING_BASE - TIER_STEP + workspace.points / 100,
      highlight: asHighlight(workspace, "workspace"),
    };
  const location = Math.max(
    substringHit(q, e.cwd)?.points ?? -1,
    substringHit(q, e.worktree)?.points ?? -1,
    substringHit(q, e.branch)?.points ?? -1,
  );
  if (location >= 0)
    return { points: SUBSTRING_BASE - 2 * TIER_STEP + location };
  const process = substringHit(q, e.process);
  if (process !== null)
    return { points: SUBSTRING_BASE - 3 * TIER_STEP + process.points };
  return null;
}

function commandHit(
  blob: string[],
  q: string,
): (Hit & { field: number }) | null {
  let top: (Hit & { field: number }) | null = null;
  blob.forEach((field, i) => {
    const h = fuzzyHit(q, field);
    if (h !== null && (top === null || h.points > top.points))
      top = { ...h, field: i };
  });
  return top;
}

// An Action is found by the name it shows, by the value its template expands to or the folder a
// script starts in (the line under the name), or by both read together ("pycharm hub").
function actionPoints(item: BarItem, q: string): FieldScored | null {
  const { main } = splitActionName(item.name);
  const title = fuzzyHit(q, main);
  if (title !== null)
    return { points: title.points, highlight: asHighlight(title, "title") };
  const subtitle = item.subtitle ?? "";
  const detail = substringHit(q, subtitle);
  if (detail !== null)
    return {
      points: SUBSTRING_BASE + detail.points,
      highlight: asHighlight(detail, "detail"),
    };
  const expanded = subtitle ? fuzzyHit(q, `${main} ${subtitle}`) : null;
  if (expanded !== null)
    return { points: SUBSTRING_BASE - TIER_STEP + expanded.points };
  return null;
}

// Every reopen counts, and counting outranks the tier of the field that matched: a folder the
// user returns to twenty times should beat a live tab found by a scattered title match, which
// is the whole point of keeping the history. It still sits below a precise live title hit
// until it has real use behind it.
function closedPoints(entry: ClosedTabEntry, q: string): FieldScored | null {
  let best: Hit | null = null;
  let field: RowHighlight["field"] = "title";
  const title = fuzzyHit(q, entry.title);
  if (title !== null) best = title;
  const detail = substringHit(q, entry.detail);
  if (detail !== null) {
    const candidate = SUBSTRING_BASE - TIER_STEP + detail.points;
    if (best === null || candidate > best.points) {
      best = { ...detail, points: candidate };
      field = "detail";
    }
  }
  const workspace = fuzzyHit(q, entry.workspaceTitle);
  if (workspace !== null) {
    const candidate = SUBSTRING_BASE - 2 * TIER_STEP + workspace.points / 100;
    if (best === null || candidate > best.points) {
      best = { ...workspace, points: candidate };
      field = "workspace";
    }
  }
  if (best === null) return null;
  return {
    points: best.points + entry.uses * TIER_STEP,
    highlight: asHighlight(best, field),
  };
}

export const actionRowKey = (id: string): string => `act:${id}`;

export function mergeRows(input: MergeInput): MergedRow[] {
  const { commands, tabs, workspaces, activeTabId, learned, mru } = input;
  const userActions = input.actions ?? [];
  const closed = input.closed ?? [];
  const q = foldText(input.term.trim());

  if (!q) {
    const currentEntry = tabs.find((t) => t.tabId === activeTabId);
    const current: MergedRow[] = currentEntry
      ? [
          {
            kind: "tab",
            key: tabRowKey(currentEntry.tabId),
            entry: currentEntry,
            current: true,
          },
        ]
      : [];
    const recents = tabs
      .filter((t) => t.tabId !== activeTabId)
      .sort(byRecentList)
      .slice(0, RECENT_LIMIT)
      .map(
        (entry): MergedRow => ({
          kind: "tab",
          key: tabRowKey(entry.tabId),
          entry,
        }),
      );
    const recentlyClosed = closed
      .slice(0, CLOSED_RECENT_LIMIT)
      .map((entry): MergedRow => ({ kind: "closed", key: entry.key, entry }));
    const userRows = userActions.map(
      (item): MergedRow => ({ kind: "action", key: actionRowKey(item.id), item }),
    );
    const actions = [...commands]
      .sort((a, b) => mruRank(mru, b.id) - mruRank(mru, a.id))
      .map(
        (item): MergedRow => ({
          kind: "command",
          key: commandRowKey(item.id),
          item,
        }),
      );
    const otherWorkspaces = workspaces
      .filter((w) => w.workspaceId !== input.activeWorkspaceId)
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .map(
        (entry): MergedRow => ({
          kind: "workspace",
          key: workspaceRowKey(entry.workspaceId),
          entry,
        }),
      );
    return [
      ...current,
      ...recents,
      ...otherWorkspaces, ...recentlyClosed, ...userRows, ...actions];
  }

  const scored: { row: MergedRow; points: number; recency: TabEntry | null }[] =
    [];
  const blobs = buildSearchBlobs(commands);
  commands.forEach((item, i) => {
    const hit = commandHit(blobs[i], q);
    if (hit === null) return;
    const p = blobs[i].some((f) => foldText(f).includes(q))
      ? hit.points
      : hit.points - SCATTERED_PENALTY;
    const key = commandRowKey(item.id);
    scored.push({
      row: {
        kind: "command",
        key,
        item,
        highlight: hit.field === 0 ? asHighlight(hit, "title") : undefined,
      },
      points: p + learnedBoost(learned, q, key),
      recency: null,
    });
  });
  for (const item of userActions) {
    const r = actionPoints(item, q);
    if (r === null) continue;
    const key = actionRowKey(item.id);
    scored.push({
      row: { kind: "action", key, item, highlight: r.highlight },
      points: r.points + learnedBoost(learned, q, key),
      recency: null,
    });
  }
  for (const entry of tabs) {
    const r = tabPoints(entry, q);
    if (r === null) continue;
    const key = tabRowKey(entry.tabId);
    scored.push({
      row: {
        kind: "tab",
        key,
        entry,
        highlight: r.highlight,
        current: entry.tabId === activeTabId ? true : undefined,
      },
      points: r.points + learnedBoost(learned, q, key),
      recency: entry,
    });
  }
  for (const entry of workspaces) {
    const hit = fuzzyHit(q, entry.title);
    if (hit === null) continue;
    const key = workspaceRowKey(entry.workspaceId);
    scored.push({
      row: {
        kind: "workspace",
        key,
        entry,
        highlight: asHighlight(hit, "title"),
      },
      points: hit.points + learnedBoost(learned, q, key),
      recency: null,
    });
  }
  for (const entry of closed) {
    const r = closedPoints(entry, q);
    if (r === null) continue;
    scored.push({
      row: { kind: "closed", key: entry.key, entry, highlight: r.highlight },
      points: r.points,
      recency: null,
    });
  }

  scored.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.recency && b.recency) return byRecency(a.recency, b.recency);
    return 0;
  });

  let tabCount = 0;
  let closedCount = 0;
  const rows: MergedRow[] = [];
  for (const s of scored) {
    if (s.row.kind === "tab" && !s.row.current && ++tabCount > SEARCH_LIMIT)
      continue;
    if (s.row.kind === "closed" && ++closedCount > CLOSED_SEARCH_LIMIT)
      continue;
    rows.push(s.row);
  }
  const shownWorkspaces = new Set(
    rows.flatMap((r) => (r.kind === "tab" ? [r.entry.workspaceId] : [])),
  );
  const visible = rows.filter(
    (r) => r.kind !== "workspace" || !shownWorkspaces.has(r.entry.workspaceId),
  );
  const at = visible.findIndex((r) => r.kind === "tab" && r.current);
  if (at > 0) visible.unshift(...visible.splice(at, 1));
  return visible;
}
