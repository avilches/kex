import { describe, expect, it } from "vitest";
import { tabCopyPath, tabFilePath } from "./tabPath";
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
      preview: false,
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
      preview: false,
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
      preview: false,
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

describe("tabCopyPath", () => {
  const terminal: Tab = { id: "1", kind: "terminal", cwd: "/repo" };

  it("copies the shell cwd of a terminal", () => {
    expect(tabCopyPath(terminal, null)).toBe("/repo");
  });

  it("prefers the worktree the agent entered over the shell cwd", () => {
    expect(tabCopyPath(terminal, "/repo/.claude/worktrees/x")).toBe(
      "/repo/.claude/worktrees/x",
    );
  });

  it("has nothing to copy for a terminal without a cwd", () => {
    expect(tabCopyPath({ id: "1", kind: "terminal" }, null)).toBeNull();
  });

  it("copies the file of an editor and of a diff", () => {
    expect(
      tabCopyPath({ id: "1", kind: "editor", path: "/a/b.ts", dirty: false, preview: false }, "/wt"),
    ).toBe("/a/b.ts");
    expect(
      tabCopyPath(
        { id: "1", kind: "git-diff", path: "src/x.ts", repoRoot: "/repo", mode: "+", originalPath: null, preview: false },
        null,
      ),
    ).toBe("/repo/src/x.ts");
  });

  it("has nothing to copy for a browser tab", () => {
    expect(tabCopyPath({ id: "1", kind: "browser", url: "https://a.b" } as Tab, null)).toBeNull();
  });
});
