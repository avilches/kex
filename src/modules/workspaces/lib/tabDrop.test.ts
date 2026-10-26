import { describe, expect, it } from "vitest";
import {
  canDropTabOnWorkspace,
  draggedId,
  sidebarTabDragId,
  tabDropRoute,
  originToRestore,
  resolveSideRowDrop,
  resolveTabDrop,
  sideRowSide,
  type SideRowDropData,
  type TabLocation,
} from "./tabDrop";
import type { PaneNode, Tab, Workspace } from "./types";

const term = (id: string): Tab => ({ id, kind: "terminal" });
const pane = (id: string, tabs: Tab[]): PaneNode => ({ kind: "pane", id, tabs, activeTabId: tabs[0]?.id ?? null });

const a: Workspace = {
  id: "A",
  title: "A",
  activePaneId: "pa1",
  paneTree: {
    kind: "split",
    id: "sa",
    orientation: "horizontal",
    dividerPosition: 0.5,
    first: pane("pa1", [term("t1"), term("t2")]),
    second: pane("pa2", [term("t3")]),
  },
};
const b: Workspace = { id: "B", title: "B", activePaneId: "pb1", paneTree: pane("pb1", [term("u1"), term("u2")]) };
const workspaces = [a, b];

const idx = new Map<string, TabLocation>([
  ["t1", { paneId: "pa1", wsId: "A" }],
  ["t2", { paneId: "pa1", wsId: "A" }],
  ["t3", { paneId: "pa2", wsId: "A" }],
  ["u1", { paneId: "pb1", wsId: "B" }],
  ["u2", { paneId: "pb1", wsId: "B" }],
]);

describe("resolveTabDrop within one workspace", () => {
  it("reorders inside the same pane", () => {
    expect(resolveTabDrop("tab-insert:t2:after", "t1", workspaces, idx, 8)).toEqual({
      kind: "reorder", workspaceId: "A", tabId: "t1", index: 2,
    });
  });

  it("moves to another pane at the insertion index", () => {
    expect(resolveTabDrop("tab-insert:t3:before", "t1", workspaces, idx, 8)).toEqual({
      kind: "move", workspaceId: "A", tabId: "t1", paneId: "pa2", index: 0,
    });
  });

  it("moves to the center of another pane and ignores the center of its own pane", () => {
    expect(resolveTabDrop("zone:pa2:center", "t1", workspaces, idx, 8)).toEqual({
      kind: "move", workspaceId: "A", tabId: "t1", paneId: "pa2", index: undefined,
    });
    expect(resolveTabDrop("zone:pa1:center", "t1", workspaces, idx, 8)).toBeNull();
  });

  it("splits a pane, unless the pane limit is reached", () => {
    expect(resolveTabDrop("zone:pa2:bottom", "t1", workspaces, idx, 8)).toEqual({
      kind: "split", workspaceId: "A", tabId: "t1", paneId: "pa2", direction: "bottom",
    });
    expect(resolveTabDrop("zone:pa2:bottom", "t1", workspaces, idx, 2)).toBeNull();
  });
});

describe("resolveTabDrop across workspaces", () => {
  it("transfers to a gap between tabs of another workspace", () => {
    expect(resolveTabDrop("tab-insert:u1:after", "t1", workspaces, idx, 8)).toEqual({
      kind: "transfer",
      sourceWorkspaceId: "A",
      tabId: "t1",
      request: { kind: "pane", workspaceId: "B", paneId: "pb1", index: 1 },
    });
  });

  it("transfers to the center of a pane of another workspace, even the first pane", () => {
    expect(resolveTabDrop("zone:pb1:center", "t1", workspaces, idx, 8)).toEqual({
      kind: "transfer",
      sourceWorkspaceId: "A",
      tabId: "t1",
      request: { kind: "pane", workspaceId: "B", paneId: "pb1" },
    });
  });

  it("transfers with a split, but not when the destination is at the pane limit", () => {
    expect(resolveTabDrop("zone:pb1:left", "t1", workspaces, idx, 8)).toEqual({
      kind: "transfer",
      sourceWorkspaceId: "A",
      tabId: "t1",
      request: { kind: "split", workspaceId: "B", paneId: "pb1", direction: "left" },
    });
    expect(resolveTabDrop("zone:pb1:left", "t1", workspaces, idx, 1)).toBeNull();
  });

  it("returns null for unknown targets and for unknown zones", () => {
    expect(resolveTabDrop("zone:ghost:center", "t1", workspaces, idx, 8)).toBeNull();
    expect(resolveTabDrop("zone:pb1:diagonal", "t1", workspaces, idx, 8)).toBeNull();
    expect(resolveTabDrop("tab-insert:ghost:before", "t1", workspaces, idx, 8)).toBeNull();
    expect(resolveTabDrop("scratchpad:x", "t1", workspaces, idx, 8)).toBeNull();
    expect(resolveTabDrop("zone:pb1:center", "ghost", workspaces, idx, 8)).toBeNull();
  });
});

describe("originToRestore", () => {
  it("returns the origin when the drag ended without placing the tab elsewhere", () => {
    expect(originToRestore("A", "B", false, ["A", "B"])).toBe("A");
  });

  it("returns null when the tab was placed, there is no origin or the user is already there", () => {
    expect(originToRestore("A", "B", true, ["A", "B"])).toBeNull();
    expect(originToRestore(null, "B", false, ["B"])).toBeNull();
    expect(originToRestore("A", "A", false, ["A"])).toBeNull();
  });

  it("returns null when the origin workspace was closed mid-drag", () => {
    expect(originToRestore("A", "B", false, ["B"])).toBeNull();
  });
});

describe("canDropTabOnWorkspace", () => {
  it("accepts another workspace, hibernated or not", () => {
    expect(canDropTabOnWorkspace("A", { id: "B" })).toBe(true);
    expect(canDropTabOnWorkspace("A", { id: "B", hibernated: true } as { id: string })).toBe(true);
  });

  it("rejects the tab's own workspace", () => {
    expect(canDropTabOnWorkspace("A", { id: "A" })).toBe(false);
  });
});

describe("pane-index drops", () => {
  it("reorders, moves or transfers to an explicit index", () => {
    expect(resolveTabDrop("pane-index:pa1:0", "t2", workspaces, idx, 8)).toEqual({
      kind: "reorder", workspaceId: "A", tabId: "t2", index: 0,
    });
    expect(resolveTabDrop("pane-index:pa1:0", "t3", workspaces, idx, 8)).toEqual({
      kind: "move", workspaceId: "A", tabId: "t3", paneId: "pa1", index: 0,
    });
    expect(resolveTabDrop("pane-index:pb1:0", "t1", workspaces, idx, 8)).toEqual({
      kind: "transfer",
      sourceWorkspaceId: "A",
      tabId: "t1",
      request: { kind: "pane", workspaceId: "B", paneId: "pb1", index: 0 },
    });
  });

  it("rejects an unknown pane or a bad index", () => {
    expect(resolveTabDrop("pane-index:nope:0", "t1", workspaces, idx, 8)).toBeNull();
    expect(resolveTabDrop("pane-index:pa1:x", "t1", workspaces, idx, 8)).toBeNull();
    expect(resolveTabDrop("pane-index:pa1:-1", "t1", workspaces, idx, 8)).toBeNull();
  });
});

describe("sidebar row drops", () => {
  const row = (tabId: string, prevTabId: string | null): SideRowDropData => ({
    sideRow: true, workspaceId: "A", tabId, prevTabId,
  });

  it("picks the side from the pointer position over the row", () => {
    expect(sideRowSide({ top: 100, height: 20 }, 105)).toBe("before");
    expect(sideRowSide({ top: 100, height: 20 }, 115)).toBe("after");
  });

  it("drops after the tab above, or after the hovered tab in the lower half", () => {
    expect(resolveSideRowDrop(row("t3", "t2"), "before", workspaces)).toBe("tab-insert:t2:after");
    expect(resolveSideRowDrop(row("t3", "t2"), "after", workspaces)).toBe("tab-insert:t3:after");
  });

  it("drops at the start of the first pane above the first row", () => {
    expect(resolveSideRowDrop(row("t1", null), "before", workspaces)).toBe("pane-index:pa1:0");
    expect(resolveSideRowDrop({ ...row("t1", null), workspaceId: "nope" }, "before", workspaces)).toBeNull();
  });
});

describe("dragged tab id", () => {
  it("strips the sidebar row prefix so a row drag matches the tab id", () => {
    expect(draggedId(sidebarTabDragId("tab-1"))).toBe("tab-1");
    expect(draggedId("tab-1")).toBe("tab-1");
    expect(draggedId("file:/a")).toBe("file:/a");
  });
});

describe("tabDropRoute", () => {
  it("prefers a sidebar row over a workspace over a pane zone", () => {
    expect(tabDropRoute({ isTabDrag: true, overSideRow: true, barWorkspaceId: "w" })).toBe("side-row");
    expect(tabDropRoute({ isTabDrag: true, overSideRow: false, barWorkspaceId: "w" })).toBe("workspace");
    expect(tabDropRoute({ isTabDrag: true, overSideRow: false, barWorkspaceId: null })).toBe("zone");
  });

  it("sends non-tab drags to the zone handlers", () => {
    expect(tabDropRoute({ isTabDrag: false, overSideRow: true, barWorkspaceId: "w" })).toBe("zone");
  });
});
