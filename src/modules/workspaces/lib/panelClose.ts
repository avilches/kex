import type { Panel } from "./types";

/**
 * Whether a bulk action (Close All Tabs / Close Other Tabs) may close this panel.
 * Locked terminal tabs are protected and must survive bulk closes; the user has
 * to unlock them first (or close them individually after unlocking).
 */
export function isBulkClosable(panel: Panel): boolean {
  return !((panel.kind === "terminal" || panel.kind === "editor") && (panel.locked ?? false));
}
