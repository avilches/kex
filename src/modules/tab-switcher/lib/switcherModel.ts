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
