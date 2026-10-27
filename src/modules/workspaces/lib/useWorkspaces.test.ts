import { describe, expect, it } from "vitest";
import type { Tab, SplitNode, PaneNode, Workspace } from "./types";
import { addAction, removeAction, type Action } from "@/modules/actions";
import { applyCloseTab, applyDropDeadScriptPanes, applyMoveTabToWorkspace, applyWorkspaceActions, applySetActiveAction, takeWorkspaceAction, applyExplorerRootMode, applyFsRoot, applyGitConfig, applyWorkspaceRoot, applyShowHidden, applyWorkspaceGroup, collectRunningTerminals, emptyWorkspaceToClose, runOnce, insertWorkspaceAfterActive, needsResumePlanLookup, planWake, seedWakePlans, tabInsertionIndex, pushMru, workspaceTabCount, MRU_HISTORY_LIMIT } from "./useWorkspaces";

const ws = (over: Partial<Workspace> = {}): Workspace => ({
  id: "w1",
  title: "W",
  paneTree: { kind: "pane", id: "p1", tabs: [], activeTabId: null },
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

describe("applyWorkspaceRoot", () => {
  it("sets workspaceRoot and switches mode to workspace", () => {
    const out = applyWorkspaceRoot([ws()], "w1", "/some/dir");
    expect(out[0].workspaceRoot).toBe("/some/dir");
    expect(out[0].explorerRootMode).toBe("workspace");
  });

  it("strips a trailing slash from the workspace root path", () => {
    const out = applyWorkspaceRoot([ws()], "w1", "/some/dir/");
    expect(out[0].workspaceRoot).toBe("/some/dir");
  });

  it("normalizes backslash Windows paths to forward slashes", () => {
    const out = applyWorkspaceRoot([ws()], "w1", "C:\\Users\\dev\\project");
    expect(out[0].workspaceRoot).toBe("C:/Users/dev/project");
  });

  it("strips a trailing backslash from a Windows path", () => {
    const out = applyWorkspaceRoot([ws()], "w1", "C:\\Users\\dev\\project\\");
    expect(out[0].workspaceRoot).toBe("C:/Users/dev/project");
  });

  it("keeps a Windows drive root", () => {
    const out = applyWorkspaceRoot([ws()], "w1", "C:\\");
    expect(out[0].workspaceRoot).toBe("C:/");
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

describe("applyCloseTab", () => {
  const term = (id: string): Tab => ({ id, kind: "terminal" });

  it("keeps the workspace with an empty pane when the last tab of the only pane closes", () => {
    const w = ws({
      paneTree: { kind: "pane", id: "p1", tabs: [term("t1")], activeTabId: "t1" },
      activePaneId: "p1",
    });
    const out = applyCloseTab([w], "w1", "t1");
    expect(out).toHaveLength(1);
    const pane = out[0].paneTree as Extract<SplitNode, { kind: "pane" }>;
    expect(pane.kind).toBe("pane");
    expect(pane.tabs).toEqual([]);
    expect(pane.activeTabId).toBeNull();
  });

  it("collapses a pane (keeps the sibling) when its last tab closes inside a split", () => {
    const w = ws({
      paneTree: {
        kind: "split",
        id: "s1",
        orientation: "horizontal",
        dividerPosition: 0.5,
        first: { kind: "pane", id: "p1", tabs: [term("t1")], activeTabId: "t1" },
        second: { kind: "pane", id: "p2", tabs: [term("t2")], activeTabId: "t2" },
      },
      activePaneId: "p1",
    });
    const out = applyCloseTab([w], "w1", "t1");
    expect(out).toHaveLength(1);
    const tree = out[0].paneTree as Extract<SplitNode, { kind: "pane" }>;
    expect(tree.kind).toBe("pane");
    expect(tree.id).toBe("p2");
    expect(out[0].activePaneId).toBe("p2");
  });

  it("keeps remaining tabs and reselects the neighbour when a non-last tab closes", () => {
    const w = ws({
      paneTree: { kind: "pane", id: "p1", tabs: [term("t1"), term("t2"), term("t3")], activeTabId: "t2" },
      activePaneId: "p1",
    });
    const out = applyCloseTab([w], "w1", "t2");
    const pane = out[0].paneTree as Extract<SplitNode, { kind: "pane" }>;
    expect(pane.tabs.map((p) => p.id)).toEqual(["t1", "t3"]);
    expect(pane.activeTabId).toBe("t3");
  });

  const threeTabPane = (active: string): Workspace =>
    ws({
      paneTree: { kind: "pane", id: "p1", tabs: [term("t1"), term("t2"), term("t3")], activeTabId: active },
      activePaneId: "p1",
    });
  const activeId = (out: Workspace[]) =>
    (out[0].paneTree as Extract<SplitNode, { kind: "pane" }>).activeTabId;

  it("returns to the MRU tab instead of the neighbour when the active tab closes", () => {
    // Activation order t1, t2, t3 means history is most-recent-first [t3, t2, t1].
    const out = applyCloseTab([threeTabPane("t3")], "w1", "t3", ["t3", "t2", "t1"]);
    expect(activeId(out)).toBe("t2");
  });

  it("skips MRU entries whose tabs no longer exist", () => {
    // t2 was closed earlier but lingers in history; it must be skipped for t1.
    const out = applyCloseTab([threeTabPane("t3")], "w1", "t3", ["t3", "t2", "t1"].filter((id) => id !== "t2"));
    expect(activeId(out)).toBe("t1");
  });

  it("falls back to the neighbour when the history is empty", () => {
    const out = applyCloseTab([threeTabPane("t2")], "w1", "t2", []);
    expect(activeId(out)).toBe("t3");
  });

  it("follows the MRU chain across repeated closes (C -> B -> A)", () => {
    // History most-recent-first after opening t1, t2, t3 in order.
    let history = ["t3", "t2", "t1"];
    let out = applyCloseTab([threeTabPane("t3")], "w1", "t3", history);
    expect(activeId(out)).toBe("t2");
    history = history.filter((id) => id !== "t3");
    const twoLeft = ws({
      paneTree: { kind: "pane", id: "p1", tabs: [term("t1"), term("t2")], activeTabId: "t2" },
      activePaneId: "p1",
    });
    out = applyCloseTab([twoLeft], "w1", "t2", history);
    expect(activeId(out)).toBe("t1");
  });

  it("does not change the active tab when a non-active tab closes, even with history", () => {
    const out = applyCloseTab([threeTabPane("t2")], "w1", "t3", ["t3", "t2", "t1"]);
    expect(activeId(out)).toBe("t2");
  });

  it("resets detailExpanded when the last tab empties the sole pane", () => {
    const w = ws({
      paneTree: { kind: "pane", id: "p1", tabs: [term("t1")], activeTabId: "t1" },
      activePaneId: "p1",
      detailExpanded: undefined,
    });
    const out = applyCloseTab([w], "w1", "t1");
    expect(out[0].detailExpanded).toBe(true);
  });

  it("does not touch detailExpanded while tabs remain", () => {
    const collapsed = threeTabPane("t3");
    collapsed.detailExpanded = undefined;
    const out = applyCloseTab([collapsed], "w1", "t3", []);
    expect(out[0].detailExpanded).toBeUndefined();
  });
});

describe("workspaceTabCount", () => {
  const term = (id: string): Tab => ({ id, kind: "terminal" });

  it("sums the tabs of every pane across a split", () => {
    const w = ws({
      paneTree: {
        kind: "split",
        id: "s1",
        orientation: "horizontal",
        dividerPosition: 0.5,
        first: { kind: "pane", id: "p1", tabs: [term("t1"), term("t2")], activeTabId: "t2" },
        second: { kind: "pane", id: "p2", tabs: [term("t3")], activeTabId: "t3" },
      },
      activePaneId: "p2",
    });
    expect(workspaceTabCount(w)).toBe(3);
  });

  it("counts zero for the empty pane of a fresh workspace", () => {
    expect(workspaceTabCount(ws())).toBe(0);
  });
});

describe("emptyWorkspaceToClose", () => {
  const term = (id: string): Tab => ({ id, kind: "terminal" });

  const emptyWs = ws({
    title: "",
    paneTree: { kind: "pane", id: "p1", tabs: [], activeTabId: null },
    activePaneId: "p1",
  });
  const fullWs = ws({
    id: "w2",
    paneTree: { kind: "pane", id: "p2", tabs: [term("t1")], activeTabId: "t1" },
    activePaneId: "p2",
  });

  it("returns the empty workspace when others exist", () => {
    expect(emptyWorkspaceToClose([fullWs, emptyWs])?.id).toBe("w1");
  });

  it("returns null for the window's only workspace, empty or not", () => {
    expect(emptyWorkspaceToClose([emptyWs])).toBeNull();
    expect(emptyWorkspaceToClose([fullWs])).toBeNull();
  });

  const emptyTree: PaneNode = { kind: "pane", id: "p1", tabs: [], activeTabId: null };

  it.each([
    ["an Action", { actions: [{ id: "ac-1", name: "Dev", kind: "app" as const, command: "code {cwd}", ownButton: false }] }],
    ["a title", { title: "Backend" }],
    ["a color", { color: "#ff0000" }],
    ["an icon", { icon: "rocket" }],
    ["a workspace root", { workspaceRoot: "/tmp/proj" }],
  ])("keeps an empty workspace with %s", (_label, extra) => {
    const custom = ws({ title: "", paneTree: emptyTree, activePaneId: "p1", ...extra });
    expect(emptyWorkspaceToClose([fullWs, custom])).toBeNull();
  });

  it("keeps the other customized workspaces untouched when only one is blank", () => {
    const named = ws({ id: "w3", paneTree: emptyTree, activePaneId: "p1" });
    expect(emptyWorkspaceToClose([fullWs, named])).toBeNull();
  });

  it("folds a workspace whose title is only whitespace", () => {
    const blank = ws({ title: "  ", paneTree: emptyTree, activePaneId: "p1" });
    expect(emptyWorkspaceToClose([fullWs, blank])?.id).toBe("w1");
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
  const term = (id: string, title?: string): Tab => ({ id, kind: "terminal", title });
  const wsWith = (tabs: Tab[]): Workspace =>
    ws({
      paneTree: { kind: "pane", id: "p1", tabs, activeTabId: tabs[0]?.id ?? null },
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
    expect(out.map((r) => r.tabId)).toEqual(["t1", "t3"]);
  });

  it("does not ask about a sleeping terminal, which has no process", async () => {
    const asleep: Tab = { id: "t2", kind: "terminal", hibernation: { at: 1 } };
    const asked: string[] = [];
    const out = await collectRunningTerminals(
      wsWith([term("t1"), asleep]),
      async (id) => {
        asked.push(id);
        return "node";
      },
      () => undefined,
    );
    expect(asked).toEqual(["t1"]);
    expect(out.map((r) => r.tabId)).toEqual(["t1"]);
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
      { tabId: "t1", label: "pnpm dev" },
      { tabId: "t2", label: "Build" },
      { tabId: "t3", label: "vim" },
      { tabId: "t4", label: "shell" },
    ]);
  });

  it("ignores non-terminal tabs and returns empty when nothing runs", async () => {
    const w = wsWith([
      { id: "e1", kind: "editor", path: "/a", dirty: false, preview: false },
      term("t1"),
    ]);
    const out = await collectRunningTerminals(w, async () => null, () => undefined);
    expect(out).toEqual([]);
  });
});

describe("needsResumePlanLookup", () => {
  it("is true for a terminal tab with no explicit restoreOnRestart", () => {
    expect(needsResumePlanLookup({ id: "t1", kind: "terminal" })).toBe(true);
  });

  it("is true for a terminal tab with restoreOnRestart explicitly on", () => {
    expect(needsResumePlanLookup({ id: "t1", kind: "terminal", restoreOnRestart: true })).toBe(true);
  });

  it("is false for a terminal tab with restoreOnRestart explicitly off", () => {
    expect(needsResumePlanLookup({ id: "t1", kind: "terminal", restoreOnRestart: false })).toBe(false);
  });

  it("is false for non-terminal kinds", () => {
    expect(needsResumePlanLookup({ id: "t1", kind: "browser", url: "https://example.com" })).toBe(false);
  });
});

describe("workspace helpers", () => {
  it("applyWorkspaceRoot sets mode to workspace", () => {
    const out = applyWorkspaceRoot([ws()], "w1", "/proj");
    expect(out[0].explorerRootMode).toBe("workspace");
  });
});

describe("tabInsertionIndex", () => {
  const term = (id: string): Tab => ({ id, kind: "terminal" });
  const tabs = [term("t1"), term("t2"), term("t3")];

  it("inserts right after the active tab", () => {
    expect(tabInsertionIndex(tabs, "t1")).toBe(1);
    expect(tabInsertionIndex(tabs, "t2")).toBe(2);
  });

  it("inserts at the end when the active tab is the last one", () => {
    expect(tabInsertionIndex(tabs, "t3")).toBe(3);
  });

  it("appends when there is no active tab", () => {
    expect(tabInsertionIndex(tabs, null)).toBe(3);
    expect(tabInsertionIndex([], null)).toBe(0);
  });

  it("appends when the active id is not in the pane", () => {
    expect(tabInsertionIndex(tabs, "ghost")).toBe(3);
  });

  it("honours an explicit insertion index, clamped to length", () => {
    expect(tabInsertionIndex(tabs, "t1", 0)).toBe(0);
    expect(tabInsertionIndex(tabs, "t1", 99)).toBe(3);
  });
});

describe("insertWorkspaceAfterActive", () => {
  it("inserts right after the active workspace", () => {
    const out = insertWorkspaceAfterActive([ws({ id: "w1" }), ws({ id: "w2" })], "w1", ws({ id: "new" }));
    expect(out.map((w) => w.id)).toEqual(["w1", "new", "w2"]);
  });

  it("inherits the group of the active workspace", () => {
    const out = insertWorkspaceAfterActive([ws({ id: "w1", groupId: "wip" })], "w1", ws({ id: "new" }));
    expect(out[1].groupId).toBe("wip");
  });

  it("leaves the new workspace group-less when the active one has none", () => {
    const out = insertWorkspaceAfterActive([ws({ id: "w1" })], "w1", ws({ id: "new" }));
    expect(out[1].groupId).toBeUndefined();
  });

  it("appends to the end when the active workspace is missing", () => {
    const out = insertWorkspaceAfterActive([ws({ id: "w1" })], "ghost", ws({ id: "new" }));
    expect(out.map((w) => w.id)).toEqual(["w1", "new"]);
    expect(out[1].groupId).toBeUndefined();
  });
});

describe("applyWorkspaceGroup", () => {
  it("sets groupId on the matching workspace only", () => {
    const out = applyWorkspaceGroup([ws(), ws({ id: "w2" })], "w1", "archived");
    expect(out[0].groupId).toBe("archived");
    expect(out[1].groupId).toBeUndefined();
  });

  it("clears groupId when null is passed", () => {
    const out = applyWorkspaceGroup([ws({ groupId: "archived" })], "w1", null);
    expect(out[0].groupId).toBeUndefined();
  });

  it("clears groupId when undefined is passed", () => {
    const out = applyWorkspaceGroup([ws({ groupId: "archived" })], "w1", undefined);
    expect(out[0].groupId).toBeUndefined();
  });

  it("does not modify unrelated workspaces", () => {
    const out = applyWorkspaceGroup([ws(), ws({ id: "w2", groupId: "completed" })], "w1", "on-hold");
    expect(out[1].groupId).toBe("completed");
  });
});

describe("applyMoveTabToWorkspace", () => {
  const term = (id: string, cwd?: string): Tab => ({ id, kind: "terminal", cwd });
  const leaf = (id: string, tabs: Tab[]): SplitNode => ({
    kind: "pane",
    id,
    tabs,
    activeTabId: tabs[0]?.id ?? null,
  });
  const src = (over: Partial<Workspace> = {}) =>
    ws({ id: "src", paneTree: leaf("sp1", [term("t1"), term("t2")]), activePaneId: "sp1", ...over });
  const dst = (over: Partial<Workspace> = {}) =>
    ws({ id: "dst", paneTree: leaf("dp1", [term("d1")]), activePaneId: "dp1", ...over });
  const autoDest = {
    kind: "existing",
    workspaceId: "dst",
    placement: { kind: "auto" },
  } as const;

  it("moves the tab keeping its id and removes it from the source", () => {
    const out = applyMoveTabToWorkspace([src(), dst()], "src", "t1", autoDest, 8);
    const source = out.find((w) => w.id === "src")!;
    const target = out.find((w) => w.id === "dst")!;
    expect((source.paneTree as { tabs: Tab[] }).tabs.map((t) => t.id)).toEqual(["t2"]);
    const panes = JSON.stringify(target.paneTree);
    expect(panes).toContain('"id":"t1"');
    expect(target.activePaneId).toBe("dp1");
  });

  it("moves a hibernated tab with its sleep intact", () => {
    const sleeping: Tab = { id: "t1", kind: "terminal", hibernation: { at: 7, agent: "claude" } };
    const input = [src({ paneTree: leaf("sp1", [sleeping, term("t2")]) }), dst()];
    const out = applyMoveTabToWorkspace(input, "src", "t1", autoDest, 8);
    const target = out.find((w) => w.id === "dst")!;
    expect(JSON.stringify(target.paneTree)).toContain('"hibernation":{"at":7,"agent":"claude"}');
  });

  it("keeps the source workspace with an empty pane when its last tab leaves", () => {
    const onlyTab = src({ paneTree: leaf("sp1", [term("t1")]) });
    const out = applyMoveTabToWorkspace([onlyTab, dst()], "src", "t1", autoDest, 8);
    const source = out.find((w) => w.id === "src")!;
    expect(out).toHaveLength(2);
    expect(source.paneTree).toEqual({ kind: "pane", id: "sp1", tabs: [], activeTabId: null });
    expect(source.activePaneId).toBe("sp1");
  });

  it("collapses a source pane that empties and repoints activePaneId at a live pane", () => {
    const split = src({
      paneTree: {
        kind: "split",
        id: "ss",
        orientation: "horizontal",
        dividerPosition: 0.5,
        first: leaf("sp1", [term("t1")]),
        second: leaf("sp2", [term("t2")]),
      },
      activePaneId: "sp1",
    });
    const out = applyMoveTabToWorkspace([split, dst()], "src", "t1", autoDest, 8);
    const source = out.find((w) => w.id === "src")!;
    expect(source.paneTree).toMatchObject({ kind: "pane", id: "sp2" });
    expect(source.activePaneId).toBe("sp2");
  });

  it("leaves everything untouched when a split is blocked by the pane limit", () => {
    const input = [src(), dst()];
    const out = applyMoveTabToWorkspace(
      input,
      "src",
      "t1",
      {
        kind: "existing",
        workspaceId: "dst",
        placement: { kind: "split", paneId: "dp1", direction: "right", splitId: "sx", newPaneId: "px" },
      },
      1,
    );
    expect(out).toBe(input);
  });

  it("returns the same array for the same workspace, a missing tab or a missing destination", () => {
    const input = [src(), dst()];
    const same = { kind: "existing", workspaceId: "src", placement: { kind: "pane", paneId: "sp1" } } as const;
    expect(applyMoveTabToWorkspace(input, "src", "t1", same, 8)).toBe(input);
    expect(applyMoveTabToWorkspace(input, "src", "nope", autoDest, 8)).toBe(input);
    const ghost = { kind: "existing", workspaceId: "ghost", placement: { kind: "auto" } } as const;
    expect(applyMoveTabToWorkspace(input, "src", "t1", ghost, 8)).toBe(input);
  });

  it("creates a workspace right after the source, in its group, with the tab's cwd", () => {
    const grouped = src({ groupId: "g1", paneTree: leaf("sp1", [term("t1", "/Users/me/proj"), term("t2")]) });
    const out = applyMoveTabToWorkspace(
      [grouped, dst()],
      "src",
      "t1",
      { kind: "new", workspaceId: "wn", paneId: "pn", color: null },
      8,
    );
    expect(out.map((w) => w.id)).toEqual(["src", "wn", "dst"]);
    const created = out[1]!;
    expect(created).toMatchObject({ title: "", cwd: "/Users/me/proj", groupId: "g1", color: null, activePaneId: "pn" });
    expect(created.paneTree).toMatchObject({ kind: "pane", id: "pn", activeTabId: "t1" });
  });
});

describe("planWake", () => {
  it("asks for a resume plan only on terminals that did not opt out of Run on start", () => {
    const tabs: Tab[] = [
      { id: "a", kind: "terminal" },
      { id: "b", kind: "terminal", restoreOnRestart: false },
      { id: "c", kind: "editor", path: "/x", dirty: false, preview: false },
    ];
    expect(planWake(tabs)).toEqual(["a"]);
  });
});

describe("seedWakePlans", () => {
  const plan = { tabId: "a", agent: "claude", resumeCmd: "claude --resume x", attemptedCmd: "", cwdLaunch: "/p", errorReason: "" };

  it("seeds the plan under the same tab id for each terminal that has one", async () => {
    const seeded: [string, unknown][] = [];
    const tabs: Tab[] = [
      { id: "a", kind: "terminal" },
      { id: "b", kind: "terminal" },
    ];
    await seedWakePlans(
      tabs,
      async (id) => (id === "a" ? plan : null),
      (id, p) => seeded.push([id, p]),
    );
    expect(seeded).toEqual([["a", plan]]);
  });

  it("does not look up terminals that opted out", async () => {
    const asked: string[] = [];
    const tabs: Tab[] = [{ id: "a", kind: "terminal", restoreOnRestart: false }];
    await seedWakePlans(
      tabs,
      async (id) => {
        asked.push(id);
        return null;
      },
      () => {},
    );
    expect(asked).toEqual([]);
  });
});

describe("runOnce", () => {
  it("runs the task once and hands the in-flight promise to a second caller", async () => {
    const inFlight = new Map<string, Promise<void>>();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let runs = 0;
    let done = false;
    const task = async () => {
      runs++;
      await gate;
      done = true;
    };
    const first = runOnce(inFlight, "w1", task);
    const second = runOnce(inFlight, "w1", task).then(() => done);
    expect(runs).toBe(1);
    release();
    await first;
    expect(await second).toBe(true);
    await runOnce(inFlight, "w1", task);
    expect(runs).toBe(2);
  });

  it("frees the key when the task throws", async () => {
    const inFlight = new Map<string, Promise<void>>();
    await expect(runOnce(inFlight, "w1", async () => { throw new Error("x"); })).rejects.toThrow("x");
    expect(inFlight.size).toBe(0);
  });
});

describe("workspace actions", () => {
  const action = (id: string): Action => ({ id, name: id, kind: "script" as const, command: `run ${id}`, ownButton: false });

  it("changes the list of the matching workspace only", () => {
    const out = applyWorkspaceActions([ws(), ws({ id: "w2" })], "w1", (list) => addAction(list, action("a")));
    expect(out[0].actions?.map((a) => a.id)).toEqual(["a"]);
    expect(out[1].actions).toBeUndefined();
  });

  it("clears the active action when it leaves the list", () => {
    const start = [ws({ actions: [action("a"), action("b")], activeAction: "a" })];
    const out = applyWorkspaceActions(start, "w1", (list) => removeAction(list, "a"));
    expect(out[0].activeAction).toBeUndefined();
    expect(out[0].actions?.map((a) => a.id)).toEqual(["b"]);
  });

  it("sets and clears the active action, ignoring one that does not exist", () => {
    const start = [ws({ actions: [action("a")] })];
    expect(applySetActiveAction(start, "w1", "a")[0].activeAction).toBe("a");
    expect(applySetActiveAction(start, "w1", "zz")[0].activeAction).toBeUndefined();
    expect(applySetActiveAction([ws({ actions: [action("a")], activeAction: "a" })], "w1", null)[0].activeAction).toBeUndefined();
  });

  it("takes an action out of its workspace and clears it as the active one", () => {
    const start = [ws({ actions: [action("a"), action("b")], activeAction: "a" })];
    const out = takeWorkspaceAction(start, "w1", "a");
    expect(out.action?.id).toBe("a");
    expect(out.workspaces[0].actions?.map((x) => x.id)).toEqual(["b"]);
    expect(out.workspaces[0].activeAction).toBeUndefined();
  });

  it("takes nothing for an unknown action or workspace", () => {
    const start = [ws({ actions: [action("a")] })];
    expect(takeWorkspaceAction(start, "w1", "zz")).toEqual({ workspaces: start, action: null });
    expect(takeWorkspaceAction(start, "nope", "a")).toEqual({ workspaces: start, action: null });
  });
});

describe("applyDropDeadScriptPanes", () => {
  const tree = (paneId: string): PaneNode => ({ kind: "pane", id: paneId, tabs: [], activeTabId: null });

  it("clears a scripts pane that no longer exists and keeps one that does", () => {
    const gone = ws({ id: "w1", paneTree: tree("p1"), activePaneId: "p1", scriptPaneId: "p-missing" });
    const live = ws({ id: "w2", paneTree: tree("p2"), activePaneId: "p2", scriptPaneId: "p2" });
    const out = applyDropDeadScriptPanes([gone, live]);
    expect(out[0]!.scriptPaneId).toBeUndefined();
    expect(out[1]).toBe(live);
  });

  it("returns the same array when nothing has to change", () => {
    const list = [ws({ paneTree: tree("p1"), activePaneId: "p1" })];
    expect(applyDropDeadScriptPanes(list)).toBe(list);
  });
});
