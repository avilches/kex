import { describe, expect, it } from "vitest";
import { resolveSourceControlPath } from "./sourceControlPath";

const base = {
  workspaceRoot: "/w/app",
  workspaceIsGitRepo: true,
  explorerRoot: "/elsewhere",
  fallback: "/home",
};

describe("resolveSourceControlPath", () => {
  it("pins to the workspace root when it is inside a git repo", () => {
    expect(resolveSourceControlPath(base)).toBe("/w/app");
  });
  it("uses the explorer root when the workspace root is not a repo", () => {
    expect(resolveSourceControlPath({ ...base, workspaceIsGitRepo: false })).toBe("/elsewhere");
  });
  it("uses the explorer root when there is no workspace root", () => {
    expect(resolveSourceControlPath({ ...base, workspaceRoot: null })).toBe("/elsewhere");
  });
  it("falls back when there is no explorer root either", () => {
    expect(
      resolveSourceControlPath({ ...base, workspaceIsGitRepo: false, explorerRoot: null }),
    ).toBe("/home");
  });
});
