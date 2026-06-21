import { describe, expect, it } from "vitest";
import { panelForDroppedPath } from "./dropPanel";

describe("panelForDroppedPath", () => {
  it("opens a terminal at the dropped folder cwd", () => {
    const panel = panelForDroppedPath("/home/user/project", true);
    expect(panel.kind).toBe("terminal");
    expect(panel).toMatchObject({ kind: "terminal", cwd: "/home/user/project" });
  });

  it("opens an editor for a dropped file", () => {
    const panel = panelForDroppedPath("/home/user/project/main.ts", false);
    expect(panel.kind).toBe("editor");
    expect(panel).toMatchObject({
      kind: "editor",
      path: "/home/user/project/main.ts",
      preview: false,
      dirty: false,
    });
  });

  it("assigns a fresh id to each panel", () => {
    const a = panelForDroppedPath("/a", true);
    const b = panelForDroppedPath("/a", true);
    expect(a.id).not.toBe(b.id);
  });
});
