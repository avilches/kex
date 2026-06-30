import { describe, expect, it } from "vitest";
import { tabFilePath } from "./tabPath";
import type { Tab } from "./types";

describe("tabFilePath", () => {
  it("returns the editor path", () => {
    const p: Tab = {
      id: "1",
      kind: "editor",
      path: "/a/b.ts",
      dirty: false,
      preview: false,
    };
    expect(tabFilePath(p)).toBe("/a/b.ts");
  });

  it("returns the markdown path", () => {
    const p: Tab = { id: "1", kind: "markdown", path: "/a/README.md" };
    expect(tabFilePath(p)).toBe("/a/README.md");
  });

  it("joins repoRoot for a relative git-diff path", () => {
    const p: Tab = {
      id: "1",
      kind: "git-diff",
      path: "src/x.ts",
      repoRoot: "/repo",
      mode: "+",
      originalPath: null,
    };
    expect(tabFilePath(p)).toBe("/repo/src/x.ts");
  });

  it("keeps an absolute git-diff path", () => {
    const p: Tab = {
      id: "1",
      kind: "git-diff",
      path: "/repo/src/x.ts",
      repoRoot: "/repo",
      mode: "+",
      originalPath: null,
    };
    expect(tabFilePath(p)).toBe("/repo/src/x.ts");
  });

  it("joins repoRoot for a git-commit-file path", () => {
    const p: Tab = {
      id: "1",
      kind: "git-commit-file",
      path: "src/x.ts",
      repoRoot: "/repo",
      sha: "abc",
      originalPath: null,
    };
    expect(tabFilePath(p)).toBe("/repo/src/x.ts");
  });

  it("returns null for terminal tabs", () => {
    const p: Tab = { id: "1", kind: "terminal" };
    expect(tabFilePath(p)).toBeNull();
  });

  it("returns null for browser and git-history tabs", () => {
    expect(tabFilePath({ id: "1", kind: "browser", url: "x" })).toBeNull();
    expect(
      tabFilePath({ id: "1", kind: "git-history", repoRoot: "/r" }),
    ).toBeNull();
  });
});
