import { describe, expect, it } from "vitest";
import type { PaneNode, SplitNode } from "@/modules/workspaces/lib/types";
import { visibleTerminalPanels } from "./visibleTerminals";

function pane(id: string, tabs: PaneNode["tabs"], activeTabId: string | null): PaneNode {
  return { kind: "pane", id, tabs, activeTabId };
}

describe("visibleTerminalPanels", () => {
  it("returns the active panel of each pane when it is a terminal", () => {
    const tree: SplitNode = {
      kind: "split",
      id: "s1",
      orientation: "horizontal",
      dividerPosition: 0.5,
      first: pane("p1", [{ id: "t1", kind: "terminal" }], "t1"),
      second: pane("p2", [{ id: "e1", kind: "editor", path: "/a.ts", dirty: false, preview: false }], "e1"),
    };
    expect(visibleTerminalPanels(tree)).toEqual([{ tabId: "t1" }]);
  });

  it("ignores non-active terminals and panes with no active panel", () => {
    const tree: SplitNode = pane(
      "p1",
      [
        { id: "t1", kind: "terminal" },
        { id: "t2", kind: "terminal" },
      ],
      "t2",
    );
    expect(visibleTerminalPanels(tree)).toEqual([{ tabId: "t2" }]);

    const empty: SplitNode = pane("p2", [{ id: "t9", kind: "terminal" }], null);
    expect(visibleTerminalPanels(empty)).toEqual([]);
  });
});
