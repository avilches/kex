import type { PaletteItem } from "../types";
import { fuzzyScoreLower, passesQuality } from "./fuzzy";
import { type LearnedMap, learnedBoost } from "./learned";
import { mruRank } from "./mru";
import { buildSearchBlobs, commandRowKey } from "./rankCommands";
import type { TabEntry, WorkspaceEntry } from "./tabEntries";
import { byRecency, RECENT_LIMIT, SEARCH_LIMIT, tabRowKey, workspaceRowKey } from "./tabRank";

export type MergedRow =
  | { kind: "command"; key: string; item: PaletteItem }
  | { kind: "tab"; key: string; entry: TabEntry }
  | { kind: "workspace"; key: string; entry: WorkspaceEntry };

export type MergeInput = {
  commands: PaletteItem[];
  tabs: TabEntry[];
  workspaces: WorkspaceEntry[];
  term: string;
  activeTabId: string | null;
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

type Scored = { row: MergedRow; points: number; recency: TabEntry | null };

function substring(query: string, field: string): number | null {
  if (!field) return null;
  const i = field.toLowerCase().indexOf(query);
  return i < 0 ? null : 1 - i / (field.length + 1);
}

function fuzzyPoints(query: string, field: string): number | null {
  const s = fuzzyScoreLower(query, field.toLowerCase());
  return s !== null && passesQuality(query.length, s) ? s : null;
}

function tabPoints(e: TabEntry, q: string): number | null {
  const title = fuzzyPoints(q, e.title);
  const note = substring(q, e.note ?? "");
  if (title !== null) return title;
  if (note !== null) return SUBSTRING_BASE + note;
  const workspace = fuzzyPoints(q, e.workspaceTitle);
  if (workspace !== null) return SUBSTRING_BASE - TIER_STEP + workspace / 100;
  const location = Math.max(
    substring(q, e.cwd) ?? -1,
    substring(q, e.worktree) ?? -1,
    substring(q, e.branch) ?? -1,
  );
  if (location >= 0) return SUBSTRING_BASE - 2 * TIER_STEP + location;
  const process = substring(q, e.process);
  if (process !== null) return SUBSTRING_BASE - 3 * TIER_STEP + process;
  return null;
}

function commandPoints(blob: string[], q: string): number | null {
  let top: number | null = null;
  for (const field of blob) {
    const p = fuzzyPoints(q, field);
    if (p !== null && (top === null || p > top)) top = p;
  }
  return top;
}

export function mergeRows(input: MergeInput): MergedRow[] {
  const { commands, tabs, workspaces, activeTabId, learned, mru } = input;
  const q = input.term.trim().toLowerCase();

  if (!q) {
    const recents = tabs
      .filter((t) => t.tabId !== activeTabId)
      .sort(byRecency)
      .slice(0, RECENT_LIMIT)
      .map((entry): MergedRow => ({ kind: "tab", key: tabRowKey(entry.tabId), entry }));
    const actions = [...commands]
      .sort((a, b) => mruRank(mru, b.id) - mruRank(mru, a.id))
      .map((item): MergedRow => ({ kind: "command", key: commandRowKey(item.id), item }));
    return [...recents, ...actions];
  }

  const scored: Scored[] = [];
  const blobs = buildSearchBlobs(commands);
  commands.forEach((item, i) => {
    const fuzzy = commandPoints(blobs[i], q);
    if (fuzzy === null) return;
    const p = blobs[i].some((f) => f.toLowerCase().includes(q)) ? fuzzy : fuzzy - SCATTERED_PENALTY;
    const key = commandRowKey(item.id);
    scored.push({ row: { kind: "command", key, item }, points: p + learnedBoost(learned, q, key), recency: null });
  });
  for (const entry of tabs) {
    const p = tabPoints(entry, q);
    if (p === null) continue;
    const key = tabRowKey(entry.tabId);
    scored.push({ row: { kind: "tab", key, entry }, points: p + learnedBoost(learned, q, key), recency: entry });
  }
  for (const entry of workspaces) {
    const p = fuzzyPoints(q, entry.title);
    if (p === null) continue;
    const key = workspaceRowKey(entry.workspaceId);
    scored.push({ row: { kind: "workspace", key, entry }, points: p + learnedBoost(learned, q, key), recency: null });
  }

  scored.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.recency && b.recency) return byRecency(a.recency, b.recency);
    return 0;
  });

  let tabCount = 0;
  const rows: MergedRow[] = [];
  for (const s of scored) {
    if (s.row.kind === "tab" && ++tabCount > SEARCH_LIMIT) continue;
    rows.push(s.row);
  }
  return rows;
}
