import { describe, expect, it } from "vitest";
import type { LearnedMap } from "./learned";
import type { TabEntry, WorkspaceEntry } from "./tabEntries";
import {
  RECENT_LIMIT,
  SEARCH_LIMIT,
  byRecency,
  rankTabEntries,
  rankWorkspaceEntries,
  recentTabs,
} from "./tabRank";

let order = 0;
const entry = (over: Partial<TabEntry> = {}): TabEntry => ({
  tabId: `tab-${order}`,
  workspaceId: "ws-1",
  workspaceTitle: "Work",
  hibernated: false,
  kind: "terminal",
  title: "zsh",
  note: null,
  cwd: "",
  detail: "",
  worktree: "",
  branch: "",
  process: "",
  indicator: null,
  lastUsedAt: 0,
  workspaceActiveAt: 0,
  order: order++,
  ...over,
});

const ids = (list: TabEntry[]) => list.map((e) => e.tabId);

describe("recentTabs", () => {
  it("returns the 8 most recently used, newest first", () => {
    const entries = Array.from({ length: 12 }, (_, i) => entry({ tabId: `t${i}`, lastUsedAt: i + 1 }));
    expect(ids(recentTabs(entries))).toEqual(["t11", "t10", "t9", "t8", "t7", "t6", "t5", "t4"]);
    expect(RECENT_LIMIT).toBe(8);
  });

  it("puts tabs of hibernated workspaces after the awake ones, even when newer", () => {
    const entries = [
      entry({ tabId: "sleepy-new", hibernated: true, lastUsedAt: 900 }),
      entry({ tabId: "awake-old", lastUsedAt: 10 }),
      entry({ tabId: "awake-newer", lastUsedAt: 20 }),
    ];
    expect(ids(recentTabs(entries))).toEqual(["awake-newer", "awake-old", "sleepy-new"]);
  });

  it("falls back to workspace activity and then tree order for never-used tabs", () => {
    const entries = [
      entry({ tabId: "a", workspaceActiveAt: 5 }),
      entry({ tabId: "b", workspaceActiveAt: 9 }),
      entry({ tabId: "c", workspaceActiveAt: 9 }),
    ];
    expect(ids(recentTabs(entries))).toEqual(["b", "c", "a"]);
  });
});

describe("active tab", () => {
  it("is left out of the recents so the first row is a different tab", () => {
    const entries = [entry({ tabId: "current", lastUsedAt: 99 }), entry({ tabId: "previous", lastUsedAt: 50 })];
    expect(ids(recentTabs(entries, RECENT_LIMIT, "current"))).toEqual(["previous"]);
    expect(ids(rankTabEntries(entries, "", "current"))).toEqual(["previous"]);
  });

  it("is still found when typing", () => {
    const entries = [entry({ tabId: "current", title: "build" })];
    expect(ids(rankTabEntries(entries, "build", "current"))).toEqual(["current"]);
  });
});

describe("learned choices", () => {
  it("lifts the tab chosen for that term above an equal match", () => {
    const entries = [entry({ tabId: "a", title: "backlog" }), entry({ tabId: "b", title: "backlog" })];
    expect(ids(rankTabEntries(entries, "bac"))[0]).toBe("a");
    const learned: LearnedMap = { bac: { "tab:b": 4 } };
    expect(ids(rankTabEntries(entries, "bac", null, learned))[0]).toBe("b");
  });

  it("never lets learning move a title match below a location match", () => {
    const entries = [entry({ tabId: "cwd", cwd: "/work/deploy" }), entry({ tabId: "title", title: "deploy" })];
    const learned: LearnedMap = { deploy: { "tab:cwd": 500 } };
    expect(ids(rankTabEntries(entries, "deploy", null, learned))).toEqual(["title", "cwd"]);
  });

  it("lifts a workspace chosen for that term", () => {
    const ws = (id: string): WorkspaceEntry => ({ workspaceId: id, title: "Backlog", color: null, hibernated: false, tabCount: 1, lastUsedAt: 0 });
    const learned: LearnedMap = { bac: { "ws:y": 3 } };
    expect(rankWorkspaceEntries([ws("x"), ws("y")], "bac", learned).map((w) => w.workspaceId)[0]).toBe("y");
  });
});

describe("search limit", () => {
  it("caps the rows rendered while typing", () => {
    const entries = Array.from({ length: SEARCH_LIMIT + 60 }, (_, i) => entry({ tabId: `t${i}`, title: `term ${i}` }));
    expect(rankTabEntries(entries, "term")).toHaveLength(SEARCH_LIMIT);
  });
});

describe("rankTabEntries", () => {
  it("returns the recents when the term is blank", () => {
    const entries = [entry({ tabId: "a", lastUsedAt: 1 }), entry({ tabId: "b", lastUsedAt: 2 })];
    expect(ids(rankTabEntries(entries, "   "))).toEqual(["b", "a"]);
  });

  it("matches the title fuzzily", () => {
    const entries = [entry({ tabId: "a", title: "backlog board" }), entry({ tabId: "b", title: "zsh" })];
    expect(ids(rankTabEntries(entries, "blb"))).toEqual(["a"]);
  });

  it("matches the note by substring", () => {
    const entries = [entry({ tabId: "a", note: "remember to rotate the keys" }), entry({ tabId: "b" })];
    expect(ids(rankTabEntries(entries, "rotate"))).toEqual(["a"]);
  });

  it("ranks title and note matches above cwd matches, whatever the scores", () => {
    const entries = [
      entry({ tabId: "cwd", cwd: "/work/deploy" }),
      entry({ tabId: "title", title: "d e p l o y" }),
      entry({ tabId: "note", note: "deploy checklist" }),
    ];
    const ranked = ids(rankTabEntries(entries, "deploy"));
    expect(ranked.indexOf("cwd")).toBe(2);
  });

  it("orders the field classes: workspace, then cwd/worktree/branch, then process", () => {
    const entries = [
      entry({ tabId: "process", process: "kex-server" }),
      entry({ tabId: "branch", branch: "kex-fix" }),
      entry({ tabId: "workspace", workspaceTitle: "kex" }),
      entry({ tabId: "title", title: "kex" }),
    ];
    expect(ids(rankTabEntries(entries, "kex"))).toEqual(["title", "workspace", "branch", "process"]);
  });

  it("matches worktree and branch", () => {
    const entries = [
      entry({ tabId: "wt", worktree: "palette-tabs-search" }),
      entry({ tabId: "br", branch: "worktree-palette" }),
      entry({ tabId: "none" }),
    ];
    expect(ids(rankTabEntries(entries, "palette")).sort()).toEqual(["br", "wt"]);
  });

  it("breaks ties by recency with awake workspaces first", () => {
    const entries = [
      entry({ tabId: "sleepy", title: "build", hibernated: true, lastUsedAt: 99 }),
      entry({ tabId: "old", title: "build", lastUsedAt: 1 }),
      entry({ tabId: "new", title: "build", lastUsedAt: 2 }),
    ];
    expect(ids(rankTabEntries(entries, "build"))).toEqual(["new", "old", "sleepy"]);
  });

  it("treats regex and glob characters literally", () => {
    const entries = [entry({ tabId: "a", cwd: "/work/c++/app" }), entry({ tabId: "b", cwd: "/work/c/app" })];
    expect(() => rankTabEntries(entries, "c++")).not.toThrow();
    expect(ids(rankTabEntries(entries, "c++"))).toEqual(["a"]);
    for (const q of ["a.b", "[x", "(", "\\", "*", "?"]) {
      expect(() => rankTabEntries(entries, q)).not.toThrow();
    }
  });

  it("is case insensitive", () => {
    const entries = [entry({ tabId: "a", title: "Backlog" })];
    expect(ids(rankTabEntries(entries, "BACK"))).toEqual(["a"]);
  });

  it("ranks 1000 tabs quickly", () => {
    const entries = Array.from({ length: 1000 }, (_, i) =>
      entry({ tabId: `t${i}`, title: `terminal ${i}`, cwd: `/work/project-${i}/src`, branch: `feat-${i}`, note: i % 7 === 0 ? "a note about things" : null }),
    );
    const start = performance.now();
    rankTabEntries(entries, "proj");
    expect(performance.now() - start).toBeLessThan(20);
  });
});

describe("rankWorkspaceEntries", () => {
  const ws = (over: Partial<WorkspaceEntry>): WorkspaceEntry => ({
    workspaceId: "ws",
    title: "Work",
    color: null,
    hibernated: false,
    tabCount: 1,
    lastUsedAt: 0,
    ...over,
  });

  it("returns nothing for a blank term", () => {
    expect(rankWorkspaceEntries([ws({})], " ")).toEqual([]);
  });

  it("filters by title fuzzily and puts awake workspaces before hibernated ones on ties", () => {
    const list = [
      ws({ workspaceId: "sleepy", title: "Backlog", hibernated: true, lastUsedAt: 50 }),
      ws({ workspaceId: "awake", title: "Backlog", lastUsedAt: 5 }),
      ws({ workspaceId: "other", title: "Kex" }),
    ];
    expect(rankWorkspaceEntries(list, "backlog").map((w) => w.workspaceId)).toEqual(["awake", "sleepy"]);
  });
});

describe("byRecency", () => {
  it("is a stable comparator usable with sort", () => {
    const a = entry({ lastUsedAt: 1 });
    const b = entry({ lastUsedAt: 2 });
    expect(byRecency(a, b)).toBeGreaterThan(0);
    expect(byRecency(b, a)).toBeLessThan(0);
    expect(byRecency(a, a)).toBe(0);
  });
});
