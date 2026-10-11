import { describe, expect, it } from "vitest";
import { attachTab, workspaceForTab, workspaceTitleFromCwd } from "./tabTransfer";
import type { PaneNode, SplitNode, Tab, Workspace } from "./types";

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
  const auto = { kind: "auto" } as const;
  const tabsOf = (n: unknown) => (n as PaneNode).tabs.map((t) => t.id);

  it("never splits: a single pane with tabs just receives the tab", () => {
    const out = attachTab(wsWith(), moved, auto, 8)!;
    expect(out.paneTree.kind).toBe("pane");
    expect(tabsOf(out.paneTree)).toEqual(["a", "moved"]);
    expect(out.activePaneId).toBe("p1");
  });

  it("uses a single empty pane", () => {
    const out = attachTab(wsWith({ paneTree: pane("p1", []) }), moved, auto, 8)!;
    expect(tabsOf(out.paneTree)).toEqual(["moved"]);
  });

  it("goes to the right half of a side-by-side split, whatever the active pane", () => {
    const split: Workspace = wsWith({
      paneTree: {
        kind: "split",
        id: "s0",
        orientation: "horizontal",
        dividerPosition: 0.5,
        first: pane("p1", [tab("a")]),
        second: pane("p2", [tab("b")]),
      },
      activePaneId: "p1",
    });
    const out = attachTab(split, moved, auto, 8)!;
    if (out.paneTree.kind !== "split") throw new Error("expected split");
    expect(tabsOf(out.paneTree.first)).toEqual(["a"]);
    expect(tabsOf(out.paneTree.second)).toEqual(["b", "moved"]);
    expect(out.activePaneId).toBe("p2");
  });

  it("goes to the top pane of a stacked split on the right edge", () => {
    const split: Workspace = wsWith({
      paneTree: {
        kind: "split",
        id: "s0",
        orientation: "horizontal",
        dividerPosition: 0.5,
        first: pane("p1", [tab("a")]),
        second: {
          kind: "split",
          id: "s1",
          orientation: "vertical",
          dividerPosition: 0.5,
          first: pane("p2", [tab("b")]),
          second: pane("p3", [tab("c")]),
        },
      },
      activePaneId: "p1",
    });
    const out = attachTab(split, moved, auto, 8)!;
    expect(out.activePaneId).toBe("p2");
    expect(JSON.stringify(out.paneTree)).toContain('"id":"moved"');
    expect(tabsOf((out.paneTree as Extract<SplitNode, { kind: "split" }>).first)).toEqual(["a"]);
  });

  it("ignores the pane limit because it never creates a pane", () => {
    expect(attachTab(wsWith(), moved, auto, 1)).not.toBeNull();
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
