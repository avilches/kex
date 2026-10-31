export type Held = { ctrl: boolean; alt: boolean; meta: boolean };

type Ordered = { tabId: string; lastUsedAt: number; order: number };

// Shift is left out on purpose: it only reverses the direction, so letting go of it must not commit.
export function heldModifiers(e: Pick<KeyboardEvent, "ctrlKey" | "altKey" | "metaKey">): Held {
  return { ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey };
}

// The pick is confirmed when every modifier that opened the switcher is up again.
export function modifiersReleased(
  held: Held,
  e: Pick<KeyboardEvent, "ctrlKey" | "altKey" | "metaKey">,
): boolean {
  return !((held.ctrl && e.ctrlKey) || (held.alt && e.altKey) || (held.meta && e.metaKey));
}

// Most recent first with the tab the user is in at index 0, whatever its stamp says, so the first
// step always lands on the previous one.
export function switcherOrder<T extends Ordered>(entries: readonly T[], activeTabId: string | null): T[] {
  const sorted = [...entries].sort((a, b) => b.lastUsedAt - a.lastUsedAt || a.order - b.order);
  const at = sorted.findIndex((e) => e.tabId === activeTabId);
  if (at > 0) sorted.unshift(...sorted.splice(at, 1));
  return sorted;
}

// Letters the switcher keeps for itself: W closes the highlighted tab.
const OWN_LETTERS: readonly string[] = ["w"];

// The key a shortcut lends the switcher: the letter of its first binding that has one, with no modifier, in
// lower case. Only a single letter qualifies. Anything else a shortcut can be moved to (Enter, an arrow, F5, a
// digit) would shadow a key of the switcher or mean nothing bare, and so would a letter it already uses; with
// none left the key is simply off, which is better than a silent clash.
export function letterOf(bindings: readonly { key: string }[]): string | null {
  for (const { key } of bindings) {
    const letter = key.toLowerCase();
    if (/^[a-z]$/.test(letter) && !OWN_LETTERS.includes(letter)) return letter;
  }
  return null;
}

// What a hibernate or restore request did to a tab, read from its state before and after (after is null when
// the tab no longer exists). The request does not say, because with a working agent it only opens a
// confirmation and returns: the tile is refreshed only if the tab really changed. While that dialog is open
// nothing has happened yet and the overlay would hide it, so the switcher is dismissed for the user to decide.
export function sleepOutcome(s: {
  before: boolean;
  after: boolean | null;
  dialogOpen: boolean;
}): "refresh" | "keep" | "dismiss" {
  if (s.dialogOpen) return "dismiss";
  if (s.after === null) return "keep";
  return s.after !== s.before ? "refresh" : "keep";
}

// A request to hibernate or wake queues a state update, and the refs the app reads the tab from only catch up
// after React commits it. Reading right after the request therefore still shows the old state, so this waits
// for the read to differ from `before`, up to a timeout: a request that only opens a dialog or is cancelled
// never changes it and ends unchanged. Null when the tab no longer exists.
export async function settledSleepState(
  read: () => boolean | null,
  before: boolean,
  { stepMs = 16, timeoutMs = 400, interrupted }: { stepMs?: number; timeoutMs?: number; interrupted?: () => boolean } = {},
): Promise<boolean | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const now = read();
    if (now === null || now !== before || interrupted?.() || Date.now() >= deadline) return now;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
}

// A woken tab has no agent session until its agent starts again, which takes longer than the switcher stays
// open, so the refreshed tile would lose the agent mark. It keeps the one the tile had.
export function carriedAgent(previous: string, refreshed: string): string {
  return refreshed || previous;
}

// The orange or red dot comes from the live agent session, which a hibernated or just restored tab does not
// have for a while. The refreshed tile keeps the dot the old one had until the app shows a new one, so a
// hibernate followed by a restore inside the same switcher does not lose it.
export function carriedIndicator<T>(previous: T | null, refreshed: T | null): T | null {
  return refreshed ?? previous;
}

// The list without a closed tab and where the highlight goes: the tile that slides into the gap, or the
// previous one when the last tile went, and a highlight on another tile follows it. Null when fewer than
// two tiles would remain, because a switcher with nothing to switch to has no reason to stay open.
export function afterRemoval<T extends { tabId: string }>(
  entries: readonly T[],
  index: number,
  tabId: string,
): { entries: T[]; index: number } | null {
  const at = entries.findIndex((e) => e.tabId === tabId);
  const next = at < 0 ? [...entries] : entries.filter((_, i) => i !== at);
  if (next.length < 2) return null;
  if (at < 0) return { entries: next, index };
  const kept = at < index ? index - 1 : index;
  return { entries: next, index: Math.min(kept, next.length - 1) };
}

export function startIndex(length: number, delta: 1 | -1): number {
  if (length <= 1) return 0;
  return delta > 0 ? 1 : length - 1;
}

export function stepIndex(index: number, length: number, delta: number): number {
  if (length === 0) return 0;
  return (((index + delta) % length) + length) % length;
}

// Up and down move a whole row and stop at the ends, unlike Tab, which wraps.
export function rowIndex(index: number, length: number, columns: number, direction: 1 | -1): number {
  if (length === 0) return 0;
  return Math.max(0, Math.min(length - 1, index + direction * Math.max(1, columns)));
}

// Grid metrics in px; TabSwitcher draws with the same numbers, so the viewport can be a whole number of rows.
export const TILE_HEIGHT = 118;
export const GRID_GAP = 6;
export const GRID_PAD = 12;

// The scroller is as tall as the whole rows that fit in `available` once the padding around it is taken out,
// never half a row and never less than one. Its tiles reach its edges exactly, because the padding sits on a
// wrapper outside it: padding inside a scroller leaves a strip of the neighbouring row showing at every stop.
// Null when every row fits: the content then sets the height and there is no scroll.
export function gridViewportHeight(available: number, rows: number): number | null {
  const row = TILE_HEIGHT + GRID_GAP;
  const content = rows * row - GRID_GAP;
  const room = available - 2 * GRID_PAD;
  if (rows <= 0 || content <= room) return null;
  const fit = Math.max(1, Math.floor((room + GRID_GAP) / row));
  return fit * TILE_HEIGHT + (fit - 1) * GRID_GAP;
}

export type Point = { x: number; y: number };

// A resting cursor must not steer the pick: the overlay appearing under it, or the grid scrolling to
// follow the keyboard, makes the browser report a move with no hand behind it. Only a real shift of
// the pointer counts, and the first sample of a session is just the place to measure from.
export const POINTER_SLOP_PX = 4;

export function pointerMoved(from: Point | null, to: Point): boolean {
  if (!from) return false;
  return Math.hypot(to.x - from.x, to.y - from.y) >= POINTER_SLOP_PX;
}

// Time the switcher stays unpainted: a tap that releases before it only toggles the last two tabs.
export const REVEAL_DELAY_MS = 120;
