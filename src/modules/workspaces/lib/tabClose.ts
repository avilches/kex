import { findTabPane } from "./splitNode";
import type { Tab, Workspace } from "./types";

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

// Tabs a sidebar row closes for "Close Other Tabs" / "Close All Tabs": those
// of the pane that holds `tabId`, in whichever workspace it lives. Empty when
// the tab is gone.
export function closeIdsForTab(
  workspaces: Pick<Workspace, "paneTree">[],
  tabId: string,
  mode: "others" | "all",
): string[] {
  for (const ws of workspaces) {
    const found = findTabPane(ws.paneTree, tabId);
    if (!found) continue;
    return mode === "others"
      ? otherBulkClosableIds(found.pane.tabs, tabId)
      : bulkClosableIds(found.pane.tabs);
  }
  return [];
}

export function paneTabCountForTab(
  workspaces: Pick<Workspace, "paneTree">[],
  tabId: string,
): number {
  for (const ws of workspaces) {
    const found = findTabPane(ws.paneTree, tabId);
    if (found) return found.pane.tabs.length;
  }
  return 0;
}
