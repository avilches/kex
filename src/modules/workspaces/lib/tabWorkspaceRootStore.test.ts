import { describe, expect, it } from "vitest";
import { getTabWorkspaceRoot, syncTabWorkspaceRoots } from "./tabWorkspaceRootStore";
import type { PaneNode, Workspace } from "./types";

const pane = (id: string, tabIds: string[]): PaneNode => ({
  kind: "pane",
  id,
  tabs: tabIds.map((t) => ({ id: t, kind: "terminal" })),
  activeTabId: tabIds[0] ?? null,
});

const ws = (id: string, root: string | undefined, left: string[], right: string[] = []): Workspace => ({
  id,
  title: "",
  workspaceRoot: root,
  paneTree: {
    kind: "split",
    id: `${id}-s`,
    orientation: "horizontal",
    first: pane(`${id}-a`, left),
    second: pane(`${id}-b`, right),
    dividerPosition: 50,
  },
  activePaneId: `${id}-a`,
});

describe("tabWorkspaceRootStore", () => {
  it("maps every tab of every pane to its workspace root", () => {
    syncTabWorkspaceRoots([ws("w1", "/r1", ["t1"], ["t2"]), ws("w2", undefined, ["t3"])]);
    expect(getTabWorkspaceRoot("t1")).toBe("/r1");
    expect(getTabWorkspaceRoot("t2")).toBe("/r1");
    expect(getTabWorkspaceRoot("t3")).toBeUndefined();
  });

  it("follows a tab moved to another workspace", () => {
    syncTabWorkspaceRoots([ws("w1", "/r1", ["t1"]), ws("w2", "/r2", ["t2"])]);
    expect(getTabWorkspaceRoot("t2")).toBe("/r2");
  });
});
