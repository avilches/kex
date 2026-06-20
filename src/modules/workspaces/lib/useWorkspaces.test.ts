import { describe, expect, it } from "vitest";
import type { Workspace } from "./types";
import { applyExplorerRootMode, applyPinnedRoot } from "./useWorkspaces";

const ws = (over: Partial<Workspace> = {}): Workspace => ({
  id: "w1",
  title: "W",
  paneTree: { kind: "pane", id: "p1", panels: [], activePanelId: null },
  activePaneId: "p1",
  ...over,
});

describe("applyExplorerRootMode", () => {
  it("sets the mode on the matching workspace only", () => {
    const out = applyExplorerRootMode([ws(), ws({ id: "w2" })], "w1", "git");
    expect(out[0].explorerRootMode).toBe("git");
    expect(out[1].explorerRootMode).toBeUndefined();
  });
});

describe("applyPinnedRoot", () => {
  it("sets pinnedRoot and switches mode to pinned", () => {
    const out = applyPinnedRoot([ws()], "w1", "/some/dir");
    expect(out[0].pinnedRoot).toBe("/some/dir");
    expect(out[0].explorerRootMode).toBe("pinned");
  });

  it("strips a trailing slash from the pinned path", () => {
    const out = applyPinnedRoot([ws()], "w1", "/some/dir/");
    expect(out[0].pinnedRoot).toBe("/some/dir");
  });
});
