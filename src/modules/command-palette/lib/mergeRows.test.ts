import { describe, expect, it } from "vitest";
import type { PaletteItem } from "../types";
import type { ClosedTabEntry } from "./closedEntries";
import type { LearnedMap } from "./learned";
import { type MergeInput, mergeRows } from "./mergeRows";
import type { TabEntry, WorkspaceEntry } from "./tabEntries";

let n = 0;
const cmd = (id: string, title: string, group = "General"): PaletteItem => ({ id, title, group, run: () => {} });
const tab = (tabId: string, over: Partial<TabEntry> = {}): TabEntry => ({
  tabId,
  workspaceId: "ws-1",
  workspaceTitle: "Work",
  workspaceColor: null,
  workspaceIcon: null,
  hibernated: false,
  kind: "terminal",
  title: "zsh",
  note: null,
  cwd: "",
  detail: "",
  worktree: "",
  branch: "",
  process: "",
  command: "",
  agent: "",
  indicator: null,
  tab: { id: tabId, kind: "terminal" },
  agentSession: undefined,
  running: false,
  lastUsedAt: 0,
  workspaceActiveAt: 0,
  order: n++,
  ...over,
});
const ws = (workspaceId: string, title: string): WorkspaceEntry => ({
  workspaceId,
  title,
  color: null,
  icon: null,
  hibernated: false,
  tabCount: 1,
  lastUsedAt: 0,
});
const closed = (path: string, over: Partial<ClosedTabEntry> = {}): ClosedTabEntry => ({
  kind: "terminal",
  path,
  workspaceId: "ws-1",
  uses: 0,
  lastUsedAt: 0,
  key: `closed:terminal:${path}`,
  title: path.split("/").pop() || path,
  detail: path,
  workspaceTitle: "Work",
  workspaceColor: null,
  workspaceIcon: null,
  hibernated: false,
  ...over,
});

const input = (over: Partial<MergeInput>): MergeInput => ({
  commands: [],
  tabs: [],
  workspaces: [],
  term: "",
  activeTabId: null,
  learned: {},
  mru: {},
  ...over,
});
const keys = (rows: ReturnType<typeof mergeRows>) => rows.map((r) => r.key);

describe("mergeRows", () => {
  it("puts a command that matches better than a tab before it", () => {
    const rows = mergeRows(
      input({
        term: "hibernate",
        commands: [cmd("workspace.hibernate", "Hibernate Workspace")],
        tabs: [tab("t1", { title: "my hibernate notes" })],
      }),
    );
    expect(keys(rows)[0]).toBe("cmd:workspace.hibernate");
  });

  it("puts a tab that matches better than a command before it", () => {
    const rows = mergeRows(
      input({
        term: "kex",
        commands: [cmd("a", "Keyboard exploration")],
        tabs: [tab("t1", { title: "kex" })],
      }),
    );
    expect(keys(rows)[0]).toBe("tab:t1");
  });

  it("keeps the tab tiers: a location match never beats a title or command match", () => {
    const rows = mergeRows(
      input({
        term: "deploy",
        commands: [cmd("c", "Deploy now")],
        tabs: [tab("cwd", { cwd: "/work/deploy" }), tab("title", { title: "deploy" })],
      }),
    );
    const k = keys(rows);
    expect(k.indexOf("tab:title")).toBeLessThan(k.indexOf("tab:cwd"));
    expect(k.indexOf("cmd:c")).toBeLessThan(k.indexOf("tab:cwd"));
  });

  it("lets a row the user keeps choosing for this text become the first one", () => {
    const base = input({
      term: "set",
      commands: [cmd("a", "Settings"), cmd("b", "Appearance settings", "Settings")],
    });
    expect(keys(mergeRows(base))[0]).toBe("cmd:a");
    const learned: LearnedMap = { set: { "cmd:b": 8 } };
    expect(keys(mergeRows({ ...base, learned }))[0]).toBe("cmd:b");
  });

  it("never lets learning lift a location match above a title match", () => {
    const learned: LearnedMap = { deploy: { "tab:cwd": 500 } };
    const rows = mergeRows(
      input({
        term: "deploy",
        tabs: [tab("cwd", { cwd: "/work/deploy" }), tab("title", { title: "deploy" })],
        learned,
      }),
    );
    expect(keys(rows)).toEqual(["tab:title", "tab:cwd"]);
  });

  it("includes workspaces", () => {
    const rows = mergeRows(input({ term: "back", workspaces: [ws("w1", "Backlog")] }));
    expect(keys(rows)).toEqual(["ws:w1"]);
  });

  it("with an empty term lists closed entries between recents and actions", () => {
    const rows = mergeRows(
      input({
        commands: [cmd("a", "A")],
        tabs: [tab("t1", { lastUsedAt: 5 })],
        closed: [closed("/work/api"), closed("/work/ui")],
      }),
    );
    expect(keys(rows)).toEqual([
      "tab:t1",
      "closed:terminal:/work/api",
      "closed:terminal:/work/ui",
      "cmd:a",
    ]);
  });

  it("finds a closed entry by its name and by its full path", () => {
    expect(keys(mergeRows(input({ term: "api", closed: [closed("/work/api")] })))).toEqual([
      "closed:terminal:/work/api",
    ]);
    expect(keys(mergeRows(input({ term: "work/ap", closed: [closed("/work/api")] })))).toEqual([
      "closed:terminal:/work/api",
    ]);
  });

  it("lets a heavily reused closed entry beat a live tab, but not one with no use behind it", () => {
    const live = tab("t1", { title: "api" });
    const fresh = closed("/work/api", { uses: 0 });
    const used = closed("/work/api", { uses: 20 });
    expect(keys(mergeRows(input({ term: "api", tabs: [live], closed: [fresh] })))).toEqual([
      "tab:t1",
      "closed:terminal:/work/api",
    ]);
    expect(keys(mergeRows(input({ term: "api", tabs: [live], closed: [used] })))).toEqual([
      "closed:terminal:/work/api",
      "tab:t1",
    ]);
  });

  it("caps the closed rows rendered while typing", () => {
    const closedEntries = Array.from({ length: 40 }, (_, i) =>
      closed(`/work/term-${i}`, { uses: i }),
    );
    const rows = mergeRows(input({ term: "term", closed: closedEntries }));
    expect(rows.filter((r) => r.kind === "closed").length).toBeLessThanOrEqual(12);
  });

  it("returns nothing for rows that do not match", () => {
    expect(mergeRows(input({ term: "zzz", commands: [cmd("a", "Settings")], tabs: [tab("t")] }))).toEqual([]);
  });

  it("caps the tabs rendered while typing, but never drops a matching command", () => {
    const tabs = Array.from({ length: 100 }, (_, i) => tab(`t${i}`, { title: `term ${i}` }));
    const rows = mergeRows(input({ term: "term", tabs, commands: [cmd("c", "Terminal settings")] }));
    expect(rows.filter((r) => r.kind === "tab").length).toBeLessThanOrEqual(40);
    expect(keys(rows)).toContain("cmd:c");
  });

  it("with an empty term lists recents, then every action in its given order", () => {
    const rows = mergeRows(
      input({
        commands: [cmd("a", "A"), cmd("b", "B")],
        tabs: [tab("old", { lastUsedAt: 1 }), tab("new", { lastUsedAt: 2 })],
      }),
    );
    expect(keys(rows)).toEqual(["tab:new", "tab:old", "cmd:a", "cmd:b"]);
  });

  it("with an empty term leaves out the active tab", () => {
    const rows = mergeRows(
      input({ tabs: [tab("here", { lastUsedAt: 9 }), tab("other", { lastUsedAt: 1 })], activeTabId: "here" }),
    );
    expect(keys(rows)).toEqual(["tab:other"]);
  });

  it("with an empty term orders actions by recent use", () => {
    const rows = mergeRows(input({ commands: [cmd("a", "A"), cmd("b", "B")], mru: { b: 9 } }));
    expect(keys(rows)).toEqual(["cmd:b", "cmd:a"]);
  });

  it("treats regex and glob characters literally", () => {
    const tabs = [tab("a", { cwd: "/work/c++/app" }), tab("b", { cwd: "/work/c/app" })];
    for (const q of ["a.b", "[x", "(", "\\", "*", "?"]) {
      expect(() => mergeRows(input({ term: q, tabs }))).not.toThrow();
    }
    expect(keys(mergeRows(input({ term: "c++", tabs })))).toEqual(["tab:a"]);
  });

  it("is case insensitive", () => {
    expect(keys(mergeRows(input({ term: "BACK", tabs: [tab("a", { title: "Backlog" })] })))).toEqual(["tab:a"]);
  });

  it("matches worktree, branch and process as the lowest tab tiers, in that order", () => {
    const tabs = [
      tab("process", { process: "kex-server" }),
      tab("branch", { branch: "kex-fix" }),
      tab("workspace", { workspaceTitle: "kex" }),
      tab("title", { title: "kex" }),
    ];
    expect(keys(mergeRows(input({ term: "kex", tabs })))).toEqual(["tab:title", "tab:workspace", "tab:branch", "tab:process"]);
  });

  it("keeps a tab found by process, branch or location above actions that only match scattered letters", () => {
    const commands = [cmd("full", "Toggle full pane"), cmd("git", "Toggle Git panel")];
    for (const field of [{ process: "top" }, { branch: "top-fix" }, { cwd: "/work/top" }, { worktree: "top" }]) {
      const rows = mergeRows(input({ term: "top", commands, tabs: [tab("t", field)] }));
      expect(keys(rows)[0]).toBe("tab:t");
    }
  });

  it("still ranks an action that contains the typed text above a tab found by process", () => {
    const rows = mergeRows(input({ term: "top", commands: [cmd("bar", "Top bar")], tabs: [tab("t", { process: "top" })] }));
    expect(keys(rows)).toEqual(["cmd:bar", "tab:t"]);
  });

  it("breaks ties by recency with awake workspaces first", () => {
    const tabs = [
      tab("sleepy", { title: "build", hibernated: true, lastUsedAt: 99 }),
      tab("old", { title: "build", lastUsedAt: 1 }),
      tab("new", { title: "build", lastUsedAt: 2 }),
    ];
    expect(keys(mergeRows(input({ term: "build", tabs })))).toEqual(["tab:new", "tab:old", "tab:sleepy"]);
  });

  it("keeps the active tab findable while typing", () => {
    const rows = mergeRows(input({ term: "build", tabs: [tab("here", { title: "build" })], activeTabId: "here" }));
    expect(keys(rows)).toEqual(["tab:here"]);
  });

  it("limits the recents to 8", () => {
    const tabs = Array.from({ length: 12 }, (_, i) => tab(`t${i}`, { lastUsedAt: i + 1 }));
    expect(mergeRows(input({ tabs })).length).toBe(8);
  });

  it("ranks 1000 tabs and the whole catalog well under a keystroke", () => {
    const tabs = Array.from({ length: 1000 }, (_, i) =>
      tab(`t${i}`, { title: `terminal ${i}`, cwd: `/work/project-${i}/src`, branch: `feat-${i}`, note: i % 7 === 0 ? "a note about things" : null }),
    );
    const commands = Array.from({ length: 80 }, (_, i) => cmd(`c${i}`, `Command number ${i}`));
    const start = performance.now();
    mergeRows(input({ term: "proj", tabs, commands }));
    expect(performance.now() - start).toBeLessThan(40);
  });

  it("drops sparse subsequences that would flood a short query", () => {
    const commands = [
      cmd("sidebar.showExplorer", "Explorer (cycle root)", "Sidebar"),
      cmd("search.focus", "Find in current tab", "Search"),
      cmd("settings.section.terminal", "Terminal settings", "Settings"),
      cmd("workspace.hibernate", "Hibernate Workspace"),
    ];
    const k = keys(mergeRows(input({ term: "ser", commands })));
    expect(k).not.toContain("cmd:sidebar.showExplorer");
    expect(k).not.toContain("cmd:workspace.hibernate");
  });

  it("does not match on the internal id", () => {
    expect(keys(mergeRows(input({ term: "secret", commands: [cmd("zzz.secret.id", "Open settings")] })))).toEqual([]);
  });

  it("puts the recents of hibernated workspaces after the awake ones, even when newer", () => {
    const tabs = [
      tab("sleepy-new", { hibernated: true, lastUsedAt: 900 }),
      tab("awake-old", { lastUsedAt: 10 }),
      tab("awake-newer", { lastUsedAt: 20 }),
    ];
    expect(keys(mergeRows(input({ tabs })))).toEqual(["tab:awake-newer", "tab:awake-old", "tab:sleepy-new"]);
  });

  it("orders never-used recents by workspace activity, then tree order", () => {
    const tabs = [
      tab("a", { workspaceActiveAt: 5 }),
      tab("b", { workspaceActiveAt: 9 }),
      tab("c", { workspaceActiveAt: 9 }),
    ];
    expect(keys(mergeRows(input({ tabs })))).toEqual(["tab:b", "tab:c", "tab:a"]);
  });

  it("does not let a learned command appear for text it does not match", () => {
    const learned: LearnedMap = { sea: { "cmd:b": 8 } };
    const commands = [cmd("a", "Search files"), cmd("b", "Hibernate")];
    expect(keys(mergeRows(input({ term: "sea", commands, learned })))).toEqual(["cmd:a"]);
  });

  it("does not let learning bury a far better command match", () => {
    const commands = [cmd("a", "Settings"), cmd("b", "Sidebar: toggle terminal inspector", "Sidebar")];
    const learned: LearnedMap = { set: { "cmd:b": 500 } };
    expect(keys(mergeRows(input({ term: "settings", commands, learned })))).toEqual(["cmd:a"]);
  });
});
