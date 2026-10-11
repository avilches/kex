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
    expect(plan).toEqual({ action: "create", paneId: "p1" });
  });

  it("replaces the active pane's preview diff tab on a single click over a different diff", () => {
    const preview = gitDiff("t1", { path: "src/old.ts", preview: true });
    const panes = [pane("p1", [preview])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-diff", repoRoot: "/repo", path: "src/new.ts", mode: "-" }, false);
    expect(plan).toEqual({ action: "replace", oldTabId: "t1", paneId: "p1" });
  });

  it("does not replace a pinned (non-preview) diff tab", () => {
    const pinned = gitDiff("t1", { path: "src/old.ts", preview: false });
    const panes = [pane("p1", [pinned])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-diff", repoRoot: "/repo", path: "src/new.ts", mode: "-" }, false);
    expect(plan).toEqual({ action: "create", paneId: "p1", index: 1 });
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
    expect(plan).toEqual({ action: "create", paneId: "p1", index: 1 });
    expect(plan.action === "replace" ? plan.oldTabId : null).not.toBe("t1");
  });

  it("finds an exact match in any pane, not just the active one", () => {
    const existing = gitDiff("t1", { preview: false });
    const panes = [pane("p1", []), pane("p2", [existing])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-diff", repoRoot: "/repo", path: "src/a.ts", mode: "-" }, false);
    expect(plan).toEqual({ action: "activate", tabId: "t1", shouldUnpin: false });
  });

  it("recycles the preview diff of the same repo living in another pane", () => {
    const preview = gitDiff("t1", { path: "src/old.ts", preview: true });
    const panes = [pane("p1", []), pane("p2", [preview])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-diff", repoRoot: "/repo", path: "src/new.ts", mode: "-" }, false);
    expect(plan).toEqual({ action: "replace", oldTabId: "t1", paneId: "p2" });
  });

  it("keeps a separate preview per repo", () => {
    const preview = gitDiff("t1", { repoRoot: "/other", path: "src/old.ts", preview: true });
    const panes = [pane("p1", [preview])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-diff", repoRoot: "/repo", path: "src/new.ts", mode: "-" }, false);
    expect(plan).toEqual({ action: "create", paneId: "p1" });
  });

  it("never recycles a pinned diff in another pane", () => {
    const pinned = gitDiff("t1", { path: "src/old.ts", preview: false });
    const panes = [pane("p1", []), pane("p2", [pinned])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-diff", repoRoot: "/repo", path: "src/new.ts", mode: "-" }, false);
    expect(plan).toEqual({ action: "create", paneId: "p2", index: 1 });
  });

  it("never recycles with pin", () => {
    const preview = gitDiff("t1", { path: "src/old.ts", preview: true });
    const panes = [pane("p1", [preview])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-diff", repoRoot: "/repo", path: "src/new.ts", mode: "-" }, true);
    expect(plan).toEqual({ action: "create", paneId: "p1" });
  });

  it("prefers the preview in the active pane when several exist", () => {
    const a = gitDiff("t1", { path: "src/x.ts", preview: true });
    const b = gitDiff("t2", { path: "src/y.ts", preview: true });
    const panes = [pane("p1", [a]), pane("p2", [b])];
    const plan = planDiffTabOpen(panes, "p2", { kind: "git-diff", repoRoot: "/repo", path: "src/new.ts", mode: "-" }, false);
    expect(plan).toEqual({ action: "replace", oldTabId: "t2", paneId: "p2" });
  });

  it("distinguishes staged and unstaged diffs of the same path", () => {
    const staged = gitDiff("t1", { mode: "+", preview: false });
    const panes = [pane("p1", [staged])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-diff", repoRoot: "/repo", path: "src/a.ts", mode: "-" }, false);
    expect(plan).toEqual({ action: "create", paneId: "p1", index: 1 });
  });

  it("shares the preview slot between git-diff and git-commit-file", () => {
    const preview = gitDiff("t1", { preview: true });
    const panes = [pane("p1", [preview])];
    const plan = planDiffTabOpen(panes, "p1", { kind: "git-commit-file", repoRoot: "/repo", sha: "abc123", path: "src/a.ts" }, false);
    expect(plan).toEqual({ action: "replace", oldTabId: "t1", paneId: "p1" });
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
    expect(plan).toEqual({ action: "create", paneId: "p1", index: 1 });
  });

  describe("create position", () => {
    const cand = { kind: "git-diff", repoRoot: "/repo", path: "src/new.ts", mode: "-" } as const;

    it("inserts right after the first pinned diff of the repo in the active pane", () => {
      const panes = [pane("p1", [gitDiff("t1", { path: "src/x.ts" }), commitFile("t2", { path: "src/y.ts" })])];
      expect(planDiffTabOpen(panes, "p1", cand, false)).toEqual({ action: "create", paneId: "p1", index: 1 });
    });

    it("uses the index of the anchor even when it is not the last tab", () => {
      const other = { id: "e1", kind: "editor", path: "/a", dirty: false } as Tab;
      const panes = [pane("p1", [other, gitDiff("t1", { path: "src/x.ts" }), other, other])];
      expect(planDiffTabOpen(panes, "p1", cand, true)).toEqual({ action: "create", paneId: "p1", index: 2 });
    });

    it("finds the anchor in another pane and targets that pane", () => {
      const panes = [pane("p1", []), pane("p2", [gitDiff("t1", { path: "src/x.ts" })])];
      expect(planDiffTabOpen(panes, "p1", cand, false)).toEqual({ action: "create", paneId: "p2", index: 1 });
    });

    it("prefers an anchor in the active pane over one in an earlier pane", () => {
      const panes = [pane("p1", [gitDiff("t1", { path: "src/x.ts" })]), pane("p2", [gitDiff("t2", { path: "src/y.ts" })])];
      expect(planDiffTabOpen(panes, "p2", cand, false)).toEqual({ action: "create", paneId: "p2", index: 1 });
    });

    it("ignores pinned diffs of another repo", () => {
      const panes = [pane("p1", [gitDiff("t1", { repoRoot: "/other", path: "src/x.ts" })])];
      expect(planDiffTabOpen(panes, "p1", cand, false)).toEqual({ action: "create", paneId: "p1" });
    });

    it("a commit-file anchor serves a git-diff candidate and vice versa", () => {
      const a = [pane("p1", [commitFile("t1")])];
      expect(planDiffTabOpen(a, "p1", cand, true)).toEqual({ action: "create", paneId: "p1", index: 1 });
      const b = [pane("p1", [gitDiff("t1", { path: "src/x.ts" })])];
      const c = { kind: "git-commit-file", repoRoot: "/repo", sha: "zzz", path: "src/n.ts" } as const;
      expect(planDiffTabOpen(b, "p1", c, true)).toEqual({ action: "create", paneId: "p1", index: 1 });
    });
  });
});
