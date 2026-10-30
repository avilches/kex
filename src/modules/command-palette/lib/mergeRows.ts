import { splitActionName } from "@/modules/actions/lib/actionName";
import type { BarItem } from "@/modules/actions/lib/actionsBar";
import { type RowTagKind, tabTagKind } from "../RowTag";
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
  byPriority,
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
      tagHit?: number;
    }
  | {
      kind: "action";
      key: string;
      item: BarItem;
      highlight?: RowHighlight;
      tagHit?: number;
    }
  | {
      kind: "tab";
      key: string;
      entry: TabEntry;
      highlight?: RowHighlight;
      tagHit?: number;
      // The tab the user is in right now: always the first row, under its own heading.
      current?: boolean;
    }
  | {
      kind: "workspace";
      key: string;
      entry: WorkspaceEntry;
      highlight?: RowHighlight;
      tagHit?: number;
      current?: boolean;
    }
  | {
      kind: "closed";
      key: string;
      entry: ClosedTabEntry;
      highlight?: RowHighlight;
      tagHit?: number;
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

// The tag a row wears is part of what it is: "work pepe" finds the workspace pepe, and "work" alone
// lists every workspace. A word that starts the tag is dropped and the rest is matched against the
// row, so the bare name still finds every kind. `tagHit` is how many letters of the tag it covered.
const MIN_TYPE_WORD = 2;
// Rows picked only by their type: the whole word ("workspace") is what was asked for and goes above
// any name match; a bare prefix ("set") may just be the start of a name, so it goes below them.
const TYPE_ONLY_POINTS = TIER_STEP;
const TYPE_PREFIX_POINTS = SUBSTRING_BASE - 4 * TIER_STEP;

function typeWord(
  q: string,
  tag: RowTagKind,
): { rest: string; tagHit: number } | null {
  const words = q.split(/\s+/).filter(Boolean);
  const label = tag.toLowerCase();
  const i = words.findIndex(
    (w) => w.length >= MIN_TYPE_WORD && label.startsWith(w),
  );
  if (i < 0) return null;
  return {
    rest: words.filter((_, k) => k !== i).join(" "),
    tagHit: words[i].length,
  };
}

type Typed<T> = { value: T; tagHit?: number };

function scoreWithType<T extends { points: number }>(
  q: string,
  tag: RowTagKind,
  score: (query: string) => T | null,
  typeOnly: (points: number) => T,
): Typed<T> | null {
  const whole = score(q);
  const word = typeWord(q, tag);
  if (word === null) return whole === null ? null : { value: whole };
  const typed =
    word.rest === ""
      ? typeOnly(
          word.tagHit === tag.length ? TYPE_ONLY_POINTS : TYPE_PREFIX_POINTS,
        )
      : score(word.rest);
  if (typed === null) return whole === null ? null : { value: whole };
  if (whole !== null && whole.points > typed.points && word.rest === "")
    return { value: whole, tagHit: word.tagHit };
  return { value: typed, tagHit: word.tagHit };
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

type TabRow = Extract<MergedRow, { kind: "tab" }>;

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
      .sort(byPriority)
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
    const workspaceRows = [...workspaces]
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .map(
        (entry): MergedRow => ({
          kind: "workspace",
          key: workspaceRowKey(entry.workspaceId),
          entry,
          current: entry.workspaceId === input.activeWorkspaceId ? true : undefined,
        }),
      );
    return [
      ...current,
      ...recents,
      ...workspaceRows,
      ...recentlyClosed,
      ...userRows,
      ...actions,
    ];
  }

  const scored: { row: MergedRow; points: number; recency: TabEntry | null }[] =
    [];
  const blobs = buildSearchBlobs(commands);
  commands.forEach((item, i) => {
    const tag: RowTagKind = item.group === "Settings" ? "Setting" : "Action";
    const scoreCommand = (query: string) => {
      const found = commandHit(blobs[i], query);
      if (found === null) return null;
      const exact = blobs[i].some((f) => foldText(f).includes(query));
      return { hit: found, points: exact ? found.points : found.points - SCATTERED_PENALTY };
    };
    const typedOnly = (points: number) => ({
      hit: { points, indices: [], field: -1 },
      points,
    });
    const result = scoreWithType(q, tag, scoreCommand, typedOnly);
    if (result === null) return;
    const { hit, points: p } = result.value;
    const key = commandRowKey(item.id);
    scored.push({
      row: {
        kind: "command",
        key,
        item,
        highlight: hit.field === 0 ? asHighlight(hit, "title") : undefined,
        tagHit: result.tagHit,
      },
      points: p + learnedBoost(learned, q, key),
      recency: null,
    });
  });
  for (const item of userActions) {
    const typed = scoreWithType(
      q,
      "Action",
      (x) => actionPoints(item, x),
      (points): FieldScored => ({ points }),
    );
    if (typed === null) continue;
    const r = typed.value;
    const key = actionRowKey(item.id);
    scored.push({
      row: {
        kind: "action",
        key,
        item,
        highlight: r.highlight,
        tagHit: typed.tagHit,
      },
      points: r.points + learnedBoost(learned, q, key),
      recency: null,
    });
  }
  for (const entry of tabs) {
    const typed = scoreWithType(
      q,
      tabTagKind(entry),
      (x) => tabPoints(entry, x),
      (points): FieldScored => ({ points }),
    );
    if (typed === null) continue;
    const r = typed.value;
    const key = tabRowKey(entry.tabId);
    scored.push({
      row: {
        kind: "tab",
        key,
        entry,
        highlight: r.highlight,
        tagHit: typed.tagHit,
        current: entry.tabId === activeTabId ? true : undefined,
      },
      points: r.points,
      recency: entry,
    });
  }
  for (const entry of workspaces) {
    const typed = scoreWithType(
      q,
      "Workspace",
      (x) => fuzzyHit(x, entry.title),
      (points) => ({ points, indices: [] }),
    );
    if (typed === null) continue;
    const hit = typed.value;
    const key = workspaceRowKey(entry.workspaceId);
    scored.push({
      row: {
        kind: "workspace",
        key,
        entry,
        highlight: asHighlight(hit, "title"),
        tagHit: typed.tagHit,
        current: entry.workspaceId === input.activeWorkspaceId ? true : undefined,
      },
      points: hit.points + learnedBoost(learned, q, key),
      recency: null,
    });
  }
  for (const entry of closed) {
    const typed = scoreWithType(
      q,
      entry.kind === "terminal" ? "Terminal" : "File",
      (x) => closedPoints(entry, x),
      (points): FieldScored => ({
        points: points + entry.uses * TIER_STEP,
      }),
    );
    if (typed === null) continue;
    const r = typed.value;
    scored.push({
      row: {
        kind: "closed",
        key: entry.key,
        entry,
        highlight: r.highlight,
        tagHit: typed.tagHit,
      },
      points: r.points,
      recency: null,
    });
  }

  scored.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.recency && b.recency) return byPriority(a.recency, b.recency);
    return 0;
  });

  let tabCount = 0;
  let closedCount = 0;
  const currentRows: MergedRow[] = [];
  const tabRows: TabRow[] = [];
  const others: MergedRow[] = [];
  for (const s of scored) {
    const row = s.row;
    if (row.kind === "tab") {
      if (row.current) currentRows.push(row);
      else if (++tabCount <= SEARCH_LIMIT) tabRows.push(row);
      continue;
    }
    if (row.kind === "closed" && ++closedCount > CLOSED_SEARCH_LIMIT) continue;
    others.push(row);
  }
  // The tabs that fit keep the order of the empty list, so typing narrows it instead of reshuffling it.
  tabRows.sort((a, b) => byPriority(a.entry, b.entry));
  return [...currentRows, ...tabRows, ...others];
}
