import { describe, expect, it } from "vitest";
import type { ClosedEntry, Panel, SplitNode, Workspace } from "./types";
import { applyClosePanel, applyExplorerRootMode, applyFsRoot, applyGitConfig, applyPinnedRoot, captureClosedEntry, collectRunningTerminals, findReopenTarget } from "./useWorkspaces";

const ws = (over: Partial<Workspace> = {}): Workspace => ({
  id: "w1",
  title: "W",
  paneTree: { kind: "pane", id: "p1", panels: [], activePanelId: null },
  activePaneId: "p1",
  ...over,
});

describe("applyExplorerRootMode", () => {
  it("sets the mode on the matching workspace only", () => {
    const out = applyExplorerRootMode([ws(), ws({ id: "w2" })], "w1", "filesystem");
    expect(out[0].explorerRootMode).toBe("filesystem");
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

describe("applyFsRoot", () => {
  it("sets fsRoot on the matching workspace only and keeps the mode", () => {
    const out = applyFsRoot([ws(), ws({ id: "w2" })], "w1", "/some/dir");
    expect(out[0].fsRoot).toBe("/some/dir");
    expect(out[0].explorerRootMode).toBeUndefined();
    expect(out[1].fsRoot).toBeUndefined();
  });

  it("strips a trailing slash from fsRoot", () => {
    const out = applyFsRoot([ws()], "w1", "/some/dir/");
    expect(out[0].fsRoot).toBe("/some/dir");
  });

  it("keeps the root slash for the filesystem root", () => {
    const out = applyFsRoot([ws()], "w1", "/");
    expect(out[0].fsRoot).toBe("/");
  });
});

describe("applyGitConfig", () => {
  it("seeds defaults and patches the matching workspace only", () => {
    const out = applyGitConfig([ws(), ws({ id: "w2" })], "w1", {
      pushOnCommit: true,
    });
    expect(out[0].git).toEqual({ commitMessage: "", pushOnCommit: true });
    expect(out[1].git).toBeUndefined();
  });

  it("merges a partial patch over the existing config", () => {
    const out = applyGitConfig(
      [ws({ git: { commitMessage: "wip", pushOnCommit: true } })],
      "w1",
      { commitMessage: "done" },
    );
    expect(out[0].git).toEqual({ commitMessage: "done", pushOnCommit: true });
  });
});

describe("applyClosePanel", () => {
  const term = (id: string): Panel => ({ id, kind: "terminal" });

  it("keeps the workspace with an empty pane when the last tab of the only pane closes", () => {
    const w = ws({
      paneTree: { kind: "pane", id: "p1", panels: [term("t1")], activePanelId: "t1" },
      activePaneId: "p1",
    });
    const out = applyClosePanel([w], "w1", "t1");
    expect(out).toHaveLength(1);
    const pane = out[0].paneTree as Extract<SplitNode, { kind: "pane" }>;
    expect(pane.kind).toBe("pane");
    expect(pane.panels).toEqual([]);
    expect(pane.activePanelId).toBeNull();
  });

  it("collapses a pane (keeps the sibling) when its last tab closes inside a split", () => {
    const w = ws({
      paneTree: {
        kind: "split",
        id: "s1",
        orientation: "horizontal",
        dividerPosition: 0.5,
        first: { kind: "pane", id: "p1", panels: [term("t1")], activePanelId: "t1" },
        second: { kind: "pane", id: "p2", panels: [term("t2")], activePanelId: "t2" },
      },
      activePaneId: "p1",
    });
    const out = applyClosePanel([w], "w1", "t1");
    expect(out).toHaveLength(1);
    const tree = out[0].paneTree as Extract<SplitNode, { kind: "pane" }>;
    expect(tree.kind).toBe("pane");
    expect(tree.id).toBe("p2");
    expect(out[0].activePaneId).toBe("p2");
  });

  it("keeps remaining tabs and reselects the neighbour when a non-last tab closes", () => {
    const w = ws({
      paneTree: { kind: "pane", id: "p1", panels: [term("t1"), term("t2"), term("t3")], activePanelId: "t2" },
      activePaneId: "p1",
    });
    const out = applyClosePanel([w], "w1", "t2");
    const pane = out[0].paneTree as Extract<SplitNode, { kind: "pane" }>;
    expect(pane.panels.map((p) => p.id)).toEqual(["t1", "t3"]);
    expect(pane.activePanelId).toBe("t3");
  });
});

describe("collectRunningTerminals", () => {
  const term = (id: string, title?: string): Panel => ({ id, kind: "terminal", title });
  const wsWith = (panels: Panel[]): Workspace =>
    ws({
      paneTree: { kind: "pane", id: "p1", panels, activePanelId: panels[0]?.id ?? null },
      activePaneId: "p1",
    });

  it("returns only terminals with a foreground process, preserving pane order", async () => {
    const w = wsWith([term("t1"), term("t2"), term("t3")]);
    const running = new Set(["t1", "t3"]);
    const out = await collectRunningTerminals(
      w,
      async (id) => (running.has(id) ? "node" : null),
      () => undefined,
    );
    expect(out.map((r) => r.panelId)).toEqual(["t1", "t3"]);
  });

  it("labels with command, then process name, then title, then 'shell'", async () => {
    const w = wsWith([term("t1"), term("t2", "Build"), term("t3"), term("t4")]);
    const commands = new Map([["t1", "pnpm dev"]]);
    const procNames = new Map([
      ["t1", "node"],
      ["t2", ""],
      ["t3", "vim"],
      ["t4", ""],
    ]);
    const out = await collectRunningTerminals(
      w,
      async (id) => procNames.get(id) ?? null,
      (id) => commands.get(id),
    );
    expect(out).toEqual([
      { panelId: "t1", label: "pnpm dev" },
      { panelId: "t2", label: "Build" },
      { panelId: "t3", label: "vim" },
      { panelId: "t4", label: "shell" },
    ]);
  });

  it("ignores non-terminal panels and returns empty when nothing runs", async () => {
    const w = wsWith([
      { id: "e1", kind: "editor", path: "/a", dirty: false, preview: false },
      term("t1"),
    ]);
    const out = await collectRunningTerminals(w, async () => null, () => undefined);
    expect(out).toEqual([]);
  });
});

describe("captureClosedEntry", () => {
  const entry = (id: string): ClosedEntry => ({
    panel: { id, kind: "terminal" },
    paneId: "p1",
    workspaceId: "w1",
  });

  it("prepends the new entry (LIFO order)", () => {
    const out = captureClosedEntry([entry("t1")], entry("t2"));
    expect(out.map((e) => e.panel.id)).toEqual(["t2", "t1"]);
  });

  it("enforces the cap by dropping the oldest entry", () => {
    const initial = Array.from({ length: 10 }, (_, i) => entry(`t${i}`));
    const out = captureClosedEntry(initial, entry("t10"));
    expect(out).toHaveLength(10);
    expect(out[0].panel.id).toBe("t10");
    expect(out[9].panel.id).toBe("t8");
  });

  it("starts from empty correctly", () => {
    const out = captureClosedEntry([], entry("t1"));
    expect(out).toEqual([entry("t1")]);
  });
});

describe("findReopenTarget", () => {
  const makeWs = (id: string, paneId: string): Workspace => ({
    id,
    title: "W",
    paneTree: { kind: "pane", id: paneId, panels: [], activePanelId: null },
    activePaneId: paneId,
  });

  it("returns the original workspace and pane when both exist", () => {
    const workspaces = [makeWs("w1", "p1")];
    const entry: ClosedEntry = {
      panel: { id: "t1", kind: "terminal" },
      paneId: "p1",
      workspaceId: "w1",
    };
    expect(findReopenTarget(workspaces, "w1", entry)).toEqual({
      workspaceId: "w1",
      paneId: "p1",
    });
  });

  it("falls back to active pane when the original pane no longer exists", () => {
    const workspaces = [makeWs("w1", "p2")]; // p1 was destroyed, now p2 is active
    const entry: ClosedEntry = {
      panel: { id: "t1", kind: "terminal" },
      paneId: "p1",
      workspaceId: "w1",
    };
    expect(findReopenTarget(workspaces, "w1", entry)).toEqual({
      workspaceId: "w1",
      paneId: "p2",
    });
  });

  it("falls back to the active workspace when the original workspace was closed", () => {
    const workspaces = [makeWs("w2", "p3")]; // w1 is gone
    const entry: ClosedEntry = {
      panel: { id: "t1", kind: "terminal" },
      paneId: "p1",
      workspaceId: "w1",
    };
    expect(findReopenTarget(workspaces, "w2", entry)).toEqual({
      workspaceId: "w2",
      paneId: "p3",
    });
  });

  it("returns null when no workspaces exist", () => {
    const entry: ClosedEntry = {
      panel: { id: "t1", kind: "terminal" },
      paneId: "p1",
      workspaceId: "w1",
    };
    expect(findReopenTarget([], "w1", entry)).toBeNull();
  });
});
