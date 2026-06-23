import { describe, expect, it } from "vitest";
import { removedChildDirs } from "./treePrune";

describe("removedChildDirs", () => {
  const parent = "/Users/x/proj";

  it("removes a visible child that is gone from the listing", () => {
    const live = new Set<string>(); // listing no longer contains it
    const out = removedChildDirs(parent, live, [`${parent}/old`], false);
    expect(out).toEqual([`${parent}/old`]);
  });

  it("keeps a child that is still in the listing", () => {
    const live = new Set([`${parent}/keep`]);
    const out = removedChildDirs(parent, live, [`${parent}/keep`], false);
    expect(out).toEqual([]);
  });

  it("never prunes a dot-prefixed child when hidden files are off", () => {
    // The listing was taken with hidden files OFF, so it omits .hidden without
    // implying it was deleted. Pruning it would be wrong.
    const live = new Set<string>();
    const out = removedChildDirs(parent, live, [`${parent}/.hidden`], false);
    expect(out).toEqual([]);
  });

  it("does prune a dot-prefixed child when hidden files are on and it is gone", () => {
    const live = new Set<string>();
    const out = removedChildDirs(parent, live, [`${parent}/.hidden`], true);
    expect(out).toEqual([`${parent}/.hidden`]);
  });

  it("never prunes the explorer root when the root itself is hidden", () => {
    // The explorer is rooted at a hidden folder; a refresh of its parent (taken
    // with hidden files off) omits it, but it must not be deleted or the tree
    // blanks out and the ".." row disappears.
    const repo = "/Users/x/proj";
    const root = `${repo}/.claude`;
    const nodeKeys = [root, `${root}/worktrees`, `${repo}/visible`];
    const live = new Set([`${repo}/visible`]); // hidden listing omits .claude
    const out = removedChildDirs(repo, live, nodeKeys, false);
    expect(out).not.toContain(root);
    expect(out).toEqual([]);
  });

  it("only considers direct children of the listed parent", () => {
    const live = new Set<string>();
    const grandchild = `${parent}/keep/deep`;
    const out = removedChildDirs(parent, live, [grandchild], false);
    expect(out).toEqual([]);
  });
});
