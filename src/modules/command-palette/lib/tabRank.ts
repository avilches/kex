import type { TabEntry } from "./tabEntries";

export const RECENT_LIMIT = 8;
// Every row is a cmdk item registered on each keystroke, so typing cannot render a thousand of them.
export const SEARCH_LIMIT = 40;

export const tabRowKey = (tabId: string) => `tab:${tabId}`;
export const workspaceRowKey = (id: string) => `ws:${id}`;

// The most recently used first, asleep or not (hibernating does not touch lastUsedAt, so a tab keeps
// its place when it falls asleep); never-used tabs fall back to tree order.
export function byRecency(a: TabEntry, b: TabEntry): number {
  return b.lastUsedAt - a.lastUsedAt || a.order - b.order;
}

// The red dot (error) first, then the orange one (attention), then the spinner (working), then the rest.
const INDICATOR_RANK = { error: 0, attention: 1, working: 2 } as const;

// The order of the palette's tab list, empty or filtered: what asks for the user first, each group by recency.
export function byPriority(a: TabEntry, b: TabEntry): number {
  const rank = (e: TabEntry) => (e.indicator ? INDICATOR_RANK[e.indicator] : 3);
  return rank(a) - rank(b) || byRecency(a, b);
}
