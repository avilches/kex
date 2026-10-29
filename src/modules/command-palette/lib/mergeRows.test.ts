import { describe, expect, it } from "vitest";
import type { PaletteItem } from "../types";
import type { ClosedTabEntry } from "./closedEntries";
import type { LearnedMap } from "./learned";
import { type MergeInput, mergeRows } from "./mergeRows";
import type { TabEntry, WorkspaceEntry } from "./tabEntries";

let n = 0;
const cmd = (id: string, title: string, group = "General"): PaletteItem => ({
  id,
  title,
  group,
  run: () => {},
});
const tab = (tabId: string, over: Partial<TabEntry> = {}): TabEntry => ({
  tabId,
  workspaceId: "ws-1",
  workspaceTitle: "Work",
  workspaceColor: null,
  workspaceIcon: null, workspaceRoot: null,
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
  order: n++,
  ...over,
});
const ws = (workspaceId: string, title: string): WorkspaceEntry => ({
  workspaceId,
  title,
  color: null,
  icon: null,
  canHibernate: false,
  tabCount: 1,
  root: null,
  lastUsedAt: 0,
});
const closed = (
  path: string,
  over: Partial<ClosedTabEntry> = {},
): ClosedTabEntry => ({
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
  it("puts every matching tab before a command, whatever the scores", () => {
    const rows = mergeRows(
      input({
        term: "hibernate",
        commands: [cmd("tab.hibernate", "Hibernate Tab")],
        tabs: [tab("t1", { title: "my hibernate notes" })],
      }),
    );
    expect(keys(rows)).toEqual(["tab:t1", "cmd:tab.hibernate"]);
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

  it("orders the matching tabs like the empty list, not by where the text matched", () => {
    const rows = mergeRows(
      input({
        term: "deploy",
        commands: [cmd("c", "Deploy now")],
        tabs: [
          tab("cwd", { cwd: "/work/deploy" }),
          tab("title", { title: "deploy" }),
        ],
      }),
    );
    expect(keys(rows)).toEqual(["tab:cwd", "tab:title", "cmd:c"]);
  });

  it("lets a row the user keeps choosing for this text become the first one", () => {
    const base = input({
      term: "set",
      commands: [
        cmd("a", "Settings"),
        cmd("b", "Appearance settings", "Settings"),
      ],
    });
    expect(keys(mergeRows(base))[0]).toBe("cmd:a");
    const learned: LearnedMap = { set: { "cmd:b": 8 } };
    expect(keys(mergeRows({ ...base, learned }))[0]).toBe("cmd:b");
  });

  it("never lets learning reorder the matching tabs", () => {
    const learned: LearnedMap = { deploy: { "tab:title": 500 } };
    const rows = mergeRows(
      input({
        term: "deploy",
        tabs: [
          tab("cwd", { cwd: "/work/deploy", lastUsedAt: 9 }),
          tab("title", { title: "deploy", lastUsedAt: 1 }),
        ],
        learned,
      }),
    );
    expect(keys(rows)).toEqual(["tab:cwd", "tab:title"]);
  });

  it("does not let learning pick which tabs fit under the cap", () => {
    const tabs = Array.from({ length: 60 }, (_, i) => tab(`t${i}`, { title: `term ${i}`, lastUsedAt: 100 - i }));
    const learned: LearnedMap = { term: { "tab:t59": 500 } };
    const rows = mergeRows(input({ term: "term", tabs, learned }));
    expect(keys(rows)).toEqual(keys(mergeRows(input({ term: "term", tabs }))));
  });

  it("includes workspaces", () => {
    const rows = mergeRows(
      input({ term: "back", workspaces: [ws("w1", "Backlog")] }),
    );
    expect(keys(rows)).toEqual(["ws:w1"]);
  });

  it("with an empty term puts attention tabs first, then busy ones, then the rest by recency", () => {
    const rows = mergeRows(
      input({
        tabs: [
          tab("old", { lastUsedAt: 1 }),
          tab("recent", { lastUsedAt: 9 }),
          tab("busy", { lastUsedAt: 2, indicator: "working" }),
          tab("ping", { lastUsedAt: 1, indicator: "attention" }),
        ],
      }),
    );
    expect(keys(rows)).toEqual(["tab:ping", "tab:busy", "tab:recent", "tab:old"]);
  });

  it("keeps a workspace row even when one of its tabs is already in the results, after the tabs", () => {
    const rows = mergeRows(
      input({
        term: "back",
        tabs: [tab("t", { title: "backend", workspaceId: "w1" })],
        workspaces: [ws("w1", "Backlog"), ws("w2", "Backup")],
      }),
    );
    expect(keys(rows)).toEqual(["tab:t", "ws:w1", "ws:w2"]);
  });

  it("lists the active workspace while typing, flagged as current", () => {
    const rows = mergeRows(
      input({
        term: "back",
        activeWorkspaceId: "w1",
        workspaces: [ws("w1", "Backlog"), ws("w2", "Backup")],
      }),
    );
    expect(keys(rows)).toEqual(["ws:w1", "ws:w2"]);
    expect(rows.map((r) => r.kind === "workspace" && r.current)).toEqual([true, undefined]);
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
    expect(
      keys(mergeRows(input({ term: "api", closed: [closed("/work/api")] }))),
    ).toEqual(["closed:terminal:/work/api"]);
    expect(
      keys(
        mergeRows(input({ term: "work/ap", closed: [closed("/work/api")] })),
      ),
    ).toEqual(["closed:terminal:/work/api"]);
  });

  it("keeps a live tab before a closed entry, however much the entry was reused", () => {
    const live = tab("t1", { title: "api" });
    const fresh = closed("/work/api", { uses: 0 });
    const used = closed("/work/api", { uses: 20 });
    expect(
      keys(mergeRows(input({ term: "api", tabs: [live], closed: [fresh] }))),
    ).toEqual(["tab:t1", "closed:terminal:/work/api"]);
    expect(
      keys(mergeRows(input({ term: "api", tabs: [live], closed: [used] }))),
    ).toEqual(["tab:t1", "closed:terminal:/work/api"]);
  });

  it("caps the closed rows rendered while typing", () => {
    const closedEntries = Array.from({ length: 40 }, (_, i) =>
      closed(`/work/term-${i}`, { uses: i }),
    );
    const rows = mergeRows(input({ term: "term", closed: closedEntries }));
    expect(rows.filter((r) => r.kind === "closed").length).toBeLessThanOrEqual(
      12,
    );
  });

  it("returns nothing for rows that do not match", () => {
    expect(
      mergeRows(
        input({
          term: "zzz",
          commands: [cmd("a", "Settings")],
          tabs: [tab("t")],
        }),
      ),
    ).toEqual([]);
  });

  it("caps the tabs rendered while typing, but never drops a matching command", () => {
    const tabs = Array.from({ length: 100 }, (_, i) =>
      tab(`t${i}`, { title: `term ${i}` }),
    );
    const rows = mergeRows(
      input({ term: "term", tabs, commands: [cmd("c", "Terminal settings")] }),
    );
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

  it("with an empty term puts the active tab first, apart from the recents", () => {
    const rows = mergeRows(
      input({
        tabs: [tab("here", { lastUsedAt: 9 }), tab("other", { lastUsedAt: 1 })],
        activeTabId: "here",
      }),
    );
    expect(keys(rows)).toEqual(["tab:here", "tab:other"]);
  });

  it("with an empty term orders actions by recent use", () => {
    const rows = mergeRows(
      input({ commands: [cmd("a", "A"), cmd("b", "B")], mru: { b: 9 } }),
    );
    expect(keys(rows)).toEqual(["cmd:b", "cmd:a"]);
  });

  it("treats regex and glob characters literally", () => {
    const tabs = [
      tab("a", { cwd: "/work/c++/app" }),
      tab("b", { cwd: "/work/c/app" }),
    ];
    for (const q of ["a.b", "[x", "(", "\\", "*", "?"]) {
      expect(() => mergeRows(input({ term: q, tabs }))).not.toThrow();
    }
    expect(keys(mergeRows(input({ term: "c++", tabs })))).toEqual(["tab:a"]);
  });

  it("is case insensitive", () => {
    expect(
      keys(
        mergeRows(
          input({ term: "BACK", tabs: [tab("a", { title: "Backlog" })] }),
        ),
      ),
    ).toEqual(["tab:a"]);
  });

  it("matches worktree, branch and process, and lists those tabs in the order of the empty list", () => {
    const tabs = [
      tab("process", { process: "kex-server", lastUsedAt: 1 }),
      tab("branch", { branch: "kex-fix", lastUsedAt: 4 }),
      tab("workspace", { workspaceTitle: "kex", lastUsedAt: 3 }),
      tab("title", { title: "kex", lastUsedAt: 2 }),
      tab("busy", { process: "kex", running: true, lastUsedAt: 0 }),
      tab("alert", { branch: "kex", indicator: "attention", lastUsedAt: 0 }),
    ];
    expect(keys(mergeRows(input({ term: "kex", tabs })))).toEqual([
      "tab:alert",
      "tab:busy",
      "tab:branch",
      "tab:workspace",
      "tab:title",
      "tab:process",
    ]);
  });

  it("keeps a tab found by process, branch or location above actions that only match scattered letters", () => {
    const commands = [
      cmd("full", "Toggle full pane"),
      cmd("git", "Toggle Git panel"),
    ];
    for (const field of [
      { process: "top" },
      { branch: "top-fix" },
      { cwd: "/work/top" },
      { worktree: "top" },
    ]) {
      const rows = mergeRows(
        input({ term: "top", commands, tabs: [tab("t", field)] }),
      );
      expect(keys(rows)[0]).toBe("tab:t");
    }
  });

  it("lists a tab found by process before an action that contains the typed text", () => {
    const rows = mergeRows(
      input({
        term: "top",
        commands: [cmd("bar", "Top bar")],
        tabs: [tab("t", { process: "top" })],
      }),
    );
    expect(keys(rows)).toEqual(["tab:t", "cmd:bar"]);
  });

  it("breaks ties by recency, asleep or not", () => {
    const tabs = [
      tab("sleepy", { title: "build", hibernated: true, lastUsedAt: 99 }),
      tab("old", { title: "build", lastUsedAt: 1 }),
      tab("new", { title: "build", lastUsedAt: 2 }),
    ];
    expect(keys(mergeRows(input({ term: "build", tabs })))).toEqual([
      "tab:sleepy",
      "tab:new",
      "tab:old",
    ]);
  });

  it("keeps the active tab findable while typing", () => {
    const rows = mergeRows(
      input({
        term: "build",
        tabs: [tab("here", { title: "build" })],
        activeTabId: "here",
      }),
    );
    expect(keys(rows)).toEqual(["tab:here"]);
  });

  it("limits the recents to 8", () => {
    const tabs = Array.from({ length: 12 }, (_, i) =>
      tab(`t${i}`, { lastUsedAt: i + 1 }),
    );
    expect(mergeRows(input({ tabs })).length).toBe(8);
  });

  it("ranks 1000 tabs and the whole catalog well under a keystroke", () => {
    const tabs = Array.from({ length: 1000 }, (_, i) =>
      tab(`t${i}`, {
        title: `terminal ${i}`,
        cwd: `/work/project-${i}/src`,
        branch: `feat-${i}`,
        note: i % 7 === 0 ? "a note about things" : null,
      }),
    );
    const commands = Array.from({ length: 80 }, (_, i) =>
      cmd(`c${i}`, `Command number ${i}`),
    );
    const start = performance.now();
    mergeRows(input({ term: "proj", tabs, commands }));
    expect(performance.now() - start).toBeLessThan(40);
  });

  it("drops sparse subsequences that would flood a short query", () => {
    const commands = [
      cmd("sidebar.showExplorer", "Explorer (cycle root)", "Sidebar"),
      cmd("search.focus", "Find in current tab", "Search"),
      cmd("settings.section.terminal", "Terminal settings", "Settings"),
      cmd("tab.hibernate", "Hibernate Tab"),
    ];
    const k = keys(mergeRows(input({ term: "ser", commands })));
    expect(k).not.toContain("cmd:sidebar.showExplorer");
    expect(k).not.toContain("cmd:tab.hibernate");
  });

  it("does not match on the internal id", () => {
    expect(
      keys(
        mergeRows(
          input({
            term: "secret",
            commands: [cmd("zzz.secret.id", "Open settings")],
          }),
        ),
      ),
    ).toEqual([]);
  });

  it("orders the recents of hibernated tabs by use like any other, so a tab keeps its place when it falls asleep", () => {
    const tabs = [
      tab("sleepy-new", { hibernated: true, lastUsedAt: 900 }),
      tab("awake-old", { lastUsedAt: 10 }),
      tab("awake-newer", { lastUsedAt: 20 }),
    ];
    expect(keys(mergeRows(input({ tabs })))).toEqual([
      "tab:sleepy-new",
      "tab:awake-newer",
      "tab:awake-old",
    ]);
  });

  it("orders never-used recents by tree order", () => {
    const tabs = [tab("a", {}), tab("b", {}), tab("c", {})];
    expect(keys(mergeRows(input({ tabs })))).toEqual(["tab:a", "tab:b", "tab:c"]);
  });

  it("does not let a learned command appear for text it does not match", () => {
    const learned: LearnedMap = { sea: { "cmd:b": 8 } };
    const commands = [cmd("a", "Search files"), cmd("b", "Hibernate")];
    expect(keys(mergeRows(input({ term: "sea", commands, learned })))).toEqual([
      "cmd:a",
    ]);
  });

  it("does not let learning bury a far better command match", () => {
    const commands = [
      cmd("a", "Settings"),
      cmd("b", "Sidebar: toggle terminal inspector", "Sidebar"),
    ];
    const learned: LearnedMap = { set: { "cmd:b": 500 } };
    expect(
      keys(mergeRows(input({ term: "settings", commands, learned }))),
    ).toEqual(["cmd:a"]);
  });
});

describe("mergeRows highlight", () => {
  it("bolds the title characters a fuzzy match covered", () => {
    const rows = mergeRows(
      input({ term: "set", commands: [cmd("a", "Settings")] }),
    );
    expect(rows[0]).toMatchObject({
      highlight: { field: "title", indices: [0, 1, 2] },
    });
  });

  it("does not highlight a command whose best field was its group or keywords", () => {
    const rows = mergeRows(
      input({
        term: "term",
        commands: [cmd("a", "Open the panel", "Terminal")],
      }),
    );
    expect(rows[0].highlight).toBeUndefined();
  });

  it("highlights the tab title it matched and nothing when a later field won", () => {
    const rows = mergeRows(
      input({ term: "build", tabs: [tab("t", { title: "build notes" })] }),
    );
    expect(rows[0]).toMatchObject({
      highlight: { field: "title", indices: [0, 1, 2, 3, 4] },
    });
    const byNote = mergeRows(
      input({
        term: "deploy",
        tabs: [tab("t", { title: "zsh", note: "how to deploy" })],
      }),
    );
    expect(byNote[0].highlight).toBeUndefined();
    const byWorkspace = mergeRows(
      input({
        term: "back",
        tabs: [tab("t", { title: "zsh", workspaceTitle: "Backlog" })],
      }),
    );
    expect(byWorkspace[0]).toMatchObject({
      highlight: { field: "workspace", indices: [0, 1, 2, 3] },
    });
  });

  it("highlights a workspace title and a closed entry detail", () => {
    const rows = mergeRows(
      input({ term: "back", workspaces: [ws("w1", "Backlog")] }),
    );
    expect(rows[0]).toMatchObject({
      highlight: { field: "title", indices: [0, 1, 2, 3] },
    });
    const closedRows = mergeRows(
      input({ term: "work/ap", closed: [closed("/work/api")] }),
    );
    expect(closedRows[0]).toMatchObject({
      highlight: { field: "detail", indices: [1, 2, 3, 4, 5, 6, 7] },
    });
  });

  it("leaves the empty-term rows untouched", () => {
    const rows = mergeRows(
      input({ commands: [cmd("a", "A")], tabs: [tab("t")] }),
    );
    expect(rows.every((r) => !r.highlight)).toBe(true);
  });
});

describe("mergeRows with Actions", () => {
  const item = (id: string, name: string) =>
    ({ id, name, global: false, state: "idle", stoppable: false, disabledReason: null, action: { id } }) as never;

  it("lists the Actions after the recents and before the commands when the term is empty", () => {
    const rows = mergeRows(input({ commands: [cmd("c", "C")], actions: [item("a", "Dev")], tabs: [tab("t")] }));
    expect(keys(rows)).toEqual(["tab:t", "act:a", "cmd:c"]);
  });

  it("finds an Action by its name", () => {
    const rows = mergeRows(input({ term: "dev", commands: [cmd("c", "Zzz")], actions: [item("a", "Dev server")] }));
    expect(keys(rows)).toEqual(["act:a"]);
    expect(rows[0]).toMatchObject({ highlight: { field: "title" } });
  });

  const expanded = (id: string, name: string, subtitle: string) =>
    ({ ...(item(id, name) as object), subtitle }) as never;

  it("finds an app by the value its template expands to", () => {
    const rows = mergeRows(
      input({ term: "hub/proj", actions: [expanded("a", "PyCharm {workspace}", "/Users/me/Hub/Projects/x")] }),
    );
    expect(keys(rows)).toEqual(["act:a"]);
    expect(rows[0]).toMatchObject({ highlight: { field: "detail" } });
  });

  it("finds a script by the folder shown under its name", () => {
    const rows = mergeRows(input({ term: "home", actions: [expanded("s", "dev", "Home")] }));
    expect(keys(rows)).toEqual(["act:s"]);
  });

  it("finds an Action by its name and its value read together", () => {
    const rows = mergeRows(
      input({ term: "pycharm kex", actions: [expanded("a", "PyCharm {workspace}", "/work/Kex")] }),
    );
    expect(keys(rows)).toEqual(["act:a"]);
  });

  it("does not match the raw template suffix of the name", () => {
    const rows = mergeRows(input({ term: "workspace", actions: [expanded("a", "PyCharm {workspace}", "/work/x")] }));
    expect(keys(rows)).toEqual([]);
  });
});

describe("idle list workspaces", () => {
  const base = {
    commands: [],
    tabs: [],
    term: "",
    activeTabId: null,
    learned: {},
    mru: {},
  };

  it("offers every workspace, the active one flagged, empty ones included, most recent first", () => {
    const rows = mergeRows({
      ...base,
      activeWorkspaceId: "a",
      workspaces: [
        ws("a", "A"),
        { ...ws("b", "B"), tabCount: 0, lastUsedAt: 1 },
        { ...ws("c", "C"), lastUsedAt: 5 },
      ],
    });
    expect(rows.map((r) => r.key)).toEqual(["ws:c", "ws:b", "ws:a"]);
    expect(rows.map((r) => r.kind === "workspace" && r.current)).toEqual([undefined, undefined, true]);
  });

  describe("current tab", () => {
    const tabs = [
      tab("a", { title: "alpha", lastUsedAt: 3 }),
      tab("b", { title: "beta", lastUsedAt: 2 }),
      tab("c", { title: "alpha two", lastUsedAt: 1 }),
    ];

    it("is the first row when the box is empty, flagged, and not repeated in the recents", () => {
      const rows = mergeRows(input({ tabs, activeTabId: "c" }));
      expect(keys(rows).slice(0, 3)).toEqual(["tab:c", "tab:a", "tab:b"]);
      expect(rows.filter((r) => r.kind === "tab" && r.current)).toHaveLength(1);
    });

    it("has no section when the active tab is not among the entries", () => {
      const rows = mergeRows(input({ tabs, activeTabId: "zz" }));
      expect(rows.some((r) => r.kind === "tab" && r.current)).toBe(false);
    });

    it("stays on top while typing when it matches, even below a better match", () => {
      const rows = mergeRows(input({ tabs, term: "alpha", activeTabId: "c" }));
      expect(keys(rows)).toEqual(["tab:c", "tab:a"]);
      expect(rows[0].kind === "tab" && rows[0].current).toBe(true);
    });

    it("does not take a tab that is active in another pane", () => {
      const rows = mergeRows(input({ tabs, activeTabId: "a" }));
      expect(rows.filter((r) => r.kind === "tab" && r.current)).toHaveLength(1);
      expect(keys(rows)).toEqual(["tab:a", "tab:b", "tab:c"]);
    });

    it("is the only row when it is the only tab", () => {
      const rows = mergeRows(input({ tabs: [tab("solo")], activeTabId: "solo" }));
      expect(keys(rows)).toEqual(["tab:solo"]);
    });

    it("keeps a hibernated current tab first", () => {
      const rows = mergeRows(
        input({
          tabs: [tab("z", { hibernated: true }), tab("y")],
          activeTabId: "z",
        }),
      );
      expect(keys(rows)).toEqual(["tab:z", "tab:y"]);
    });

    it("keeps the current tab first and the other matches in the order of the empty list while typing", () => {
      const tabs = [
        tab("old", { title: "term old", lastUsedAt: 1 }),
        tab("exact", { title: "term", lastUsedAt: 2 }),
        tab("busy", { title: "terminal busy", running: true, lastUsedAt: 0 }),
        tab("cur", { title: "terminal now", lastUsedAt: 9 }),
      ];
      const rows = mergeRows(
        input({
          tabs,
          term: "term",
          activeTabId: "cur",
          commands: [cmd("c", "Term")],
        }),
      );
      expect(keys(rows)).toEqual([
        "tab:cur",
        "tab:busy",
        "tab:exact",
        "tab:old",
        "cmd:c",
      ]);
    });

    it("is left out while typing when it does not match", () => {
      const rows = mergeRows(input({ tabs, term: "beta", activeTabId: "a" }));
      expect(keys(rows)).toEqual(["tab:b"]);
    });
  });

  it("keeps a hibernated current tab as Current tab, first, idle and typing", () => {
    const tabs = [
      tab("awake", { lastUsedAt: 50, title: "build" }),
      tab("sleepy", { hibernated: true, lastUsedAt: 1, title: "build" }),
    ];
    const idle = mergeRows(input({ tabs, activeTabId: "sleepy" }));
    expect(idle[0]).toMatchObject({ key: "tab:sleepy", current: true });
    const typed = mergeRows(input({ tabs, activeTabId: "sleepy", term: "build" }));
    expect(typed[0]).toMatchObject({ key: "tab:sleepy", current: true });
  });
});
