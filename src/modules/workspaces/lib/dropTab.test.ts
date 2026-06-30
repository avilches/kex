import { describe, expect, it } from "vitest";
import { tabForDroppedPath } from "./dropTab";

describe("tabForDroppedPath", () => {
  it("opens a terminal at the dropped folder cwd", () => {
    const tab = tabForDroppedPath("/home/user/project", true);
    expect(tab.kind).toBe("terminal");
    expect(tab).toMatchObject({ kind: "terminal", cwd: "/home/user/project" });
  });

  it("opens an editor for a dropped file", () => {
    const tab = tabForDroppedPath("/home/user/project/main.ts", false);
    expect(tab.kind).toBe("editor");
    expect(tab).toMatchObject({
      kind: "editor",
      path: "/home/user/project/main.ts",
      preview: false,
      dirty: false,
    });
  });

  it("assigns a fresh id to each tab", () => {
    const a = tabForDroppedPath("/a", true);
    const b = tabForDroppedPath("/a", true);
    expect(a.id).not.toBe(b.id);
  });
});
