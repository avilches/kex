import { describe, expect, it } from "vitest";
import { tabForDroppedPath } from "./dropPanel";

describe("tabForDroppedPath", () => {
  it("opens a terminal at the dropped folder cwd", () => {
    const panel = tabForDroppedPath("/home/user/project", true);
    expect(panel.kind).toBe("terminal");
    expect(panel).toMatchObject({ kind: "terminal", cwd: "/home/user/project" });
  });

  it("opens an editor for a dropped file", () => {
    const panel = tabForDroppedPath("/home/user/project/main.ts", false);
    expect(panel.kind).toBe("editor");
    expect(panel).toMatchObject({
      kind: "editor",
      path: "/home/user/project/main.ts",
      preview: false,
      dirty: false,
    });
  });

  it("assigns a fresh id to each panel", () => {
    const a = tabForDroppedPath("/a", true);
    const b = tabForDroppedPath("/a", true);
    expect(a.id).not.toBe(b.id);
  });
});
