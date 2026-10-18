import type { TabEntry } from "./tabEntries";

export const RECENT_LIMIT = 8;
// Every row is a cmdk item registered on each keystroke, so typing cannot render a thousand of them.
export const SEARCH_LIMIT = 40;

export const tabRowKey = (tabId: string) => `tab:${tabId}`;
export const workspaceRowKey = (id: string) => `ws:${id}`;

// Awake workspaces first, then the most recently used; never-used tabs fall back to their
// workspace's activity and then to tree order.
export function byRecency(a: TabEntry, b: TabEntry): number {
  return (
    Number(a.hibernated) - Number(b.hibernated) ||
    b.lastUsedAt - a.lastUsedAt ||
    b.workspaceActiveAt - a.workspaceActiveAt ||
    a.order - b.order
  );
}
