import type { Tab } from "./types";

/**
 * Whether a bulk action (Close All Tabs / Close Other Tabs) may close this tab.
 * Locked tabs are protected and must survive bulk closes; the user has to unlock
 * them first (or close them individually after unlocking).
 */
export function isBulkClosable(tab: Tab): boolean {
  return !(tab.locked ?? false);
}

export function bulkClosableIds(tabs: Tab[]): string[] {
  return tabs.filter(isBulkClosable).map((t) => t.id);
}

export function otherBulkClosableIds(tabs: Tab[], keepId: string): string[] {
  return tabs.filter((t) => t.id !== keepId && isBulkClosable(t)).map((t) => t.id);
}
