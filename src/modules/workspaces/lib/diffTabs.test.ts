import { describe, expect, it } from "vitest";
import { planDiffTabOpen } from "./diffTabs";
import type { PaneNode, Tab } from "./types";

function pane(id: string, tabs: Tab[]): PaneNode {
  return { kind: "pane", id, tabs, activeTabId: tabs[0]?.id ?? null };
}

function gitDiff(
  id: string,
  overrides: Partial<Extract<Tab, { kind: "git-diff" }>> = {},
): Tab {
  return {
    id,
    kind: "git-diff",
    path: "src/a.ts",
    repoRoot: "/repo",
    mode: "-",
    originalPath: null,
    preview: false,
    ...overrides,
  };
}

function commitFile(
  id: string,
  overrides: Partial<Extract<Tab, { kind: "git-commit-file" }>> = {},
): Tab {
  return {
    id,
    kind: "git-commit-file",
    path: "src/a.ts",
    repoRoot: "/repo",
    sha: "abc123",
    originalPath: null,
    preview: false,
    ...overrides,
  };
}

describe("planDiffTabOpen", () => {
  it("creates a new tab when nothing matches and there is no preview slot", () => {
    const panes = [pane("p1", [])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-diff", repoRoot: "/repo", path: "src/a.ts", mode: "-" }, false);
    expect(plan).toEqual({ action: "create" });
  });

  it("replaces the active pane's preview diff tab on a single click over a different diff", () => {
    const preview = gitDiff("t1", { path: "src/old.ts", preview: true });
    const panes = [pane("p1", [preview])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-diff", repoRoot: "/repo", path: "src/new.ts", mode: "-" }, false);
    expect(plan).toEqual({ action: "replace", oldTabId: "t1" });
  });

  it("does not replace a pinned (non-preview) diff tab", () => {
    const pinned = gitDiff("t1", { path: "src/old.ts", preview: false });
    const panes = [pane("p1", [pinned])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-diff", repoRoot: "/repo", path: "src/new.ts", mode: "-" }, false);
    expect(plan).toEqual({ action: "create" });
  });

  it("activates the existing tab when the exact same diff is already open", () => {
    const existing = gitDiff("t1", { preview: true });
    const panes = [pane("p1", [existing])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-diff", repoRoot: "/repo", path: "src/a.ts", mode: "-" }, false);
    expect(plan).toEqual({ action: "activate", tabId: "t1", shouldUnpin: false });
  });

  it("unpins the existing preview tab in place when reopened with pin", () => {
    const existing = gitDiff("t1", { preview: true });
    const panes = [pane("p1", [existing])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-diff", repoRoot: "/repo", path: "src/a.ts", mode: "-" }, true);
    expect(plan).toEqual({ action: "activate", tabId: "t1", shouldUnpin: true });
  });

  it("never replaces a diff already pinned, even on a later single click elsewhere", () => {
    const pinned = gitDiff("t1", { preview: false });
    const panes = [pane("p1", [pinned])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-diff", repoRoot: "/repo", path: "src/other.ts", mode: "-" }, false);
    expect(plan).toEqual({ action: "create" });
    expect(plan.action === "replace" ? plan.oldTabId : null).not.toBe("t1");
  });

  it("finds an exact match in any pane, not just the active one", () => {
    const existing = gitDiff("t1", { preview: false });
    const panes = [pane("p1", []), pane("p2", [existing])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-diff", repoRoot: "/repo", path: "src/a.ts", mode: "-" }, false);
    expect(plan).toEqual({ action: "activate", tabId: "t1", shouldUnpin: false });
  });

  it("only reuses the preview slot within the active pane", () => {
    const preview = gitDiff("t1", { path: "src/old.ts", preview: true });
    const panes = [pane("p1", []), pane("p2", [preview])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-diff", repoRoot: "/repo", path: "src/new.ts", mode: "-" }, false);
    expect(plan).toEqual({ action: "create" });
  });

  it("distinguishes staged and unstaged diffs of the same path", () => {
    const staged = gitDiff("t1", { mode: "+", preview: false });
    const panes = [pane("p1", [staged])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-diff", repoRoot: "/repo", path: "src/a.ts", mode: "-" }, false);
    expect(plan).toEqual({ action: "create" });
  });

  it("shares the preview slot between git-diff and git-commit-file", () => {
    const preview = gitDiff("t1", { preview: true });
    const panes = [pane("p1", [preview])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-commit-file", repoRoot: "/repo", sha: "abc123", path: "src/a.ts" }, false);
    expect(plan).toEqual({ action: "replace", oldTabId: "t1" });
  });

  it("matches an existing git-commit-file diff by repo, sha and path", () => {
    const existing = commitFile("t1", { preview: true });
    const panes = [pane("p1", [existing])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-commit-file", repoRoot: "/repo", sha: "abc123", path: "src/a.ts" }, false);
    expect(plan).toEqual({ action: "activate", tabId: "t1", shouldUnpin: false });
  });

  it("treats the same path in a different commit as a different diff", () => {
    const existing = commitFile("t1", { sha: "abc123", preview: false });
    const panes = [pane("p1", [existing])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-commit-file", repoRoot: "/repo", sha: "def456", path: "src/a.ts" }, false);
    expect(plan).toEqual({ action: "create" });
  });
});
