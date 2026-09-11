import { describe, expect, it } from "vitest";
import { isLiveWorkingSource } from "./GitDiffPane";

describe("isLiveWorkingSource", () => {
  it("is true for an unstaged working diff, whose modified side reads the file straight off disk", () => {
    expect(
      isLiveWorkingSource({
        kind: "working",
        repoRoot: "/repo",
        path: "a.ts",
        mode: "-",
        originalPath: null,
      }),
    ).toBe(true);
  });

  it("is false for a staged working diff, whose modified side reads the git index instead of disk", () => {
    expect(
      isLiveWorkingSource({
        kind: "working",
        repoRoot: "/repo",
        path: "a.ts",
        mode: "+",
        originalPath: null,
      }),
    ).toBe(false);
  });

  it("is false for a commit diff, which is pinned to a sha and never goes stale", () => {
    expect(
      isLiveWorkingSource({
        kind: "commit",
        repoRoot: "/repo",
        sha: "abc123",
        path: "a.ts",
        originalPath: null,
      }),
    ).toBe(false);
  });
});
