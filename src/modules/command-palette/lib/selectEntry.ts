import type { TabEntry, WorkspaceEntry } from "./tabEntries";

// A hibernated tab stays in the tree, so navigating after the wake always finds it.
export async function selectTab(
  entry: Pick<TabEntry, "tabId" | "workspaceId" | "hibernated">,
  deps: { wake(workspaceId: string, tabId: string): Promise<void>; goToTab(tabId: string): void },
): Promise<void> {
  if (entry.hibernated) await deps.wake(entry.workspaceId, entry.tabId);
  deps.goToTab(entry.tabId);
}

export function selectWorkspace(
  entry: Pick<WorkspaceEntry, "workspaceId">,
  deps: { activate(workspaceId: string): void },
): void {
  deps.activate(entry.workspaceId);
}
