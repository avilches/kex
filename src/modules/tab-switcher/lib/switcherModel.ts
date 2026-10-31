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
