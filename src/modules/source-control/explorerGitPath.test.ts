import { describe, expect, it } from "vitest";
import { explorerGitPath } from "./explorerGitPath";

const base = { workspaceRoot: "/w", workspaceIsGitRepo: true, explorerRoot: "/w", sourceControlPath: "/w" };

describe("explorerGitPath", () => {
  it("needs nothing of its own while the explorer shows the folder Source Control reads", () => {
    expect(explorerGitPath(base)).toBeNull();
  });

  it("needs its own repo when the workspace root is a repo and the explorer is elsewhere", () => {
    expect(explorerGitPath({ ...base, explorerRoot: "/w/.claude/worktrees/wt" })).toBe("/w/.claude/worktrees/wt");
    expect(explorerGitPath({ ...base, explorerRoot: "/other/repo" })).toBe("/other/repo");
  });

  it("needs nothing of its own when Source Control already follows the explorer", () => {
    // A workspace whose root is not a repo: Source Control reads the explorer root already.
    expect(
      explorerGitPath({ workspaceRoot: "/w", workspaceIsGitRepo: false, explorerRoot: "/x", sourceControlPath: "/x" }),
    ).toBeNull();
    expect(
      explorerGitPath({ workspaceRoot: null, workspaceIsGitRepo: false, explorerRoot: "/x", sourceControlPath: "/x" }),
    ).toBeNull();
  });

  it("is null without an explorer root", () => {
    expect(explorerGitPath({ ...base, explorerRoot: null })).toBeNull();
  });
});
