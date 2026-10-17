import { useSyncExternalStore } from "react";
import { allPanes } from "./splitNode";
import type { Workspace } from "./types";

// Root of the workspace each tab belongs to, so a tab title can name it without the
// title hooks being handed the workspace. Fed from the workspaces state on every change.
const listeners = new Set<() => void>();
let roots: ReadonlyMap<string, string> = new Map();

export function syncTabWorkspaceRoots(workspaces: readonly Workspace[]): void {
  const next = new Map<string, string>();
  for (const ws of workspaces) {
    if (!ws.workspaceRoot) continue;
    for (const pane of allPanes(ws.paneTree)) {
      for (const tab of pane.tabs) next.set(tab.id, ws.workspaceRoot);
    }
  }
  if (sameRoots(roots, next)) return;
  roots = next;
  for (const l of listeners) l();
}

function sameRoots(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, root] of a) if (b.get(id) !== root) return false;
  return true;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getTabWorkspaceRoot(tabId: string | undefined): string | undefined {
  return tabId ? roots.get(tabId) : undefined;
}

export function useTabWorkspaceRoot(tabId: string | undefined): string | undefined {
  return useSyncExternalStore(subscribe, () => getTabWorkspaceRoot(tabId));
}
