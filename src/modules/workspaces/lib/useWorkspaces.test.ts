import { describe, expect, it } from "vitest";
import type { Panel, SplitNode, Workspace } from "./types";
import { applyClosePanel, applyExplorerRootMode, applyFsRoot, applyPinnedRoot } from "./useWorkspaces";

const ws = (over: Partial<Workspace> = {}): Workspace => ({
  id: "w1",
  title: "W",
  paneTree: { kind: "pane", id: "p1", panels: [], activePanelId: null },
  activePaneId: "p1",
  ...over,
});

describe("applyExplorerRootMode", () => {
  it("sets the mode on the matching workspace only", () => {
    const out = applyExplorerRootMode([ws(), ws({ id: "w2" })], "w1", "filesystem");
    expect(out[0].explorerRootMode).toBe("filesystem");
    expect(out[1].explorerRootMode).toBeUndefined();
  });
});

describe("applyPinnedRoot", () => {
  it("sets pinnedRoot and switches mode to pinned", () => {
    const out = applyPinnedRoot([ws()], "w1", "/some/dir");
    expect(out[0].pinnedRoot).toBe("/some/dir");
    expect(out[0].explorerRootMode).toBe("pinned");
  });

  it("strips a trailing slash from the pinned path", () => {
    const out = applyPinnedRoot([ws()], "w1", "/some/dir/");
    expect(out[0].pinnedRoot).toBe("/some/dir");
  });
});

describe("applyFsRoot", () => {
  it("sets fsRoot on the matching workspace only and keeps the mode", () => {
    const out = applyFsRoot([ws(), ws({ id: "w2" })], "w1", "/some/dir");
    expect(out[0].fsRoot).toBe("/some/dir");
    expect(out[0].explorerRootMode).toBeUndefined();
    expect(out[1].fsRoot).toBeUndefined();
  });

  it("strips a trailing slash from fsRoot", () => {
    const out = applyFsRoot([ws()], "w1", "/some/dir/");
    expect(out[0].fsRoot).toBe("/some/dir");
  });

  it("keeps the root slash for the filesystem root", () => {
    const out = applyFsRoot([ws()], "w1", "/");
    expect(out[0].fsRoot).toBe("/");
  });
});

describe("applyClosePanel", () => {
  const term = (id: string): Panel => ({ id, kind: "terminal" });

  it("keeps the workspace with an empty pane when the last tab of the only pane closes", () => {
    const w = ws({
      paneTree: { kind: "pane", id: "p1", panels: [term("t1")], activePanelId: "t1" },
      activePaneId: "p1",
    });
    const out = applyClosePanel([w], "w1", "t1");
    expect(out).toHaveLength(1);
    const pane = out[0].paneTree as Extract<SplitNode, { kind: "pane" }>;
    expect(pane.kind).toBe("pane");
    expect(pane.panels).toEqual([]);
    expect(pane.activePanelId).toBeNull();
  });

  it("collapses a pane (keeps the sibling) when its last tab closes inside a split", () => {
    const w = ws({
      paneTree: {
        kind: "split",
        id: "s1",
        orientation: "horizontal",
        dividerPosition: 0.5,
        first: { kind: "pane", id: "p1", panels: [term("t1")], activePanelId: "t1" },
        second: { kind: "pane", id: "p2", panels: [term("t2")], activePanelId: "t2" },
      },
      activePaneId: "p1",
    });
    const out = applyClosePanel([w], "w1", "t1");
    expect(out).toHaveLength(1);
    const tree = out[0].paneTree as Extract<SplitNode, { kind: "pane" }>;
    expect(tree.kind).toBe("pane");
    expect(tree.id).toBe("p2");
    expect(out[0].activePaneId).toBe("p2");
  });

  it("keeps remaining tabs and reselects the neighbour when a non-last tab closes", () => {
    const w = ws({
      paneTree: { kind: "pane", id: "p1", panels: [term("t1"), term("t2"), term("t3")], activePanelId: "t2" },
      activePaneId: "p1",
    });
    const out = applyClosePanel([w], "w1", "t2");
    const pane = out[0].paneTree as Extract<SplitNode, { kind: "pane" }>;
    expect(pane.panels.map((p) => p.id)).toEqual(["t1", "t3"]);
    expect(pane.activePanelId).toBe("t3");
  });
});
