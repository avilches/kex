import type { TabEntry, WorkspaceEntry } from "./tabEntries";

// A hibernated workspace keeps its tabs in the tree, so navigating after the wake always finds the tab.
export async function selectTab(
  entry: Pick<TabEntry, "tabId" | "workspaceId" | "hibernated">,
  deps: { wake(workspaceId: string): Promise<void>; goToTab(tabId: string): void },
): Promise<void> {
  if (entry.hibernated) await deps.wake(entry.workspaceId);
  deps.goToTab(entry.tabId);
}

export async function selectWorkspace(
  entry: Pick<WorkspaceEntry, "workspaceId" | "hibernated">,
  deps: { wake(workspaceId: string): Promise<void>; activate(workspaceId: string): void },
): Promise<void> {
  if (entry.hibernated) await deps.wake(entry.workspaceId);
  deps.activate(entry.workspaceId);
}
