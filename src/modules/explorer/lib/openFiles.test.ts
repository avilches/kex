import { describe, expect, it } from "vitest";
import type { SplitNode, Tab } from "@/modules/workspaces/lib/types";
import { openFilePaths } from "./openFiles";

const pane = (id: string, tabs: Tab[]): SplitNode =>
  ({ kind: "pane", id, tabs, activeTabId: tabs[0]?.id ?? null }) as SplitNode;

describe("openFilePaths", () => {
  it("is empty without a tree", () => {
    expect(openFilePaths(null).size).toBe(0);
  });

  it("collects editor and markdown paths from every pane, ignoring other kinds", () => {
    const tree = {
      kind: "split",
      id: "s",
      direction: "horizontal",
      position: 50,
      first: pane("p1", [
        { id: "t1", kind: "editor", path: "/a/b.ts", dirty: false, preview: false },
        { id: "t2", kind: "terminal", cwd: "/a" },
      ] as Tab[]),
      second: pane("p2", [
        { id: "t3", kind: "markdown", path: "C:\\x\\n.md" },
        { id: "t4", kind: "git-diff", path: "/a/c.ts", repoRoot: "/a" },
      ] as Tab[]),
    } as unknown as SplitNode;
    expect([...openFilePaths(tree)].sort()).toEqual([
      ["/a/b.ts", false],
      ["C:/x/n.md", false],
    ]);
  });

  it("flags a file as preview only when every tab showing it is a preview", () => {
    const tree = pane("p", [
      { id: "t1", kind: "editor", path: "/a/p.ts", dirty: false, preview: true },
      { id: "t2", kind: "markdown", path: "/a/m.md", preview: true },
      { id: "t3", kind: "editor", path: "/a/both.ts", dirty: false, preview: true },
      { id: "t4", kind: "editor", path: "/a/both.ts", dirty: false, preview: false },
    ] as Tab[]);
    const got = openFilePaths(tree);
    expect(got.get("/a/p.ts")).toBe(true);
    expect(got.get("/a/m.md")).toBe(true);
    expect(got.get("/a/both.ts")).toBe(false);
  });
});
