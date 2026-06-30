import { describe, expect, it } from "vitest";
import type { ClosedEntry, Panel, RunConfig, SplitNode, Workspace } from "./types";
import { applyClosePanel, applyExplorerRootMode, applyFsRoot, applyGitConfig, applyPinnedRoot, applyShowHidden, applyWorkspaceStatus, captureClosedEntry, collectRunningTerminals, findReopenTarget, pushMru, MRU_HISTORY_LIMIT } from "./useWorkspaces";
import { migrateWorkspace } from "./workspaceState";

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

describe("applyShowHidden", () => {
  it("sets showHidden on the matching workspace only", () => {
    const out = applyShowHidden([ws(), ws({ id: "w2" })], "w1", true);
    expect(out[0].showHidden).toBe(true);
    expect(out[1].showHidden).toBeUndefined();
  });

  it("can clear showHidden back to false", () => {
    const out = applyShowHidden([ws({ showHidden: true })], "w1", false);
    expect(out[0].showHidden).toBe(false);
  });
});

describe("applyPinnedRoot", () => {
  it("sets pinnedRoot and switches mode to workspace", () => {
    const out = applyPinnedRoot([ws()], "w1", "/some/dir");
    expect(out[0].pinnedRoot).toBe("/some/dir");
    expect(out[0].explorerRootMode).toBe("workspace");
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

  const threeTabPane = (active: string): Workspace =>
    ws({
      paneTree: { kind: "pane", id: "p1", panels: [term("t1"), term("t2"), term("t3")], activePanelId: active },
      activePaneId: "p1",
    });
  const activeId = (out: Workspace[]) =>
    (out[0].paneTree as Extract<SplitNode, { kind: "pane" }>).activePanelId;

  it("returns to the MRU tab instead of the neighbour when the active tab closes", () => {
    // Activation order t1, t2, t3 means history is most-recent-first [t3, t2, t1].
    const out = applyClosePanel([threeTabPane("t3")], "w1", "t3", ["t3", "t2", "t1"]);
    expect(activeId(out)).toBe("t2");
  });

  it("skips MRU entries whose tabs no longer exist", () => {
    // t2 was closed earlier but lingers in history; it must be skipped for t1.
    const out = applyClosePanel([threeTabPane("t3")], "w1", "t3", ["t3", "t2", "t1"].filter((id) => id !== "t2"));
    expect(activeId(out)).toBe("t1");
  });

  it("falls back to the neighbour when the history is empty", () => {
    const out = applyClosePanel([threeTabPane("t2")], "w1", "t2", []);
    expect(activeId(out)).toBe("t3");
  });

  it("follows the MRU chain across repeated closes (C -> B -> A)", () => {
    // History most-recent-first after opening t1, t2, t3 in order.
    let history = ["t3", "t2", "t1"];
    let out = applyClosePanel([threeTabPane("t3")], "w1", "t3", history);
    expect(activeId(out)).toBe("t2");
    history = history.filter((id) => id !== "t3");
    const twoLeft = ws({
      paneTree: { kind: "pane", id: "p1", panels: [term("t1"), term("t2")], activePanelId: "t2" },
      activePaneId: "p1",
    });
    out = applyClosePanel([twoLeft], "w1", "t2", history);
    expect(activeId(out)).toBe("t1");
  });

  it("does not change the active tab when a non-active tab closes, even with history", () => {
    const out = applyClosePanel([threeTabPane("t2")], "w1", "t3", ["t3", "t2", "t1"]);
    expect(activeId(out)).toBe("t2");
  });
});

describe("pushMru", () => {
  it("prepends a new id, most recent first", () => {
    expect(pushMru(["b", "a"], "c")).toEqual(["c", "b", "a"]);
  });

  it("moves an existing id to the front without duplicating", () => {
    expect(pushMru(["c", "b", "a"], "a")).toEqual(["a", "c", "b"]);
  });

  it("caps the history at the limit, dropping the oldest", () => {
    const full = Array.from({ length: MRU_HISTORY_LIMIT }, (_, i) => `t${i}`);
    const out = pushMru(full, "new");
    expect(out).toHaveLength(MRU_HISTORY_LIMIT);
    expect(out[0]).toBe("new");
    expect(out).not.toContain(`t${MRU_HISTORY_LIMIT - 1}`);
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

describe("migrateWorkspace", () => {
  it("migrates pinned mode to workspace", () => {
    const raw = ws({ explorerRootMode: "pinned" as unknown as "workspace", pinnedRoot: "/foo" });
    const migrated = migrateWorkspace(raw);
    expect(migrated.explorerRootMode).toBe("workspace");
    expect(migrated.pinnedRoot).toBe("/foo");
  });

  it("workspace mode with no pinnedRoot copies cwd", () => {
    const raw = ws({ explorerRootMode: "workspace", cwd: "/home/user/proj" });
    const migrated = migrateWorkspace(raw);
    expect(migrated.pinnedRoot).toBe("/home/user/proj");
    expect(migrated.explorerRootMode).toBe("workspace");
  });

  it("workspace mode with no pinnedRoot and no cwd falls back to filesystem", () => {
    const raw = ws({ explorerRootMode: "workspace" });
    const migrated = migrateWorkspace(raw);
    expect(migrated.explorerRootMode).toBe("filesystem");
  });

  it("leaves filesystem mode and pinnedRoot unchanged", () => {
    const raw = ws({ explorerRootMode: "filesystem", pinnedRoot: "/foo" });
    const migrated = migrateWorkspace(raw);
    expect(migrated.explorerRootMode).toBe("filesystem");
    expect(migrated.pinnedRoot).toBe("/foo");
  });

  it("is a no-op when already correct", () => {
    const raw = ws({ explorerRootMode: "workspace", pinnedRoot: "/foo" });
    const migrated = migrateWorkspace(raw);
    expect(migrated.explorerRootMode).toBe("workspace");
    expect(migrated.pinnedRoot).toBe("/foo");
  });

  it("migrates runConfigs to scripts", () => {
    const raw = { runConfigs: [{ id: "r1", name: "dev", command: "pnpm dev" }] } as unknown as Workspace;
    const result = migrateWorkspace(raw);
    expect(result.scripts).toEqual([{ id: "r1", name: "dev", command: "pnpm dev" }]);
    expect((result as Record<string, unknown>).runConfigs).toBeUndefined();
  });

  it("migrates activeRunConfigId to activeScript", () => {
    const raw = { activeRunConfigId: "r1" } as unknown as Workspace;
    const result = migrateWorkspace(raw);
    expect(result.activeScript).toBe("r1");
    expect((result as Record<string, unknown>).activeRunConfigId).toBeUndefined();
  });
});

describe("RunConfig actions (pure helpers via applyPinnedRoot pattern)", () => {
  const cfg = (id: string): RunConfig => ({ id, name: `Config ${id}`, command: `cmd-${id}` });

  it("applyPinnedRoot sets mode to workspace (not pinned)", () => {
    const out = applyPinnedRoot([ws()], "w1", "/proj");
    expect(out[0].explorerRootMode).toBe("workspace");
  });

  it("Workspace type accepts color, scripts, and activeScript", () => {
    const w: Workspace = {
      ...ws(),
      color: "#ff0000",
      scripts: [cfg("r1")],
      activeScript: "r1",
    };
    expect(w.color).toBe("#ff0000");
    expect(w.scripts).toHaveLength(1);
    expect(w.activeScript).toBe("r1");
  });

  it("RunConfig panelId is optional", () => {
    const c: RunConfig = { id: "1", name: "Dev", command: "pnpm dev" };
    expect(c.panelId).toBeUndefined();
  });
});

describe("applyWorkspaceStatus", () => {
  it("sets statusId on the matching workspace only", () => {
    const out = applyWorkspaceStatus([ws(), ws({ id: "w2" })], "w1", "archived");
    expect(out[0].statusId).toBe("archived");
    expect(out[1].statusId).toBeUndefined();
  });

  it("clears statusId when null is passed", () => {
    const out = applyWorkspaceStatus([ws({ statusId: "archived" })], "w1", null);
    expect(out[0].statusId).toBeUndefined();
  });

  it("clears statusId when undefined is passed", () => {
    const out = applyWorkspaceStatus([ws({ statusId: "archived" })], "w1", undefined);
    expect(out[0].statusId).toBeUndefined();
  });

  it("does not modify unrelated workspaces", () => {
    const out = applyWorkspaceStatus([ws(), ws({ id: "w2", statusId: "completed" })], "w1", "on-hold");
    expect(out[1].statusId).toBe("completed");
  });
});
