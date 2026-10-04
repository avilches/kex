// Recency queue for leaves kept "parked" (hidden but with a live terminal
// and buffer) in the background. Index 0 is least-recently used; the end is
// most-recently used. Mutates `order` in place so callers can hold a single
// module-level array as the source of truth.

export function touch(order: string[], leafId: string): void {
  const i = order.indexOf(leafId);
  if (i !== -1) order.splice(i, 1);
  order.push(leafId);
}

export function drop(order: string[], leafId: string): void {
  const i = order.indexOf(leafId);
  if (i !== -1) order.splice(i, 1);
}

// Removes and returns the least-recently-used ids beyond `budget`, oldest
// first. A budget of 0 evicts everyone; a negative budget is treated as 0.
export function evictOverflow(order: string[], budget: number): string[] {
  const max = Math.max(0, budget);
  const excess = order.length - max;
  if (excess <= 0) return [];
  return order.splice(0, excess);
}

// Whether an id evicted from the LRU should actually have its slot released.
// A leaf can enter alt-screen (or blocks) after it was parked, while still
// hidden: by eviction time it's exempt from this LRU, same as one that never
// entered it via the non-blocks/non-alt-screen guard at park time, so its
// slot must survive.
export function shouldEvictParkedLeaf(session: {
  hasSlot: boolean;
  visibleNow: boolean;
  blocks: boolean;
}, isAltScreen: boolean): boolean {
  return session.hasSlot && !session.visibleNow && !session.blocks && !isAltScreen;
}
