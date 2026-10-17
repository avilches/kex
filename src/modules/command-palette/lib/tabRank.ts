import { fuzzyScoreLower, passesQuality } from "./fuzzy";
import { type LearnedMap, learnedBoost } from "./learned";
import type { TabEntry, WorkspaceEntry } from "./tabEntries";

export const RECENT_LIMIT = 8;
// Every row is a cmdk item registered on each keystroke, so typing cannot render a thousand of them.
export const SEARCH_LIMIT = 40;

// Best case for one query character in fuzzyScoreLower: 1 + boundary + consecutive.
const MAX_PER_CHAR = 19;

type Tier = 0 | 1 | 2 | 3;
type Hit = { tier: Tier; score: number };

export function byRecency(a: TabEntry, b: TabEntry): number {
  return (
    Number(a.hibernated) - Number(b.hibernated) ||
    b.lastUsedAt - a.lastUsedAt ||
    b.workspaceActiveAt - a.workspaceActiveAt ||
    a.order - b.order
  );
}

// The tab the user is on is never offered as a place to go: it would always be the first row.
export function recentTabs(entries: readonly TabEntry[], limit = RECENT_LIMIT, activeTabId?: string | null): TabEntry[] {
  return entries.filter((e) => e.tabId !== activeTabId).sort(byRecency).slice(0, limit);
}

function fuzzy(query: string, field: string): number | null {
  const s = fuzzyScoreLower(query, field.toLowerCase());
  if (s === null || !passesQuality(query.length, s)) return null;
  return Math.min(1, s / (query.length * MAX_PER_CHAR));
}

// What the user chose for this term is worth a fraction of the 0..1 score, so it reorders
// near ties inside a tier and can never push a hit into a better tier.
const LEARNED_SCALE = 1 / (MAX_PER_CHAR * 3);

export const tabRowKey = (tabId: string) => `tab:${tabId}`;
export const workspaceRowKey = (id: string) => `ws:${id}`;

// Long free-form fields (paths, notes, commands) match by substring: a fuzzy
// subsequence over a long path matches almost any short query.
function substring(query: string, field: string): number | null {
  if (!field) return null;
  const i = field.toLowerCase().indexOf(query);
  return i < 0 ? null : 1 - i / (field.length + 1);
}

function best(...scores: (number | null)[]): number | null {
  let top: number | null = null;
  for (const s of scores) if (s !== null && (top === null || s > top)) top = s;
  return top;
}

function hitOf(e: TabEntry, q: string): Hit | null {
  const primary = best(fuzzy(q, e.title), substring(q, e.note ?? ""));
  if (primary !== null) return { tier: 0, score: primary };
  const workspace = fuzzy(q, e.workspaceTitle);
  if (workspace !== null) return { tier: 1, score: workspace };
  const location = best(substring(q, e.cwd), substring(q, e.worktree), substring(q, e.branch));
  if (location !== null) return { tier: 2, score: location };
  const process = substring(q, e.process);
  if (process !== null) return { tier: 3, score: process };
  return null;
}

export function rankTabEntries(
  entries: readonly TabEntry[],
  term: string,
  activeTabId?: string | null,
  learned: LearnedMap = {},
): TabEntry[] {
  const q = term.trim().toLowerCase();
  if (!q) return recentTabs(entries, RECENT_LIMIT, activeTabId);
  const hits: { entry: TabEntry; hit: Hit }[] = [];
  for (const entry of entries) {
    const hit = hitOf(entry, q);
    if (hit) hits.push({ entry, hit: { ...hit, score: hit.score + learnedBoost(learned, q, tabRowKey(entry.tabId)) * LEARNED_SCALE } });
  }
  hits.sort((a, b) => a.hit.tier - b.hit.tier || b.hit.score - a.hit.score || byRecency(a.entry, b.entry));
  return hits.slice(0, SEARCH_LIMIT).map((h) => h.entry);
}

export function rankWorkspaceEntries(
  entries: readonly WorkspaceEntry[],
  term: string,
  learned: LearnedMap = {},
): WorkspaceEntry[] {
  const q = term.trim().toLowerCase();
  if (!q) return [];
  const hits: { entry: WorkspaceEntry; score: number }[] = [];
  for (const entry of entries) {
    const score = fuzzy(q, entry.title);
    if (score !== null) hits.push({ entry, score: score + learnedBoost(learned, q, workspaceRowKey(entry.workspaceId)) * LEARNED_SCALE });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      Number(a.entry.hibernated) - Number(b.entry.hibernated) ||
      b.entry.lastUsedAt - a.entry.lastUsedAt,
  );
  return hits.map((h) => h.entry);
}
