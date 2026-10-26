import { allPanes, findPane } from "./splitNode";
import type { SplitDirection, TabMoveRequest } from "./tabTransfer";
import type { Workspace } from "./types";

export type TabLocation = { paneId: string; wsId: string };

export type TabDropAction =
  | { kind: "reorder"; workspaceId: string; tabId: string; index: number }
  | { kind: "move"; workspaceId: string; tabId: string; paneId: string; index?: number }
  | { kind: "split"; workspaceId: string; tabId: string; paneId: string; direction: SplitDirection }
  | { kind: "transfer"; sourceWorkspaceId: string; tabId: string; request: TabMoveRequest };

// Insertion at an explicit index of a pane, used for the very top of a sidebar list.
export const PANE_INDEX_PREFIX = "pane-index:";

const DIRECTIONS: ReadonlySet<string> = new Set(["top", "bottom", "left", "right"]);

function placeAt(source: TabLocation, tabId: string, target: TabLocation, index: number): TabDropAction {
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
    return placeAt(source, tabId, target, index);
  }

  if (overId.startsWith(PANE_INDEX_PREFIX)) {
    const [, paneId, rawIndex] = overId.split(":");
    const index = Number(rawIndex);
    const targetWs = workspaces.find((w) => paneId && findPane(w.paneTree, paneId));
    if (!paneId || !targetWs || !Number.isInteger(index) || index < 0) return null;
    return placeAt(source, tabId, { wsId: targetWs.id, paneId }, index);
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

export function canDropTabOnWorkspace(sourceWorkspaceId: string, target: { id: string }): boolean {
  return target.id !== sourceWorkspaceId;
}

// A row of a workspace's sidebar list is a droppable; the rows are in tab order,
// so a drop between two rows lands in the pane of the tab above it, right after
// that tab, and above the first row it lands at the start of the first pane.
export const SIDE_ROW_DROP_PREFIX = "side-row:";

export type SideRowDropData = { sideRow: true; workspaceId: string; tabId: string; prevTabId: string | null };

export function sideRowSide(rect: { top: number; height: number }, pointerY: number): "before" | "after" {
  return pointerY < rect.top + rect.height / 2 ? "before" : "after";
}

export function resolveSideRowDrop(
  row: SideRowDropData,
  side: "before" | "after",
  workspaces: Workspace[],
): string | null {
  const refTabId = side === "before" ? row.prevTabId : row.tabId;
  if (refTabId) return `tab-insert:${refTabId}:after`;
  const ws = workspaces.find((w) => w.id === row.workspaceId);
  const first = ws ? allPanes(ws.paneTree)[0] : undefined;
  return first ? `${PANE_INDEX_PREFIX}${first.id}:0` : null;
}

// A row of the WorkspaceBar and the tab it shows in a pane are both draggable
// and share one DndContext, so the row needs its own draggable id or dnd-kit
// would track whichever node registered last.
const SIDEBAR_TAB_PREFIX = "side-tab:";

export function sidebarTabDragId(tabId: string): string {
  return SIDEBAR_TAB_PREFIX + tabId;
}

// The id of the dragged entity with the sidebar-row prefix stripped, so every
// consumer of a drag event compares the same tab id.
export function draggedId(id: string | number): string {
  const s = String(id);
  return s.startsWith(SIDEBAR_TAB_PREFIX) ? s.slice(SIDEBAR_TAB_PREFIX.length) : s;
}

export type TabDropRoute = "side-row" | "workspace" | "zone";

// A row sits inside its workspace's hover area, so a row drop wins over the
// workspace drop, and both win over the pane zone under the pointer.
export function tabDropRoute(opts: {
  isTabDrag: boolean;
  overSideRow: boolean;
  barWorkspaceId: string | null;
}): TabDropRoute {
  if (!opts.isTabDrag) return "zone";
  if (opts.overSideRow) return "side-row";
  if (opts.barWorkspaceId) return "workspace";
  return "zone";
}
