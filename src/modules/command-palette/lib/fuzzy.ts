// Subsequence scorer for the small in-memory sources only. File and content
// search are ranked server-side (ripgrep + nucleo), never here.

const BONUS_BOUNDARY = 10;
const BONUS_CAMEL = 7;
const BONUS_CONSECUTIVE = 8;
const BONUS_EXACT_CASE = 1;
const MAX_GAP_PENALTY = 3;

function isBoundary(ch: string): boolean {
  return ch === " " || ch === "-" || ch === "_" || ch === "/" || ch === ".";
}

function isCamelStart(target: string, i: number): boolean {
  const c = target.charCodeAt(i);
  const p = target.charCodeAt(i - 1);
  return c >= 65 && c <= 90 && !(p >= 65 && p <= 90);
}

const COMBINING_MARK = /\p{M}/u;

// Lowercases and drops the accents one character at a time, so the result keeps the length of the
// input and match indices still point at the text that is displayed.
export function foldText(text: string): string {
  let out = "";
  for (const ch of text.toLowerCase()) {
    const d = ch.normalize("NFD");
    out += d.length > 1 && COMBINING_MARK.test(d[1]) ? d[0] : ch;
  }
  return out;
}

// Where an already folded query sits inside a text, as the indices a highlight needs.
export function substringIndices(foldedQuery: string, text: string): number[] {
  if (!foldedQuery) return [];
  const i = foldText(text).indexOf(foldedQuery);
  return i < 0 ? [] : Array.from({ length: foldedQuery.length }, (_, k) => i + k);
}

export type FuzzyMatch = { score: number; indices: number[] };

// With lowerInputs the strings arrive pre-lowercased, so the second toLowerCase is
// idempotent and the exact-case and camel bonuses can never fire: queries scored
// there and by fuzzyScore land on the same subsequence either way.
function scoreSubsequence(
  query: string,
  target: string,
  lowerInputs: boolean,
): FuzzyMatch | null {
  if (query.length === 0) return { score: 0, indices: [] };
  if (query.length > target.length) return null;

  const q = foldText(query);
  const t = foldText(target);

  let score = 0;
  let qi = 0;
  let lastMatch = -1;
  const indices: number[] = [];

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;

    let bonus = 1;
    if (ti === 0 || isBoundary(t[ti - 1])) bonus += BONUS_BOUNDARY;
    else if (isCamelStart(target, ti)) bonus += BONUS_CAMEL;
    if (lastMatch === ti - 1) bonus += BONUS_CONSECUTIVE;
    else if (lastMatch >= 0)
      bonus -= Math.min(ti - lastMatch - 1, MAX_GAP_PENALTY);
    if (!lowerInputs && target[ti] === query[qi]) bonus += BONUS_EXACT_CASE;

    score += bonus;
    indices.push(ti);
    lastMatch = ti;
    qi++;
  }

  return qi === q.length ? { score, indices } : null;
}

export function fuzzyScore(query: string, target: string): number | null {
  return scoreSubsequence(query, target, false)?.score ?? null;
}

export function fuzzyBest(query: string, candidates: string[]): number | null {
  let best: number | null = null;
  for (const c of candidates) {
    const s = fuzzyScore(query, c);
    if (s !== null && (best === null || s > best)) best = s;
  }
  return best;
}

// Takes pre-lowercased inputs to skip redundant toLowerCase per candidate.
export function fuzzyScoreLower(
  lowerQuery: string,
  lowerTarget: string,
): number | null {
  return scoreSubsequence(lowerQuery, lowerTarget, true)?.score ?? null;
}

// Same match, paired with the target positions it consumed, so the palette can bold them.
export function fuzzyMatchLower(
  lowerQuery: string,
  lowerTarget: string,
): FuzzyMatch | null {
  return scoreSubsequence(lowerQuery, lowerTarget, true);
}

export function fuzzyBestLower(
  lowerQuery: string,
  lowerCandidates: string[],
): number | null {
  let best: number | null = null;
  for (const c of lowerCandidates) {
    const s = fuzzyScoreLower(lowerQuery, c);
    if (s !== null && (best === null || s > best)) best = s;
  }
  return best;
}

// A subsequence scorer matches almost any short query against a long string. Words that start
// the query's letters score well; letters scattered across a long id do not. 8 points per typed
// character separates the two (measured: "ser" on "search" 28, on "sidebar.showexplorer" 17).
const MIN_POINTS_PER_CHAR = 8;

export function passesQuality(queryLength: number, score: number): boolean {
  return score >= queryLength * MIN_POINTS_PER_CHAR;
}
