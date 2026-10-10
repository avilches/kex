import { allPanes, findPane } from "./splitNode";
import type { SplitDirection, TabMoveRequest } from "./tabTransfer";
import type { Workspace } from "./types";

export type TabLocation = { paneId: string; wsId: string };

export type TabDropAction =
  | { kind: "reorder"; workspaceId: string; tabId: string; index: number }
  | { kind: "move"; workspaceId: string; tabId: string; paneId: string; index?: number }
  | { kind: "split"; workspaceId: string; tabId: string; paneId: string; direction: SplitDirection }
  | { kind: "transfer"; sourceWorkspaceId: string; tabId: string; request: TabMoveRequest };

const DIRECTIONS: ReadonlySet<string> = new Set(["top", "bottom", "left", "right"]);

export function resolveTabDrop(
  overId: string,
  tabId: string,
  workspaces: Workspace[],
  idx: Map<string, TabLocation>,
  paneLimit: number,
): TabDropAction | null {
  const source = idx.get(tabId);
  if (!source) return null;

  if (overId.startsWith("tab-insert:")) {
    const [, refTabId, side] = overId.split(":");
    if (!refTabId || (side !== "before" && side !== "after")) return null;
    const target = idx.get(refTabId);
    if (!target) return null;
    const targetWs = workspaces.find((w) => w.id === target.wsId);
    const pane = targetWs ? findPane(targetWs.paneTree, target.paneId) : null;
    const refIndex = pane ? pane.tabs.findIndex((t) => t.id === refTabId) : -1;
    if (refIndex === -1) return null;
    const index = refIndex + (side === "after" ? 1 : 0);
    if (target.wsId !== source.wsId) {
      return {
        kind: "transfer",
        sourceWorkspaceId: source.wsId,
        tabId,
        request: { kind: "pane", workspaceId: target.wsId, paneId: target.paneId, index },
      };
    }
    if (source.paneId === target.paneId) return { kind: "reorder", workspaceId: source.wsId, tabId, index };
    return { kind: "move", workspaceId: source.wsId, tabId, paneId: target.paneId, index };
  }

  if (!overId.startsWith("zone:")) return null;
  const [, paneId, zone] = overId.split(":");
  if (!paneId || !zone) return null;
  const targetWs = workspaces.find((w) => findPane(w.paneTree, paneId));
  if (!targetWs) return null;
  const crossing = targetWs.id !== source.wsId;

  if (zone === "center") {
    if (crossing) {
      return {
        kind: "transfer",
        sourceWorkspaceId: source.wsId,
        tabId,
        request: { kind: "pane", workspaceId: targetWs.id, paneId },
      };
    }
    if (source.paneId === paneId) return null;
    return { kind: "move", workspaceId: source.wsId, tabId, paneId, index: undefined };
  }

  if (!DIRECTIONS.has(zone)) return null;
  if (allPanes(targetWs.paneTree).length >= paneLimit) return null;
  const direction = zone as SplitDirection;
  if (crossing) {
    return {
      kind: "transfer",
      sourceWorkspaceId: source.wsId,
      tabId,
      request: { kind: "split", workspaceId: targetWs.id, paneId, direction },
    };
  }
  return { kind: "split", workspaceId: source.wsId, tabId, paneId, direction };
}

export function originToRestore(
  originId: string | null,
  currentId: string,
  placed: boolean,
  existingIds: readonly string[],
): string | null {
  if (placed || !originId || originId === currentId || !existingIds.includes(originId)) return null;
  return originId;
}

export function canDropTabOnWorkspace(
  sourceWorkspaceId: string,
  target: { id: string; hibernated?: boolean },
): boolean {
  return target.id !== sourceWorkspaceId && !target.hibernated;
}
