import { describe, expect, it } from "vitest";
import {
  applyHibernate,
  applyStartupHibernation,
  applyWake,
  blockedWhileHibernated,
  editorTabIds,
  isPendingStale,
  enableRunOnStart,
  stripTabs,
  strippedTree,
  terminalTabs,
} from "./hibernate";
import type { SplitNode, Tab, Workspace } from "./types";

const term = (id: string, over: Partial<Extract<Tab, { kind: "terminal" }>> = {}): Tab => ({
  id,
  kind: "terminal",
  ...over,
});
const editor = (id: string, dirty: boolean): Tab => ({
  id,
  kind: "editor",
  path: `/p/${id}.ts`,
  dirty,
  preview: false,
});
const md = (id: string, dirty: boolean): Tab => ({
  id,
  kind: "markdown",
  path: `/p/${id}.md`,
  dirty,
});

const tree: SplitNode = {
  kind: "split",
  id: "s1",
  orientation: "horizontal",
  dividerPosition: 0.4,
  first: { kind: "pane", id: "p1", tabs: [term("t1"), editor("e1", true)], activeTabId: "t1" },
  second: { kind: "pane", id: "p2", tabs: [md("m1", true)], activeTabId: "m1" },
};

const ws = (over: Partial<Workspace> = {}): Workspace => ({
  id: "w1",
  title: "W",
  paneTree: tree,
  activePaneId: "p1",
  ...over,
});

describe("stripTabs", () => {
  it("keeps the split structure and divider and empties every pane", () => {
    const out = stripTabs(tree);
    expect(out.kind).toBe("split");
    if (out.kind !== "split") return;
    expect(out.dividerPosition).toBe(0.4);
    expect(out.id).toBe("s1");
    expect(out.first).toMatchObject({ kind: "pane", id: "p1", tabs: [], activeTabId: null });
    expect(out.second).toMatchObject({ kind: "pane", id: "p2", tabs: [], activeTabId: null });
  });
});

describe("applyHibernate", () => {
  it("flags only the target workspace and leaves its tab structure intact", () => {
    const out = applyHibernate([ws(), ws({ id: "w2" })], "w1");
    expect(out[0]!.hibernated).toBe(true);
    expect(out[1]!.hibernated).toBeUndefined();
    expect(terminalTabs(out[0]!).map((t) => t.id)).toEqual(["t1"]);
  });

  it("turns off floating on browser tabs so the window is not reopened on restart", () => {
    const b: Tab = { id: "b1", kind: "browser", url: "https://x.test", floating: true };
    const w = ws({ paneTree: { kind: "pane", id: "p1", tabs: [b], activeTabId: "b1" } });
    const out = applyHibernate([w], "w1")[0]!;
    const pane = out.paneTree as Extract<SplitNode, { kind: "pane" }>;
    const tab = pane.tabs[0]!;
    expect(tab.kind === "browser" && tab.floating).toBe(false);
  });

  it("clears dirty on editor and markdown tabs, which are about to be unmounted", () => {
    const out = applyHibernate([ws()], "w1")[0]!;
    const tabs = out.paneTree as Extract<SplitNode, { kind: "split" }>;
    const e = (tabs.first as Extract<SplitNode, { kind: "pane" }>).tabs[1]!;
    const m = (tabs.second as Extract<SplitNode, { kind: "pane" }>).tabs[0]!;
    expect(e.kind === "editor" && e.dirty).toBe(false);
    expect(m.kind === "markdown" && m.dirty).toBe(false);
  });
});

describe("applyWake", () => {
  it("removes the flag and keeps everything else", () => {
    const hib = applyHibernate([ws()], "w1");
    const out = applyWake(hib, "w1")[0]!;
    expect("hibernated" in out).toBe(false);
    expect(out.paneTree).toEqual(hib[0]!.paneTree);
  });
});

describe("strippedTree", () => {
  it("returns the same reference for the same input tree", () => {
    expect(strippedTree(tree)).toBe(strippedTree(tree));
  });
});

describe("blockedWhileHibernated", () => {
  it("blocks tab, pane, terminal, editor and script shortcuts", () => {
    for (const id of ["tab.new", "tab.close", "pane.splitRight", "terminal.clear", "editor.save", "workspace.run", "search.focus"] as const) {
      expect(blockedWhileHibernated(id)).toBe(true);
    }
  });

  it("lets workspace, window, view and settings shortcuts through", () => {
    for (const id of ["workspace.new", "workspace.next", "window.new", "view.zoomIn", "settings.open"] as const) {
      expect(blockedWhileHibernated(id)).toBe(false);
    }
  });
});

describe("tab selectors", () => {
  it("lists terminals and editor-like tabs across the whole tree", () => {
    expect(terminalTabs(ws()).map((t) => t.id)).toEqual(["t1"]);
    expect(editorTabIds(ws())).toEqual(["e1", "m1"]);
  });
});

describe("enableRunOnStart", () => {
  it("turns it on and adopts the running command when none is saved", () => {
    expect(enableRunOnStart(term("t1"), "npm run dev")).toMatchObject({
      restoreOnRestart: true,
      persistentCommand: "npm run dev",
    });
  });

  it("keeps an already saved persistent command", () => {
    expect(enableRunOnStart(term("t1", { persistentCommand: "make" }), "other")).toMatchObject({
      restoreOnRestart: true,
      persistentCommand: "make",
    });
  });

  it("turns it back on for an agent that had it explicitly off", () => {
    expect(enableRunOnStart(term("t1", { restoreOnRestart: false }), undefined)).toMatchObject({
      restoreOnRestart: true,
    });
  });

  it("ignores non-terminal tabs", () => {
    const e = editor("e1", false);
    expect(enableRunOnStart(e, "x")).toBe(e);
  });
});

describe("applyStartupHibernation", () => {
  const three = () => [ws({ id: "a" }), ws({ id: "b" }), ws({ id: "c" })];

  it("keeps the active workspace awake and hibernates the rest", () => {
    const out = applyStartupHibernation(three(), 1, false);
    expect(out.map((w) => w.hibernated)).toEqual([true, undefined, true]);
  });

  it("turns off floating on browser tabs of the hibernated workspaces", () => {
    const b: Tab = { id: "b1", kind: "browser", url: "https://x.test", floating: true };
    const w = ws({ id: "x", paneTree: { kind: "pane", id: "p1", tabs: [b], activeTabId: "b1" } });
    const out = applyStartupHibernation([ws({ id: "a" }), w], 0, false);
    const pane = out[1]!.paneTree as Extract<SplitNode, { kind: "pane" }>;
    const tab = pane.tabs[0]!;
    expect(tab.kind === "browser" && tab.floating).toBe(false);
  });

  it("leaves already hibernated workspaces hibernated", () => {
    const out = applyStartupHibernation([ws({ id: "a" }), ws({ id: "b", hibernated: true })], 0, false);
    expect(out.map((w) => w.hibernated)).toEqual([undefined, true]);
  });

  it("keeps the active workspace hibernated if it already was", () => {
    const out = applyStartupHibernation([ws({ id: "a", hibernated: true }), ws({ id: "b" })], 0, false);
    expect(out.map((w) => w.hibernated)).toEqual([true, true]);
  });

  it("returns the same array when restoreAll is true", () => {
    const input = three();
    expect(applyStartupHibernation(input, 0, true)).toBe(input);
  });

  it("clamps an out-of-range activeIndex", () => {
    expect(applyStartupHibernation(three(), 99, false).map((w) => w.hibernated)).toEqual([true, true, undefined]);
    expect(applyStartupHibernation(three(), -3, false).map((w) => w.hibernated)).toEqual([undefined, true, true]);
  });

  it("does not touch a single workspace", () => {
    expect(applyStartupHibernation([ws()], 0, false)[0]!.hibernated).toBeUndefined();
  });

  it("returns an empty array as is", () => {
    const input: Workspace[] = [];
    expect(applyStartupHibernation(input, 0, false)).toBe(input);
  });
});

describe("isPendingStale", () => {
  it("is false without a pending id", () => {
    expect(isPendingStale(null, [{ id: "a" }])).toBe(false);
  });
  it("is false while the pending workspace exists", () => {
    expect(isPendingStale("a", [{ id: "a" }, { id: "b" }])).toBe(false);
  });
  it("is true once the pending workspace is gone", () => {
    expect(isPendingStale("a", [{ id: "b" }])).toBe(true);
  });
});
