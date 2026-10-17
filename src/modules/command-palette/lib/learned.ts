// What the user picked after typing what. Non-critical, so localStorage like mru.ts.
// Shape: { "<typed term>": { "<row key>": times chosen } }.

const KEY = "kex-palette-learned";
export const LEARNED_MAX_ENTRIES = 200;
// A fuzzy score is about 8 points per typed character, so 36 outweighs a clearly weaker match
// but cannot bury an exact one; reached after roughly seven choices.
const BOOST_PER_DOUBLING = 12;
const MAX_BOOST = 36;

export type LearnedMap = Record<string, Record<string, number>>;

function normalize(term: string): string {
  return term.trim().toLowerCase();
}

function clean(raw: unknown): LearnedMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: LearnedMap = {};
  for (const [term, rows] of Object.entries(raw)) {
    if (!rows || typeof rows !== "object" || Array.isArray(rows)) continue;
    const kept: Record<string, number> = {};
    for (const [row, n] of Object.entries(rows)) {
      if (typeof n === "number" && Number.isFinite(n) && n > 0) kept[row] = n;
    }
    if (Object.keys(kept).length > 0) out[term] = kept;
  }
  return out;
}

export function learnedSnapshot(): LearnedMap {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? clean(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function recordChoice(term: string, rowKey: string): void {
  const t = normalize(term);
  if (!t) return;
  const map = learnedSnapshot();
  const rows = map[t] ?? {};
  rows[rowKey] = (rows[rowKey] ?? 0) + 1;
  // Re-inserted so the object's key order is also the recency order used to trim.
  delete map[t];
  map[t] = rows;
  const terms = Object.keys(map);
  for (const old of terms.slice(0, Math.max(0, terms.length - LEARNED_MAX_ENTRIES))) delete map[old];
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function weigh(times: number): number {
  return Math.min(MAX_BOOST, BOOST_PER_DOUBLING * Math.log2(1 + times));
}

// Exact term counts in full; a longer term inherits what a prefix learned in proportion to how
// much of the term that prefix is, so "set" barely helps "settings" but "serv" keeps most of "ser".
export function learnedBoost(map: LearnedMap, term: string, rowKey: string): number {
  const t = normalize(term);
  if (!t) return 0;
  let best = 0;
  for (const [learnedTerm, rows] of Object.entries(map)) {
    const n = rows[rowKey];
    if (!n || !t.startsWith(learnedTerm)) continue;
    const share = learnedTerm.length / t.length;
    best = Math.max(best, weigh(n) * share);
  }
  return best;
}
