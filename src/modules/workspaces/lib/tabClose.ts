import type { Tab } from "./types";

/**
 * Whether a bulk action (Close All Tabs / Close Other Tabs) may close this tab.
 * Locked tabs are protected and must survive bulk closes; the user has to unlock
 * them first (or close them individually after unlocking).
 */
export function isBulkClosable(tab: Tab): boolean {
  return !(tab.locked ?? false);
}
