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

// Empty-box order: tabs that need you first, then the ones still busy, then the rest.
function attentionTier(e: TabEntry): number {
  if (e.indicator === "attention" || e.indicator === "error") return 0;
  if (e.indicator === "working" || e.running) return 1;
  return 2;
}

export function byRecentList(a: TabEntry, b: TabEntry): number {
  return attentionTier(a) - attentionTier(b) || byRecency(a, b);
}
