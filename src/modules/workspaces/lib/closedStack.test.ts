import { describe, expect, it } from "vitest";
import type { ClosedEntry, ClosedTabEntry, Tab, Workspace } from "./types";
import { allPanes } from "./splitNode";
import {
  buildReopenedTab,
  captureClosedEntry,
  captureClosedWorkspace,
  clearStaleFolds,
  insertRestoredWorkspace,
  orphanedSleepers,
  orphanedTerminals,
  pickReopen,
  remapPrevTabId,
  resolveReopenSlot,
  reviveWorkspace,
} from "./closedStack";

const term = (id: string): Tab => ({ id, kind: "terminal" });

const makeWs = (id: string, paneId: string, tabs: Tab[] = []): Workspace => ({
  id,
  title: "W",
  paneTree: { kind: "pane", id: paneId, tabs, activeTabId: tabs[0]?.id ?? null },
  activePaneId: paneId,
});

const tabEntry = (id: string, workspaceId: string, paneId: string, over: Partial<ClosedTabEntry> = {}): ClosedTabEntry => ({
  kind: "tab",
  tab: term(id),
  paneId,
  workspaceId,
  prevTabId: null,
  ...over,
});

const wsEntry = (ws: Workspace, index = 0): ClosedEntry => ({ kind: "workspace", workspace: ws, index });

describe("captureClosedEntry", () => {
  it("prepends the new entry (LIFO order)", () => {
    const out = captureClosedEntry([tabEntry("t1", "w1", "p1")], tabEntry("t2", "w1", "p1"));
    expect(out.map((e) => e.kind === "tab" && e.tab.id)).toEqual(["t2", "t1"]);
  });

  it("enforces the cap by dropping the oldest entry", () => {
    const initial = Array.from({ length: 10 }, (_, i) => tabEntry(`t${i}`, "w1", "p1"));
    const out = captureClosedEntry(initial, tabEntry("t10", "w1", "p1"));
    expect(out).toHaveLength(10);
    expect(out[0]).toMatchObject({ tab: { id: "t10" } });
    expect(out[9]).toMatchObject({ tab: { id: "t8" } });
  });

  it("starts from empty correctly", () => {
    const e = tabEntry("t1", "w1", "p1");
    expect(captureClosedEntry([], e)).toEqual([e]);
  });
});

describe("pickReopen", () => {
  it("picks the newest entry in its original workspace and pane", () => {
    const e1 = tabEntry("t1", "w1", "p1");
    const e2 = tabEntry("t2", "w1", "p1");
    const out = pickReopen([e2, e1], [makeWs("w1", "p1")]);
    expect(out.picked).toEqual({ kind: "tab", entry: e2, workspaceId: "w1", paneId: "p1" });
    expect(out.remaining).toEqual([e1]);
  });

  it("falls back to the workspace's active pane when the original pane no longer exists", () => {
    const e = tabEntry("t1", "w1", "p1");
    const out = pickReopen([e], [makeWs("w1", "p2")]);
    expect(out.picked).toEqual({ kind: "tab", entry: e, workspaceId: "w1", paneId: "p2" });
  });

  it("never reopens in another workspace: a tab of a closed workspace is dropped", () => {
    const out = pickReopen([tabEntry("t1", "w1", "p1")], [makeWs("w2", "p3")]);
    expect(out.picked).toBeNull();
    expect(out.remaining).toEqual([]);
  });

  it("reopens a tab that was hibernated when it closed like any other entry", () => {
    const e = { ...tabEntry("t2", "w1", "p1"), tab: { ...term("t2"), hibernation: { at: 1 } } as Tab };
    const out = pickReopen([e], [makeWs("w1", "p1")]);
    expect(out.picked).toEqual({ kind: "tab", entry: e, workspaceId: "w1", paneId: "p1" });
    expect(out.remaining).toEqual([]);
  });

  it("returns nothing for an empty stack", () => {
    expect(pickReopen([], [makeWs("w1", "p1")])).toEqual({ picked: null, remaining: [] });
  });

  it("picks a closed workspace when it is not open", () => {
    const closed = wsEntry(makeWs("w1", "p1", [term("t1")]), 2);
    const older = tabEntry("t0", "w2", "p9");
    const out = pickReopen([closed, older], [makeWs("w2", "p9")]);
    expect(out.picked).toEqual({ kind: "workspace", entry: closed });
    expect(out.remaining).toEqual([older]);
  });

  it("drops a workspace entry whose workspace is already open and moves on", () => {
    const closed = wsEntry(makeWs("w1", "p1", [term("t1")]));
    const older = tabEntry("t0", "w1", "p1");
    const out = pickReopen([closed, older], [makeWs("w1", "p1")]);
    expect(out.picked).toMatchObject({ kind: "tab", entry: older });
    expect(out.remaining).toEqual([]);
  });

  it("reopens tabs closed earlier into a restored workspace, after the workspace itself", () => {
    const ws = makeWs("w1", "p1", [term("a")]);
    const stack = [wsEntry(ws), tabEntry("b", "w1", "p1")];
    const first = pickReopen(stack, []);
    expect(first.picked?.kind).toBe("workspace");
    const second = pickReopen(first.remaining, [ws]);
    expect(second.picked).toMatchObject({ kind: "tab", workspaceId: "w1" });
  });
});

describe("captureClosedWorkspace", () => {
  it("records a workspace with its tabs and position", () => {
    const ws = makeWs("w1", "p1", [term("t1")]);
    const out = captureClosedWorkspace([], ws, 3);
    expect(out).toEqual([wsEntry(ws, 3)]);
  });

  it("folds the last closed tab back into the workspace that closed with it", () => {
    const ws = makeWs("w1", "p1");
    const last = tabEntry("t1", "w1", "p1", { lastOfWorkspace: true });
    const older = tabEntry("t0", "w2", "p2");
    const out = captureClosedWorkspace([last, older], ws, 1);
    expect(out).toHaveLength(2);
    const restored = out[0] as Extract<ClosedEntry, { kind: "workspace" }>;
    expect(restored.kind).toBe("workspace");
    expect(allPanes(restored.workspace.paneTree)[0]!.tabs.map((t) => t.id)).toEqual(["t1"]);
    expect(allPanes(restored.workspace.paneTree)[0]!.activeTabId).toBe("t1");
    expect(out[1]).toBe(older);
  });

  it("puts the folded tab in the first pane when its own pane is gone", () => {
    const ws = makeWs("w1", "p2");
    const last = tabEntry("t1", "w1", "p1", { lastOfWorkspace: true });
    const out = captureClosedWorkspace([last], ws, 0);
    const restored = out[0] as Extract<ClosedEntry, { kind: "workspace" }>;
    expect(restored.workspace.activePaneId).toBe("p2");
    expect(allPanes(restored.workspace.paneTree)[0]!.tabs.map((t) => t.id)).toEqual(["t1"]);
  });

  it("does not fold a tab that was not the last of its workspace", () => {
    const ws = makeWs("w1", "p1");
    const out = captureClosedWorkspace([tabEntry("t1", "w1", "p1")], ws, 0);
    expect(out).toEqual([tabEntry("t1", "w1", "p1")]);
  });

  it("does not fold the last tab of another workspace", () => {
    const ws = makeWs("w1", "p1");
    const other = tabEntry("t1", "w2", "p2", { lastOfWorkspace: true });
    expect(captureClosedWorkspace([other], ws, 0)).toEqual([other]);
  });

  it("skips an empty workspace with nothing to bring back", () => {
    expect(captureClosedWorkspace([], makeWs("w1", "p1"), 0)).toEqual([]);
  });

  it("keeps an empty workspace that still has actions", () => {
    const ws = { ...makeWs("w1", "p1"), actions: [{ id: "ac-1", name: "dev", kind: "script" as const, command: "pnpm dev", ownButton: false }] };
    expect(captureClosedWorkspace([], ws, 0)).toEqual([wsEntry(ws, 0)]);
  });

  it("enforces the cap by dropping the oldest entry", () => {
    const initial: ClosedEntry[] = Array.from({ length: 10 }, (_, i) => tabEntry(`t${i}`, "w9", "p9"));
    const out = captureClosedWorkspace(initial, makeWs("w1", "p1", [term("a")]), 0);
    expect(out).toHaveLength(10);
    expect(out[0]!.kind).toBe("workspace");
  });
});

describe("clearStaleFolds", () => {
  it("clears the flag once the workspace holds a tab again", () => {
    const flagged = tabEntry("t1", "w1", "p1", { lastOfWorkspace: true });
    const out = clearStaleFolds([flagged], [makeWs("w1", "p1", [term("new")])]);
    expect((out[0] as ClosedTabEntry).lastOfWorkspace).toBeUndefined();
  });

  it("keeps the flag while the workspace is empty or already gone", () => {
    const flagged = tabEntry("t1", "w1", "p1", { lastOfWorkspace: true });
    const entries = [flagged];
    expect(clearStaleFolds(entries, [makeWs("w1", "p1")])).toBe(entries);
    expect(clearStaleFolds(entries, [])).toBe(entries);
  });

  it("returns the same array when nothing is flagged", () => {
    const entries = [tabEntry("t1", "w1", "p1")];
    expect(clearStaleFolds(entries, [makeWs("w1", "p1", [term("x")])])).toBe(entries);
  });
});

describe("reviveWorkspace", () => {
  const counter = () => {
    let n = 0;
    return () => `new-${++n}`;
  };

  it("gives every tab a fresh id and keeps the active tab", () => {
    const ws = makeWs("w1", "p1", [term("a"), term("b")]);
    ws.paneTree = { ...(ws.paneTree as typeof ws.paneTree & { kind: "pane" }), activeTabId: "b" };
    const { workspace, idMap } = reviveWorkspace(ws, counter());
    const pane = allPanes(workspace.paneTree)[0]!;
    expect(pane.tabs.map((t) => t.id)).toEqual(["new-1", "new-2"]);
    expect(pane.activeTabId).toBe("new-2");
    expect(idMap.get("a")).toBe("new-1");
    expect(workspace.id).toBe("w1");
  });

  it("walks split trees", () => {
    const ws: Workspace = {
      ...makeWs("w1", "p1"),
      paneTree: {
        kind: "split",
        id: "s1",
        orientation: "horizontal",
        dividerPosition: 0.4,
        first: { kind: "pane", id: "p1", tabs: [term("a")], activeTabId: "a" },
        second: { kind: "pane", id: "p2", tabs: [term("b")], activeTabId: "b" },
      },
    };
    const { workspace } = reviveWorkspace(ws, counter());
    const ids = allPanes(workspace.paneTree).flatMap((p) => p.tabs.map((t) => t.id));
    expect(ids).toEqual(["new-1", "new-2"]);
    expect(workspace.paneTree).toMatchObject({ dividerPosition: 0.4 });
  });

  it("clears the unsaved flag of editors and the floating flag of browsers", () => {
    const tabs: Tab[] = [
      { id: "e", kind: "editor", path: "/f", dirty: true, preview: false },
      { id: "m", kind: "markdown", path: "/f.md", dirty: true },
      { id: "b", kind: "browser", url: "https://x.dev", floating: true },
    ];
    const { workspace } = reviveWorkspace(makeWs("w1", "p1", tabs), counter());
    const out = allPanes(workspace.paneTree)[0]!.tabs;
    expect(out[0]).toMatchObject({ dirty: false });
    expect(out[1]).toMatchObject({ dirty: false });
    expect(out[2]).toMatchObject({ floating: false });
  });

  it("keeps the id and the sleep of a hibernated terminal, whose stored session is indexed by it", () => {
    const sleeping: Tab = { id: "a", kind: "terminal", hibernation: { at: 5, agent: "claude" } };
    const tabs: Tab[] = [sleeping, term("b"), { id: "e", kind: "editor", path: "/f", dirty: false, preview: false }];
    const { workspace, idMap } = reviveWorkspace(makeWs("w1", "p1", tabs), counter());
    const out = allPanes(workspace.paneTree)[0]!.tabs;
    expect(out[0]).toEqual(sleeping);
    expect(out[1]!.id).toBe("new-1");
    expect(out[2]!.id).toBe("new-2");
    expect(idMap.get("a")).toBe("a");
    expect(idMap.get("b")).toBe("new-1");
  });

  it("does not mutate the original", () => {
    const ws = makeWs("w1", "p1", [term("a")]);
    reviveWorkspace(ws, counter());
    expect(allPanes(ws.paneTree)[0]!.tabs[0]!.id).toBe("a");
  });
});

describe("insertRestoredWorkspace", () => {
  const w = (id: string) => makeWs(id, `p-${id}`);

  it("puts the workspace back at its position", () => {
    const out = insertRestoredWorkspace([w("a"), w("c")], w("b"), 1);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("clamps an index past the end", () => {
    expect(insertRestoredWorkspace([w("a")], w("b"), 9).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("clamps a negative index", () => {
    expect(insertRestoredWorkspace([w("a")], w("b"), -3).map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("returns the same list when the workspace is already open", () => {
    const list = [w("a")];
    expect(insertRestoredWorkspace(list, w("a"), 0)).toBe(list);
  });
});

describe("buildReopenedTab", () => {
  it("assigns the new id and resets editor-specific transient flags", () => {
    const tab: Tab = { id: "old", kind: "editor", path: "/f.ts", dirty: true, preview: true, locked: true };
    expect(buildReopenedTab(tab, "new")).toEqual({ id: "new", kind: "editor", path: "/f.ts", dirty: false, preview: false, locked: false });
  });

  it("unlocks a reopened terminal tab but keeps everything else", () => {
    const tab: Tab = { id: "old", kind: "terminal", cwd: "/proj", locked: true, persistentCommand: "lazygit" };
    expect(buildReopenedTab(tab, "new")).toEqual({ id: "new", kind: "terminal", cwd: "/proj", locked: false, persistentCommand: "lazygit" });
  });

  it("keeps a hibernated terminal asleep", () => {
    const hibernation = { at: 1, agent: "claude", command: "claude --resume", title: "x" };
    const tab: Tab = { id: "old", kind: "terminal", cwd: "/proj", hibernation };
    expect(buildReopenedTab(tab, "old")).toEqual({ id: "old", kind: "terminal", cwd: "/proj", hibernation, locked: false });
  });

  it("unlocks a reopened git-diff tab and drops its preview state", () => {
    const tab: Tab = { id: "old", kind: "git-diff", path: "/f.ts", repoRoot: "/repo", mode: "+", originalPath: null, preview: true, locked: true };
    const reopened = buildReopenedTab(tab, "new");
    expect(reopened.locked).toBe(false);
    expect(reopened).toMatchObject({ preview: false });
  });

  it("leaves other kinds unchanged besides the id", () => {
    const tab: Tab = { id: "old", kind: "browser", url: "https://example.com" };
    expect(buildReopenedTab(tab, "new")).toEqual({ id: "new", kind: "browser", url: "https://example.com" });
  });
});

describe("resolveReopenSlot", () => {
  const ws = makeWs("w1", "p1", [term("a"), term("c")]);

  it("goes right after the open predecessor", () => {
    const e = tabEntry("b", "w1", "p1", { prevTabId: "a" });
    expect(resolveReopenSlot(e, [], ws)).toEqual({ paneId: "p1", index: 1 });
  });

  it("follows a closed predecessor to its own predecessor", () => {
    const e = tabEntry("c", "w1", "p1", { prevTabId: "b" });
    const b = tabEntry("b", "w1", "p1", { prevTabId: "a" });
    expect(resolveReopenSlot(e, [b], ws)).toEqual({ paneId: "p1", index: 1 });
  });

  it("goes first in its pane when it was first or the chain is lost", () => {
    expect(resolveReopenSlot(tabEntry("z", "w1", "p1"), [], ws)).toEqual({ paneId: "p1", index: 0 });
    const lost = tabEntry("z", "w1", "p1", { prevTabId: "gone" });
    expect(resolveReopenSlot(lost, [], ws)).toEqual({ paneId: "p1", index: 0 });
  });

  it("uses the pane of the predecessor when its own pane is gone", () => {
    const e = tabEntry("b", "w1", "pX", { prevTabId: "a" });
    expect(resolveReopenSlot(e, [], ws).paneId).toBe("p1");
    expect(resolveReopenSlot(tabEntry("b", "w1", "pX"), [], ws).paneId).toBe("p1");
  });

  it("survives a cycle in the chain", () => {
    const e = tabEntry("b", "w1", "p1", { prevTabId: "x" });
    const x = tabEntry("x", "w1", "p1", { prevTabId: "b" });
    expect(resolveReopenSlot(e, [x], ws)).toEqual({ paneId: "p1", index: 0 });
  });
});

describe("remapPrevTabId", () => {
  it("repoints entries that followed the reopened tab", () => {
    const out = remapPrevTabId([tabEntry("c", "w1", "p1", { prevTabId: "b" })], "b", "b2");
    expect(out[0]).toMatchObject({ prevTabId: "b2" });
  });
});

describe("orphanedSleepers", () => {
  const closed = (id: string, over: Record<string, unknown> = {}): ClosedEntry => ({
    kind: "tab",
    tab: { id, kind: "terminal", ...over } as Tab,
    paneId: "p1",
    workspaceId: "w1",
    prevTabId: null,
  });
  const sleeper = (id: string) => closed(id, { hibernation: { at: 1 } });

  it("names a sleeping tab that fell off the stack", () => {
    expect(orphanedSleepers([sleeper("a"), sleeper("b")], [sleeper("a")], new Set())).toEqual(["b"]);
  });

  it("ignores awake tabs, which have no stored lines", () => {
    expect(orphanedSleepers([closed("a")], [], new Set())).toEqual([]);
  });

  it("keeps a sleeper that is still in the stack or came back to an open tab", () => {
    expect(orphanedSleepers([sleeper("a")], [sleeper("a")], new Set())).toEqual([]);
    expect(orphanedSleepers([sleeper("a")], [], new Set(["a"]))).toEqual([]);
  });

  it("also finds the sleepers inside a closed workspace", () => {
    const ws: ClosedEntry = {
      kind: "workspace",
      index: 0,
      workspace: {
        id: "w2",
        title: "W",
        activePaneId: "p9",
        paneTree: { kind: "pane", id: "p9", tabs: [{ id: "s1", kind: "terminal", hibernation: { at: 1 } }], activeTabId: "s1" },
      } as Workspace,
    };
    expect(orphanedSleepers([ws], [], new Set())).toEqual(["s1"]);
  });
});

describe("buildReopenedTab with a held restore block", () => {
  it("drops the block from the live tab, it is seeded apart", () => {
    const tab = {
      id: "tab-a",
      kind: "terminal",
      held: { reason: "r", dir: "/d", command: "c", restorable: true },
    } as Tab;
    expect(buildReopenedTab(tab, "tab-b")).not.toHaveProperty("held");
  });
});

describe("orphanedTerminals", () => {
  const closed = (id: string, over: Record<string, unknown> = {}): ClosedEntry => ({
    kind: "tab",
    tab: { id, kind: "terminal", ...over } as Tab,
    paneId: "p1",
    workspaceId: "w1",
    prevTabId: null,
  });

  it("names awake and sleeping terminals that fell off the stack", () => {
    const sleeper = closed("b", { hibernation: { at: 1 } });
    expect(orphanedTerminals([closed("a"), sleeper, closed("c")], [closed("c")], new Set())).toEqual(["a", "b"]);
  });

  it("keeps what is still in the stack or open, and ignores other kinds of tab", () => {
    expect(orphanedTerminals([closed("a")], [closed("a")], new Set())).toEqual([]);
    expect(orphanedTerminals([closed("a")], [], new Set(["a"]))).toEqual([]);
    const doc = { kind: "tab", tab: { id: "e", kind: "editor" }, paneId: "p", workspaceId: "w", prevTabId: null } as ClosedEntry;
    expect(orphanedTerminals([doc], [], new Set())).toEqual([]);
  });
});
