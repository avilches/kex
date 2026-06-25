import { describe, expect, it } from "vitest";
import { buildEditorPathBreadcrumb } from "./editorPathBreadcrumb";

describe("buildEditorPathBreadcrumb", () => {
  it("marks ancestors, root and descendants for a file inside the workspace", () => {
    const { segments, fileName } = buildEditorPathBreadcrumb(
      "/Users/foo/projects/myapp/src/index.ts",
      "/Users/foo/projects/myapp",
      "/Users/foo",
    );
    expect(fileName).toBe("index.ts");
    expect(segments.map((s) => [s.fullPath, s.relation])).toEqual([
      ["/Users/foo", "above-root"],
      ["/Users/foo/projects", "above-root"],
      ["/Users/foo/projects/myapp", "root"],
      ["/Users/foo/projects/myapp/src", "inside-root"],
    ]);
  });

  it("marks the root when the file sits directly in it", () => {
    const { segments, fileName } = buildEditorPathBreadcrumb(
      "/Users/foo/projects/myapp/README.md",
      "/Users/foo/projects/myapp",
      "/Users/foo",
    );
    expect(fileName).toBe("README.md");
    expect(segments.map((s) => s.relation)).toEqual([
      "above-root",
      "above-root",
      "root",
    ]);
    expect(segments[2].fullPath).toBe("/Users/foo/projects/myapp");
  });

  it("leaves every segment neutral when there is no workspace root", () => {
    const { segments } = buildEditorPathBreadcrumb(
      "/Users/foo/projects/myapp/src/index.ts",
      null,
      "/Users/foo",
    );
    expect(segments.every((s) => s.relation === "inside-root")).toBe(true);
  });

  it("leaves every segment neutral when the file is outside the workspace root", () => {
    const { segments } = buildEditorPathBreadcrumb(
      "/etc/hosts",
      "/Users/foo/projects/myapp",
      "/Users/foo",
    );
    expect(segments.every((s) => s.relation === "inside-root")).toBe(true);
  });

  it("collapses home to ~ and keeps its segment clickable", () => {
    const { segments } = buildEditorPathBreadcrumb(
      "/Users/foo/notes/todo.txt",
      null,
      "/Users/foo",
    );
    expect(segments[0]).toEqual({
      label: "~",
      fullPath: "/Users/foo",
      isHome: true,
      relation: "inside-root",
    });
    expect(segments[1].label).toBe("notes");
  });

  it("marks home as root when home is the workspace root", () => {
    const { segments } = buildEditorPathBreadcrumb(
      "/Users/foo/index.ts",
      "/Users/foo",
      "/Users/foo",
    );
    expect(segments).toHaveLength(1);
    expect(segments[0].isHome).toBe(true);
    expect(segments[0].relation).toBe("root");
  });

  it("handles Windows backslash paths and a backslash workspace root", () => {
    const { segments, fileName } = buildEditorPathBreadcrumb(
      "C:\\Users\\foo\\app\\src\\main.ts",
      "C:\\Users\\foo\\app",
      "C:\\Users\\foo",
    );
    expect(fileName).toBe("main.ts");
    expect(segments.map((s) => [s.fullPath, s.relation])).toEqual([
      ["C:/Users/foo", "above-root"],
      ["C:/Users/foo/app", "root"],
      ["C:/Users/foo/app/src", "inside-root"],
    ]);
  });

  it("marks a Windows drive root as an ancestor of a nested workspace root", () => {
    const { segments } = buildEditorPathBreadcrumb(
      "C:/work/proj/file.ts",
      "C:/work/proj",
      null,
    );
    expect(segments[0]).toMatchObject({ label: "C:", relation: "above-root" });
    expect(segments.find((s) => s.fullPath === "C:/work/proj")?.relation).toBe(
      "root",
    );
  });
});
