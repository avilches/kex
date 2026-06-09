import { describe, expect, test } from "vitest";
import {
  allPaneIds,
  findPane,
  findPanelPane,
  firstPaneId,
  removePaneFromTree,
  siblingPane,
  splitPaneInTree,
  updatePane,
} from "./splitNode";
import type { PaneNode, SplitNode } from "./types";

function makePane(id: string): PaneNode {
  return { kind: "pane", id, panels: [], activePanelId: null };
}

describe("splitPaneInTree", () => {
  test("wraps single pane in a split", () => {
    const tree = makePane("p1");
    const result = splitPaneInTree(tree, "p1", "s1", "p2", "horizontal");
    expect(result.kind).toBe("split");
    if (result.kind === "split") {
      expect(result.orientation).toBe("horizontal");
      expect(result.first).toEqual(tree);
      expect(result.second).toEqual(makePane("p2"));
      expect(result.dividerPosition).toBe(0.5);
    }
  });

  test("returns same tree if target pane not found", () => {
    const tree = makePane("p1");
    const result = splitPaneInTree(tree, "unknown", "s1", "p2", "horizontal");
    expect(result).toBe(tree);
  });

  test("splits a nested pane correctly", () => {
    const p1 = makePane("p1");
    const p2 = makePane("p2");
    const tree: SplitNode = { kind: "split", id: "s0", orientation: "horizontal", first: p1, second: p2, dividerPosition: 0.5 };
    const result = splitPaneInTree(tree, "p2", "s1", "p3", "vertical");
    expect(result.kind).toBe("split");
    if (result.kind === "split") {
      expect(result.first).toBe(p1);
      expect(result.second.kind).toBe("split");
    }
  });
});

describe("removePaneFromTree", () => {
  test("returns null for single-pane tree", () => {
    expect(removePaneFromTree(makePane("p1"), "p1")).toBeNull();
  });

  test("collapses split when one child removed", () => {
    const p1 = makePane("p1");
    const p2 = makePane("p2");
    const tree: SplitNode = { kind: "split", id: "s0", orientation: "horizontal", first: p1, second: p2, dividerPosition: 0.5 };
    const result = removePaneFromTree(tree, "p1");
    expect(result).toEqual(p2);
  });

  test("returns same tree if pane not found", () => {
    const tree = makePane("p1");
    expect(removePaneFromTree(tree, "unknown")).toBe(tree);
  });
});

describe("findPane", () => {
  test("finds pane in flat tree", () => {
    const p = makePane("p1");
    expect(findPane(p, "p1")).toBe(p);
  });

  test("returns null for unknown id", () => {
    expect(findPane(makePane("p1"), "unknown")).toBeNull();
  });
});

describe("findPanelPane", () => {
  test("finds panel in a pane", () => {
    const panel = { id: "panel1", kind: "terminal" as const, title: "shell" };
    const pane: PaneNode = { kind: "pane", id: "p1", panels: [panel], activePanelId: "panel1" };
    const result = findPanelPane(pane, "panel1");
    expect(result?.panel).toBe(panel);
    expect(result?.pane).toBe(pane);
  });

  test("returns null for unknown panel id", () => {
    expect(findPanelPane(makePane("p1"), "unknown")).toBeNull();
  });
});

describe("siblingPane", () => {
  test("returns second pane when first is target", () => {
    const p1 = makePane("p1");
    const p2 = makePane("p2");
    const tree: SplitNode = { kind: "split", id: "s0", orientation: "horizontal", first: p1, second: p2, dividerPosition: 0.5 };
    expect(siblingPane(tree, "p1")?.id).toBe("p2");
    expect(siblingPane(tree, "p2")?.id).toBe("p1");
  });

  test("returns null for single pane tree", () => {
    expect(siblingPane(makePane("p1"), "p1")).toBeNull();
  });
});

describe("allPaneIds", () => {
  test("returns all pane ids in a split tree", () => {
    const p1 = makePane("p1");
    const p2 = makePane("p2");
    const p3 = makePane("p3");
    const inner: SplitNode = { kind: "split", id: "s1", orientation: "vertical", first: p2, second: p3, dividerPosition: 0.5 };
    const tree: SplitNode = { kind: "split", id: "s0", orientation: "horizontal", first: p1, second: inner, dividerPosition: 0.5 };
    expect(allPaneIds(tree).sort()).toEqual(["p1", "p2", "p3"]);
  });
});

describe("updatePane", () => {
  test("updates target pane", () => {
    const panel = { id: "panel1", kind: "terminal" as const, title: "shell" };
    const pane: PaneNode = { kind: "pane", id: "p1", panels: [], activePanelId: null };
    const result = updatePane(pane, "p1", (p) => ({ ...p, panels: [panel] }));
    if (result.kind === "pane") {
      expect(result.panels).toEqual([panel]);
    }
  });

  test("returns same reference if pane not found", () => {
    const tree = makePane("p1");
    expect(updatePane(tree, "unknown", (p) => p)).toBe(tree);
  });
});

describe("firstPaneId", () => {
  test("returns id of single pane", () => {
    expect(firstPaneId(makePane("p1"))).toBe("p1");
  });

  test("returns leftmost pane id in split tree", () => {
    const p1 = makePane("p1");
    const p2 = makePane("p2");
    const tree: SplitNode = { kind: "split", id: "s0", orientation: "horizontal", first: p1, second: p2, dividerPosition: 0.5 };
    expect(firstPaneId(tree)).toBe("p1");
  });
});
