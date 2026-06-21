import { describe, expect, it } from "vitest";
import { panelFilePath } from "./panelPath";
import type { Panel } from "./types";

describe("panelFilePath", () => {
  it("returns the editor path", () => {
    const p: Panel = {
      id: "1",
      kind: "editor",
      path: "/a/b.ts",
      dirty: false,
      preview: false,
    };
    expect(panelFilePath(p)).toBe("/a/b.ts");
  });

  it("returns the markdown path", () => {
    const p: Panel = { id: "1", kind: "markdown", path: "/a/README.md" };
    expect(panelFilePath(p)).toBe("/a/README.md");
  });

  it("joins repoRoot for a relative git-diff path", () => {
    const p: Panel = {
      id: "1",
      kind: "git-diff",
      path: "src/x.ts",
      repoRoot: "/repo",
      mode: "+",
      originalPath: null,
    };
    expect(panelFilePath(p)).toBe("/repo/src/x.ts");
  });

  it("keeps an absolute git-diff path", () => {
    const p: Panel = {
      id: "1",
      kind: "git-diff",
      path: "/repo/src/x.ts",
      repoRoot: "/repo",
      mode: "+",
      originalPath: null,
    };
    expect(panelFilePath(p)).toBe("/repo/src/x.ts");
  });

  it("joins repoRoot for a git-commit-file path", () => {
    const p: Panel = {
      id: "1",
      kind: "git-commit-file",
      path: "src/x.ts",
      repoRoot: "/repo",
      sha: "abc",
      originalPath: null,
    };
    expect(panelFilePath(p)).toBe("/repo/src/x.ts");
  });

  it("returns null for terminal panels", () => {
    const p: Panel = { id: "1", kind: "terminal" };
    expect(panelFilePath(p)).toBeNull();
  });

  it("returns null for browser and git-history panels", () => {
    expect(panelFilePath({ id: "1", kind: "browser", url: "x" })).toBeNull();
    expect(
      panelFilePath({ id: "1", kind: "git-history", repoRoot: "/r" }),
    ).toBeNull();
  });
});
