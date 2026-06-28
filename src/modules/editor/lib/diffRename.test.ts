import { describe, expect, it } from "vitest";
import { diffRenameLabel, joinRepoPath } from "./diffRename";

describe("diffRenameLabel", () => {
  it("returns null when there is no rename", () => {
    expect(diffRenameLabel("src/a.ts", null)).toBeNull();
    expect(diffRenameLabel("src/a.ts", "src/a.ts")).toBeNull();
  });

  it("returns the old basename for a forward-slash rename", () => {
    expect(diffRenameLabel("src/new.ts", "src/old.ts")).toBe("old.ts");
  });

  it("returns the old basename for a backslash rename", () => {
    expect(diffRenameLabel("src\\new.ts", "src\\sub\\old.ts")).toBe("old.ts");
  });
});

describe("joinRepoPath", () => {
  it("joins a posix absolute repoRoot with a relative pathspec", () => {
    expect(joinRepoPath("/home/u/repo", "src/foo.ts")).toBe(
      "/home/u/repo/src/foo.ts",
    );
  });

  it("preserves the leading slash and normalizes separators", () => {
    expect(joinRepoPath("/home/u/repo/", "/src/foo.ts")).toBe(
      "/home/u/repo/src/foo.ts",
    );
  });

  it("joins a windows drive-letter repoRoot with a backslash pathspec", () => {
    expect(joinRepoPath("C:\\Users\\u\\repo", "src\\foo.ts")).toBe(
      "C:/Users/u/repo/src/foo.ts",
    );
  });
});
