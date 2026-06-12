import { describe, expect, test } from "vitest";
import {
  allPaneIds,
  findPane,
  findPaneInDirection,
  findPanelPane,
  firstPaneId,
  movePanelBetweenPanes,
  removePaneFromTree,
  siblingPane,
  splitPaneInTree,
  updateDivider,
  updatePane,
  type Rect,
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

  test("collapses split when second child removed", () => {
    const p1 = makePane("p1");
    const p2 = makePane("p2");
    const tree: SplitNode = { kind: "split", id: "s0", orientation: "horizontal", first: p1, second: p2, dividerPosition: 0.5 };
    const result = removePaneFromTree(tree, "p2");
    expect(result).toEqual(p1);
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

  test("finds pane nested inside a split", () => {
    const p1 = makePane("p1");
    const p2 = makePane("p2");
    const tree: SplitNode = { kind: "split", id: "s0", orientation: "horizontal", first: p1, second: p2, dividerPosition: 0.5 };
    expect(findPane(tree, "p2")).toBe(p2);
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

  test("finds panel nested inside a split tree", () => {
    const panel = { id: "panel1", kind: "terminal" as const };
    const pane: PaneNode = { kind: "pane", id: "p2", panels: [panel], activePanelId: "panel1" };
    const tree: SplitNode = { kind: "split", id: "s0", orientation: "horizontal", first: makePane("p1"), second: pane, dividerPosition: 0.5 };
    const result = findPanelPane(tree, "panel1");
    expect(result?.pane).toBe(pane);
    expect(result?.panel).toBe(panel);
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

describe("updateDivider", () => {
  const p1 = makePane("p1");
  const p2 = makePane("p2");
  const tree: SplitNode = { kind: "split", id: "s0", orientation: "horizontal", first: p1, second: p2, dividerPosition: 0.5 };

  test("updates divider position", () => {
    const result = updateDivider(tree, "s0", 0.3);
    expect(result.kind).toBe("split");
    if (result.kind === "split") expect(result.dividerPosition).toBe(0.3);
  });

  test("clamps position to 0.1 minimum", () => {
    const result = updateDivider(tree, "s0", 0);
    if (result.kind === "split") expect(result.dividerPosition).toBe(0.1);
  });

  test("clamps position to 0.9 maximum", () => {
    const result = updateDivider(tree, "s0", 1);
    if (result.kind === "split") expect(result.dividerPosition).toBe(0.9);
  });

  test("returns same reference when split not found", () => {
    expect(updateDivider(tree, "unknown", 0.3)).toBe(tree);
  });

  test("returns same reference when pane (not split) is root", () => {
    const pane = makePane("p1");
    expect(updateDivider(pane, "s0", 0.3)).toBe(pane);
  });

  test("returns same reference when position unchanged", () => {
    const result = updateDivider(tree, "s0", 0.5);
    expect(result).toBe(tree);
  });
});

describe("splitPaneInTree with newPanePosition", () => {
  test("places new pane as first when newPanePosition='first'", () => {
    const tree = makePane("p1");
    const result = splitPaneInTree(tree, "p1", "s1", "p2", "horizontal", "first");
    expect(result.kind).toBe("split");
    if (result.kind === "split") {
      expect(result.first).toEqual(makePane("p2"));
      expect(result.second).toEqual(tree);
    }
  });

  test("places new pane as second by default (backward compat)", () => {
    const tree = makePane("p1");
    const result = splitPaneInTree(tree, "p1", "s1", "p2", "horizontal");
    if (result.kind === "split") {
      expect(result.first).toEqual(tree);
      expect(result.second).toEqual(makePane("p2"));
    }
  });
});

describe("movePanelBetweenPanes", () => {
  test("moves panel from source pane to target pane, collapses empty source", () => {
    const panel1 = { id: "panel1", kind: "terminal" as const };
    const panel2 = { id: "panel2", kind: "terminal" as const };
    const pane1: PaneNode = { kind: "pane", id: "p1", panels: [panel1], activePanelId: "panel1" };
    const pane2: PaneNode = { kind: "pane", id: "p2", panels: [panel2], activePanelId: "panel2" };
    const tree: SplitNode = { kind: "split", id: "s0", orientation: "horizontal", first: pane1, second: pane2, dividerPosition: 0.5 };

    const result = movePanelBetweenPanes(tree, "panel1", "p2");
    // Source pane (p1) had only 1 panel — it should be collapsed
    expect(result.kind).toBe("pane");
    if (result.kind === "pane") {
      expect(result.id).toBe("p2");
      expect(result.panels).toHaveLength(2);
      expect(result.panels[1]?.id).toBe("panel1");
      expect(result.activePanelId).toBe("panel1");
    }
  });

  test("source pane stays when it has remaining panels", () => {
    const panel1 = { id: "panel1", kind: "terminal" as const };
    const panel2 = { id: "panel2", kind: "terminal" as const };
    const panel3 = { id: "panel3", kind: "terminal" as const };
    const pane1: PaneNode = { kind: "pane", id: "p1", panels: [panel1, panel2], activePanelId: "panel1" };
    const pane2: PaneNode = { kind: "pane", id: "p2", panels: [panel3], activePanelId: "panel3" };
    const tree: SplitNode = { kind: "split", id: "s0", orientation: "horizontal", first: pane1, second: pane2, dividerPosition: 0.5 };

    const result = movePanelBetweenPanes(tree, "panel2", "p2");
    expect(result.kind).toBe("split");
    if (result.kind === "split") {
      const newP1 = result.first as PaneNode;
      const newP2 = result.second as PaneNode;
      expect(newP1.panels).toHaveLength(1);
      expect(newP2.panels).toHaveLength(2);
    }
  });

  test("inserts at specified index", () => {
    const panel1 = { id: "panel1", kind: "terminal" as const };
    const panel2 = { id: "panel2", kind: "terminal" as const };
    const panel3 = { id: "panel3", kind: "terminal" as const };
    const pane1: PaneNode = { kind: "pane", id: "p1", panels: [panel1, panel2], activePanelId: "panel1" };
    const pane2: PaneNode = { kind: "pane", id: "p2", panels: [panel3], activePanelId: "panel3" };
    const tree: SplitNode = { kind: "split", id: "s0", orientation: "horizontal", first: pane1, second: pane2, dividerPosition: 0.5 };

    const result = movePanelBetweenPanes(tree, "panel1", "p2", 0);
    if (result.kind === "split") {
      const newP2 = result.second as PaneNode;
      expect(newP2.panels[0]?.id).toBe("panel1");
    }
  });

  test("returns same tree if source and target pane are the same", () => {
    const panel1 = { id: "panel1", kind: "terminal" as const };
    const pane: PaneNode = { kind: "pane", id: "p1", panels: [panel1], activePanelId: "panel1" };
    expect(movePanelBetweenPanes(pane, "panel1", "p1")).toBe(pane);
  });

  test("returns same tree if panel not found", () => {
    const pane: PaneNode = { kind: "pane", id: "p1", panels: [], activePanelId: null };
    expect(movePanelBetweenPanes(pane, "unknown", "p1")).toBe(pane);
  });
});

describe("movePanelBetweenPanes with targetIndex", () => {
  function makeFilledPane(id: string, panelIds: string[]): PaneNode {
    return {
      kind: "pane",
      id,
      panels: panelIds.map((pid) => ({ id: pid, kind: "terminal" as const })),
      activePanelId: panelIds[0] ?? null,
    };
  }

  test("inserts panel at index 0 (beginning of target pane)", () => {
    const p1 = makeFilledPane("p1", ["a", "b"]);
    const p2 = makeFilledPane("p2", ["c", "d"]);
    const tree: SplitNode = {
      kind: "split",
      id: "s0",
      orientation: "horizontal",
      first: p1,
      second: p2,
      dividerPosition: 0.5,
    };
    const result = movePanelBetweenPanes(tree, "a", "p2", 0);
    expect(result.kind).toBe("split");
    if (result.kind === "split") {
      const target = result.second as PaneNode;
      expect(target.panels.map((p) => p.id)).toEqual(["a", "c", "d"]);
    }
  });

  test("inserts panel at index 1 (middle of target pane)", () => {
    const p1 = makeFilledPane("p1", ["a", "b"]);
    const p2 = makeFilledPane("p2", ["c", "d"]);
    const tree: SplitNode = {
      kind: "split",
      id: "s0",
      orientation: "horizontal",
      first: p1,
      second: p2,
      dividerPosition: 0.5,
    };
    const result = movePanelBetweenPanes(tree, "a", "p2", 1);
    expect(result.kind).toBe("split");
    if (result.kind === "split") {
      const target = result.second as PaneNode;
      expect(target.panels.map((p) => p.id)).toEqual(["c", "a", "d"]);
    }
  });

  test("inserts panel at end when targetIndex equals target panel count", () => {
    const p1 = makeFilledPane("p1", ["a", "b"]);
    const p2 = makeFilledPane("p2", ["c", "d"]);
    const tree: SplitNode = {
      kind: "split",
      id: "s0",
      orientation: "horizontal",
      first: p1,
      second: p2,
      dividerPosition: 0.5,
    };
    const result = movePanelBetweenPanes(tree, "a", "p2", 2);
    expect(result.kind).toBe("split");
    if (result.kind === "split") {
      const target = result.second as PaneNode;
      expect(target.panels.map((p) => p.id)).toEqual(["c", "d", "a"]);
    }
  });

  test("activates moved panel in target pane", () => {
    const p1 = makeFilledPane("p1", ["a", "b"]);
    const p2 = makeFilledPane("p2", ["c", "d"]);
    const tree: SplitNode = {
      kind: "split",
      id: "s0",
      orientation: "horizontal",
      first: p1,
      second: p2,
      dividerPosition: 0.5,
    };
    const result = movePanelBetweenPanes(tree, "a", "p2", 1);
    if (result.kind === "split") {
      const target = result.second as PaneNode;
      expect(target.activePanelId).toBe("a");
    }
  });
});

// Helper to build a Rect
function r(left: number, top: number, right: number, bottom: number): Rect {
  return { left, top, right, bottom };
}

describe("findPaneInDirection", () => {
  // Layout: p1 (left half) | p2 (right half), full height
  const sideBySide = new Map<string, Rect>([
    ["p1", r(0, 0, 500, 600)],
    ["p2", r(500, 0, 1000, 600)],
  ]);

  test("right: returns p2 from p1", () => {
    expect(findPaneInDirection("p1", "right", sideBySide)).toBe("p2");
  });
  test("left: returns p1 from p2", () => {
    expect(findPaneInDirection("p2", "left", sideBySide)).toBe("p1");
  });
  test("hard stop: right from p2 returns null", () => {
    expect(findPaneInDirection("p2", "right", sideBySide)).toBeNull();
  });
  test("hard stop: up from p1 returns null", () => {
    expect(findPaneInDirection("p1", "up", sideBySide)).toBeNull();
  });

  // Layout: p1 (top half) / p2 (bottom half), full width
  const stacked = new Map<string, Rect>([
    ["p1", r(0, 0, 1000, 300)],
    ["p2", r(0, 300, 1000, 600)],
  ]);

  test("down: returns p2 from p1", () => {
    expect(findPaneInDirection("p1", "down", stacked)).toBe("p2");
  });
  test("up: returns p1 from p2", () => {
    expect(findPaneInDirection("p2", "up", stacked)).toBe("p1");
  });
  test("hard stop: down from p2 returns null", () => {
    expect(findPaneInDirection("p2", "down", stacked)).toBeNull();
  });

  // Layout: p1 (left) | p2 (top-right) / p3 (bottom-right)
  const threePane = new Map<string, Rect>([
    ["p1", r(0, 0, 500, 600)],
    ["p2", r(500, 0, 1000, 300)],
    ["p3", r(500, 300, 1000, 600)],
  ]);

  test("three panes: right from p1 picks p2 or p3 (closest + overlap)", () => {
    const result = findPaneInDirection("p1", "right", threePane);
    expect(["p2", "p3"]).toContain(result);
  });
  test("three panes: left from p2 → p1", () => {
    expect(findPaneInDirection("p2", "left", threePane)).toBe("p1");
  });
  test("three panes: left from p3 → p1", () => {
    expect(findPaneInDirection("p3", "left", threePane)).toBe("p1");
  });
  test("three panes: down from p2 → p3", () => {
    expect(findPaneInDirection("p2", "down", threePane)).toBe("p3");
  });
  test("three panes: up from p3 → p2", () => {
    expect(findPaneInDirection("p3", "up", threePane)).toBe("p2");
  });

  // unknown pane id
  test("returns null when activePaneId not in map", () => {
    expect(findPaneInDirection("ghost", "right", sideBySide)).toBeNull();
  });
});
