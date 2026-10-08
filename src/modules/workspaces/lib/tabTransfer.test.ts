import { describe, expect, it } from "vitest";
import { attachTab, workspaceForTab, workspaceTitleFromCwd } from "./tabTransfer";
import type { PaneNode, Tab, Workspace } from "./types";

const tab = (id: string, extra: Partial<Extract<Tab, { kind: "terminal" }>> = {}): Tab => ({
  id,
  kind: "terminal",
  ...extra,
});

const pane = (id: string, tabs: Tab[], activeTabId: string | null = tabs[0]?.id ?? null): PaneNode => ({
  kind: "pane",
  id,
  tabs,
  activeTabId,
});

const wsWith = (over: Partial<Workspace> = {}): Workspace => ({
  id: "w2",
  title: "W2",
  paneTree: pane("p1", [tab("a")]),
  activePaneId: "p1",
  ...over,
});

const moved = tab("moved");

describe("workspaceTitleFromCwd", () => {
  it("uses the last path segment", () => {
    expect(workspaceTitleFromCwd("/Users/me/Hub/Kex")).toBe("Kex");
    expect(workspaceTitleFromCwd("C:\\Users\\me\\proj")).toBe("proj");
  });

  it("falls back to shell without a cwd", () => {
    expect(workspaceTitleFromCwd(undefined)).toBe("shell");
    expect(workspaceTitleFromCwd("/")).toBe("shell");
  });
});

describe("attachTab with a pane placement", () => {
  it("appends to the end and activates the tab and its pane", () => {
    const out = attachTab(wsWith(), moved, { kind: "pane", paneId: "p1" }, 8)!;
    const p = out.paneTree as PaneNode;
    expect(p.tabs.map((t) => t.id)).toEqual(["a", "moved"]);
    expect(p.activeTabId).toBe("moved");
    expect(out.activePaneId).toBe("p1");
  });

  it("inserts at the given index, clamped to the tab count", () => {
    const first = attachTab(wsWith(), moved, { kind: "pane", paneId: "p1", index: 0 }, 8)!;
    expect((first.paneTree as PaneNode).tabs.map((t) => t.id)).toEqual(["moved", "a"]);
    const clamped = attachTab(wsWith(), moved, { kind: "pane", paneId: "p1", index: 99 }, 8)!;
    expect((clamped.paneTree as PaneNode).tabs.map((t) => t.id)).toEqual(["a", "moved"]);
  });

  it("returns null when the pane does not exist", () => {
    expect(attachTab(wsWith(), moved, { kind: "pane", paneId: "nope" }, 8)).toBeNull();
  });
});

describe("attachTab with a split placement", () => {
  const placement = { kind: "split", paneId: "p1", direction: "left", splitId: "s1", newPaneId: "p9" } as const;

  it("splits the pane and puts the tab in the new half", () => {
    const out = attachTab(wsWith(), moved, placement, 8)!;
    expect(out.paneTree.kind).toBe("split");
    if (out.paneTree.kind !== "split") return;
    expect(out.paneTree.orientation).toBe("horizontal");
    expect((out.paneTree.first as PaneNode).id).toBe("p9");
    expect((out.paneTree.first as PaneNode).tabs.map((t) => t.id)).toEqual(["moved"]);
    expect(out.activePaneId).toBe("p9");
  });

  it("returns null when the pane limit is already reached", () => {
    expect(attachTab(wsWith(), moved, placement, 1)).toBeNull();
  });

  it("returns null when the pane does not exist", () => {
    expect(attachTab(wsWith(), moved, { ...placement, paneId: "nope" }, 8)).toBeNull();
  });
});

describe("attachTab with the auto placement", () => {
  const auto = { kind: "auto", splitId: "s1", newPaneId: "p9" } as const;

  it("splits a single pane that already has tabs and uses the right half", () => {
    const out = attachTab(wsWith(), moved, auto, 8)!;
    expect(out.paneTree.kind).toBe("split");
    if (out.paneTree.kind !== "split") return;
    expect(out.paneTree.orientation).toBe("horizontal");
    expect((out.paneTree.first as PaneNode).tabs.map((t) => t.id)).toEqual(["a"]);
    expect((out.paneTree.second as PaneNode).id).toBe("p9");
    expect((out.paneTree.second as PaneNode).tabs.map((t) => t.id)).toEqual(["moved"]);
    expect(out.activePaneId).toBe("p9");
  });

  it("uses a single empty pane without splitting it", () => {
    const out = attachTab(wsWith({ paneTree: pane("p1", []) }), moved, auto, 8)!;
    expect(out.paneTree.kind).toBe("pane");
    expect((out.paneTree as PaneNode).tabs.map((t) => t.id)).toEqual(["moved"]);
  });

  it("does not split a single pane when the limit leaves no room", () => {
    const out = attachTab(wsWith(), moved, auto, 1)!;
    expect(out.paneTree.kind).toBe("pane");
    expect((out.paneTree as PaneNode).tabs.map((t) => t.id)).toEqual(["a", "moved"]);
  });

  it("adds to the active pane of a workspace that is already split", () => {
    const split: Workspace = wsWith({
      paneTree: {
        kind: "split",
        id: "s0",
        orientation: "horizontal",
        dividerPosition: 0.5,
        first: pane("p1", [tab("a")]),
        second: pane("p2", [tab("b")]),
      },
      activePaneId: "p2",
    });
    const out = attachTab(split, moved, auto, 8)!;
    if (out.paneTree.kind !== "split") throw new Error("expected split");
    expect((out.paneTree.first as PaneNode).tabs.map((t) => t.id)).toEqual(["a"]);
    expect((out.paneTree.second as PaneNode).tabs.map((t) => t.id)).toEqual(["b", "moved"]);
    expect(out.activePaneId).toBe("p2");
  });

  it("falls back to the first pane when activePaneId is stale", () => {
    const split: Workspace = wsWith({
      paneTree: {
        kind: "split",
        id: "s0",
        orientation: "vertical",
        dividerPosition: 0.5,
        first: pane("p1", [tab("a")]),
        second: pane("p2", [tab("b")]),
      },
      activePaneId: "gone",
    });
    const out = attachTab(split, moved, auto, 8)!;
    if (out.paneTree.kind !== "split") throw new Error("expected split");
    expect((out.paneTree.first as PaneNode).tabs.map((t) => t.id)).toEqual(["a", "moved"]);
  });
});

describe("workspaceForTab", () => {
  it("builds a workspace with the tab as its only tab, titled after the terminal cwd", () => {
    const ws = workspaceForTab(tab("t", { cwd: "/Users/me/proj" }), { workspaceId: "w9", paneId: "p9" }, null);
    expect(ws).toMatchObject({ id: "w9", title: "proj", cwd: "/Users/me/proj", color: null, activePaneId: "p9" });
    expect(ws.paneTree).toEqual(pane("p9", [tab("t", { cwd: "/Users/me/proj" })], "t"));
  });

  it("uses shell and no cwd for a tab without a terminal cwd", () => {
    const ws = workspaceForTab(
      { id: "e", kind: "editor", path: "/x/y.ts", dirty: false, preview: false },
      { workspaceId: "w9", paneId: "p9" },
      undefined,
    );
    expect(ws.title).toBe("shell");
    expect(ws.cwd).toBeUndefined();
    expect(ws.color).toBeUndefined();
  });
});
