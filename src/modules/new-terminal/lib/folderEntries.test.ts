import { describe, expect, it } from "vitest";
import type { TabEntry, WorkspaceEntry } from "@/modules/command-palette/lib/tabEntries";
import type { Workspace } from "@/modules/workspaces/lib/types";
import {
  buildFolderGroups,
  filterFolderGroups,
  type FolderGroupsInput,
} from "./folderEntries";

let n = 0;

const ws = (over: Partial<Workspace> = {}): Workspace => ({
  id: over.id ?? `ws-${++n}`,
  title: over.title ?? `Workspace ${n}`,
  paneTree: over.paneTree ?? { id: `pane-${n}`, kind: "pane", tabs: [], activeTabId: null } as Workspace["paneTree"],
  activePaneId: over.activePaneId ?? `pane-${n}`,
  ...over,
});

let t = 0;

const entry = (over: Partial<TabEntry> = {}): TabEntry => ({
  tabId: over.tabId ?? `tab-${++t}`,
  workspaceId: over.workspaceId ?? "ws-1",
  workspaceTitle: over.workspaceTitle ?? "Workspace",
  workspaceColor: over.workspaceColor ?? null,
  workspaceIcon: over.workspaceIcon ?? null,
  hibernated: over.hibernated ?? false,
  kind: over.kind ?? "terminal",
  title: over.title ?? "",
  note: over.note ?? null,
  cwd: over.cwd ?? "",
  detail: over.detail ?? "",
  worktree: over.worktree ?? "",
  branch: over.branch ?? "",
  process: over.process ?? "",
  command: over.command ?? "",
  agent: over.agent ?? "",
  indicator: over.indicator ?? null,
  tab: over.tab ?? { id: `tab-${t}`, kind: "terminal", cwd: over.cwd ?? "" } as TabEntry["tab"],
  agentSession: over.agentSession ?? undefined,
  running: over.running ?? false,
  lastUsedAt: over.lastUsedAt ?? 0,
  workspaceActiveAt: over.workspaceActiveAt ?? 0,
  order: over.order ?? 0,
});

const active = ws({ id: "ws-1", title: "Kex", workspaceRoot: "/repo" });
const other = ws({ id: "ws-2", title: "Dotfiles", color: "#4f8fff", workspaceRoot: "/dotfiles" });
const empty = ws({ id: "ws-3", title: "No folders" });

const build = (over: Partial<FolderGroupsInput> = {}) =>
  buildFolderGroups({
    workspaces: [active, other, empty],
    workspaceEntries: [],
    activeWorkspaceId: "ws-1",
    home: null,
    activeTabEntry: null,
    entries: [],
    branchOf: () => "",
    repoOf: () => "",
    worktreesByRepo: new Map(),
    expansions: new Map(),
    ...over,
  });

const REPO_MAIN = { path: "/repo", branch: "main", isMain: true };
const WT_ALPHA = { path: "/repo/.claude/worktrees/alpha", branch: "a", isMain: false };
const WT_ZETA = { path: "/repo/.claude/worktrees/zeta", branch: "z", isMain: false };
const wts = (root: string, list: { path: string; branch: string | null; isMain: boolean }[]) =>
  new Map([[root, list]]);

describe("buildFolderGroups", () => {
  it("opens with the current tab folder, home and the workspace root, then the tab folders alphabetically", () => {
    const entries = [
      entry({ workspaceId: "ws-1", cwd: "/Users/a/zeta" }),
      entry({ workspaceId: "ws-1", cwd: "/repo/src/b", branch: "main" }),
      entry({ workspaceId: "ws-1", cwd: "/Users/a/alpha" }),
      entry({ workspaceId: "ws-1", cwd: "/repo/src/a" }),
    ];
    const [group] = build({
      home: "/Users/a",
      activeTabEntry: entries[1],
      entries,
    });
    expect(group.rows.map((r) => [r.label, r.path])).toEqual([
      ["Current tab", "/repo/src/b"],
      ["Home", "/Users/a"],
      ["Workspace Root", "/repo"],
      [null, "/repo/src/a"],
      [null, "/Users/a/alpha"],
      [null, "/Users/a/zeta"],
    ]);
  });

  it("carries the branch of every folder that has one and never a process", () => {
    const branches: Record<string, string> = { "/repo": "main", "/repo/src": "feat/x" };
    const entries = [
      entry({ workspaceId: "ws-1", cwd: "/repo/src", process: "claude", command: "claude", agent: "claude" }),
      entry({ workspaceId: "ws-1", cwd: "/repo/docs" }),
    ];
    const [group] = build({
      activeTabEntry: entries[0],
      entries,
      branchOf: (dir) => branches[dir] ?? "",
    });
    expect(group.rows.map((r) => [r.path, r.branch])).toEqual([
      ["/repo/src", "feat/x"],
      ["/repo", "main"],
      ["/repo/docs", null],
    ]);
    expect(group.rows.every((r) => !("process" in r))).toBe(true);
  });

  it("does not list any worktree until Tab asks for them", () => {
    const [group] = build({
      activeTabEntry: entry({ workspaceId: "ws-1", cwd: "/repo/.claude/worktrees/perf" }),
      repoOf: () => "/repo/.claude/worktrees/perf",
      worktreesByRepo: wts("/repo/.claude/worktrees/perf", [REPO_MAIN, WT_ALPHA, WT_ZETA]),
    });
    expect(group.rows.map((r) => r.path)).toEqual(["/repo/.claude/worktrees/perf", "/repo"]);
  });

  it("groups the folders by repository first, then alphabetically", () => {
    const entries = [
      entry({ workspaceId: "ws-1", cwd: "/work/a" }),
      entry({ workspaceId: "ws-1", cwd: "/work/b" }),
      entry({ workspaceId: "ws-1", cwd: "/tmp/a-worktree-2" }),
    ];
    const roots: Record<string, string> = {
      "/work/a": "/work/a",
      "/work/b": "/work/b",
      "/tmp/a-worktree-2": "/tmp/a-worktree-2",
    };
    const [group] = build({
      workspaces: [ws({ id: "ws-1", title: "Kex" })],
      entries,
      repoOf: (dir) => roots[dir] ?? "",
      worktreesByRepo: new Map([
        ["/work/a", [{ path: "/work/a", branch: "main", isMain: true }, { path: "/tmp/a-worktree-2", branch: "w2", isMain: false }]],
        ["/tmp/a-worktree-2", [{ path: "/work/a", branch: "main", isMain: true }, { path: "/tmp/a-worktree-2", branch: "w2", isMain: false }]],
        ["/work/b", [{ path: "/work/b", branch: "main", isMain: true }]],
      ]),
    });
    expect(group.rows.map((r) => r.path)).toEqual(["/work/a", "/tmp/a-worktree-2", "/work/b"]);
  });

  it("offers the missing worktrees on every row of a repository, and none elsewhere", () => {
    const entries = [
      entry({ workspaceId: "ws-1", cwd: "/repo/src" }),
      entry({ workspaceId: "ws-1", cwd: "/other" }),
      entry({ workspaceId: "ws-1", cwd: "/repo/.claude/worktrees/alpha" }),
    ];
    const roots: Record<string, string> = {
      "/repo": "/repo",
      "/repo/src": "/repo",
      "/repo/.claude/worktrees/alpha": "/repo/.claude/worktrees/alpha",
      "/other": "/other",
    };
    const [group] = build({
      entries,
      repoOf: (dir) => roots[dir] ?? "",
      worktreesByRepo: new Map([
        ...wts("/repo", [REPO_MAIN, WT_ALPHA, WT_ZETA]),
        ...wts("/repo/.claude/worktrees/alpha", [REPO_MAIN, WT_ALPHA, WT_ZETA]),
        ...wts("/other", [{ path: "/other", branch: "main", isMain: true }]),
      ]),
    });
    const hints = Object.fromEntries(group.rows.map((r) => [r.path, r.hiddenWorktrees]));
    // /repo is a listed row too (the workspace root): main, alpha and the root/src rows are in the list,
    // only zeta is missing.
    expect(hints).toMatchObject({
      "/repo/src": 1,
      "/repo": 1,
      "/repo/.claude/worktrees/alpha": 1,
      "/other": 0,
    });
  });

  it("adds the missing worktrees under the row Tab was pressed on: main checkout first, then alphabetical, no repeats", () => {
    const entries = [
      entry({ workspaceId: "ws-1", cwd: "/repo/.claude/worktrees/alpha" }),
      entry({ workspaceId: "ws-1", cwd: "/zzz" }),
    ];
    const roots: Record<string, string> = { "/repo/.claude/worktrees/alpha": "/repo/.claude/worktrees/alpha" };
    const list = [
      { path: "/repo/.claude/worktrees/zeta", branch: "z", isMain: false },
      { path: "/repo", branch: "main", isMain: true },
      { path: "/repo/.claude/worktrees/alpha", branch: "a", isMain: false },
      { path: "/repo/.claude/worktrees/beta", branch: "b", isMain: false },
    ];
    const [group] = build({
      workspaces: [ws({ id: "ws-1", title: "Kex" })],
      activeTabEntry: entries[0],
      entries,
      repoOf: (dir) => roots[dir] ?? "",
      worktreesByRepo: new Map([["/repo/.claude/worktrees/alpha", list]]),
      expansions: new Map([["/repo", "ws-1:/repo/.claude/worktrees/alpha"]]),
    });
    expect(group.rows.map((r) => [r.label, r.path, r.branch])).toEqual([
      ["Current tab", "/repo/.claude/worktrees/alpha", null],
      ["Main checkout", "/repo", "main"],
      [null, "/repo/.claude/worktrees/beta", "b"],
      [null, "/repo/.claude/worktrees/zeta", "z"],
      [null, "/zzz", null],
    ]);
    expect(group.rows.every((r) => r.hiddenWorktrees === 0)).toBe(true);
    expect(new Set(group.rows.map((r) => r.path)).size).toBe(group.rows.length);
  });

  it("works for any repository: a second one is expanded without touching the first", () => {
    const entries = [
      entry({ workspaceId: "ws-1", cwd: "/one" }),
      entry({ workspaceId: "ws-1", cwd: "/two" }),
    ];
    const roots: Record<string, string> = { "/one": "/one", "/two": "/two" };
    const [group] = build({
      workspaces: [ws({ id: "ws-1", title: "Kex" })],
      entries,
      repoOf: (dir) => roots[dir] ?? "",
      worktreesByRepo: new Map([
        ...wts("/one", [{ path: "/one", branch: "main", isMain: true }, { path: "/one-wt", branch: "x", isMain: false }]),
        ...wts("/two", [{ path: "/two", branch: "main", isMain: true }, { path: "/two-wt", branch: "y", isMain: false }]),
      ]),
      expansions: new Map([["/two", "ws-1:/two"]]),
    });
    expect(group.rows.map((r) => [r.path, r.hiddenWorktrees])).toEqual([
      ["/one", 1],
      ["/two", 0],
      ["/two-wt", 0],
    ]);
  });

  it("keeps one row and the first label when a tab folder coincides with the root or home", () => {
    const entries = [
      entry({ workspaceId: "ws-1", cwd: "/repo" }),
      entry({ workspaceId: "ws-1", cwd: "/Users/a" }),
    ];
    const [group] = build({ home: "/Users/a", activeTabEntry: entries[0], entries });
    expect(group.rows.map((r) => [r.label, r.path])).toEqual([
      ["Current tab", "/repo"],
      ["Home", "/Users/a"],
    ]);
  });

  it("lists the other workspaces in position order, each with its root first and its folders alphabetical", () => {
    const third = ws({ id: "ws-7", title: "Third", workspaceRoot: "/third" });
    const entries = [
      entry({ workspaceId: "ws-7", cwd: "/third/b" }),
      entry({ workspaceId: "ws-2", cwd: "/dotfiles/z" }),
      entry({ workspaceId: "ws-2", cwd: "/dotfiles/home", branch: "main" }),
      entry({ workspaceId: "ws-7", cwd: "/third/a" }),
    ];
    const groups = build({ workspaces: [active, other, empty, third], entries });
    expect(groups.map((g) => g.workspaceTitle)).toEqual(["Kex", "Dotfiles", "Third"]);
    expect(groups[1].active).toBe(false);
    expect(groups[1].rows.map((r) => [r.label, r.path])).toEqual([
      ["Workspace Root", "/dotfiles"],
      [null, "/dotfiles/home"],
      [null, "/dotfiles/z"],
    ]);
    expect(groups[2].rows.map((r) => r.path)).toEqual(["/third", "/third/a", "/third/b"]);
  });

  it("dedupes across workspaces: a path already listed never comes back", () => {
    const entries = [
      // The dotfiles workspace root is also a tab folder of the active workspace.
      entry({ workspaceId: "ws-1", cwd: "/dotfiles" }),
      entry({ workspaceId: "ws-2", cwd: "/dotfiles/home" }),
    ];
    const groups = build({
      workspaces: [active, other],
      activeTabEntry: entry({ workspaceId: "ws-1", cwd: "/repo/src" }),
      entries,
    });
    const kex = groups.find((g) => g.workspaceId === "ws-1");
    const dotfiles = groups.find((g) => g.workspaceId === "ws-2");
    expect(kex?.rows.map((r) => r.path)).toEqual(["/repo/src", "/repo", "/dotfiles"]);
    expect(dotfiles?.rows.map((r) => r.path)).toEqual(["/dotfiles/home"]);
  });

  it("skips a workspace whose rows were all listed before", () => {
    const groups = build({
      workspaces: [active, other],
      entries: [entry({ workspaceId: "ws-1", cwd: "/dotfiles" })],
    });
    expect(groups.map((g) => g.workspaceId)).toEqual(["ws-1"]);
  });

  it("keeps hibernated workspaces with their tag", () => {
    const sleeping = ws({ id: "ws-4", title: "Sleeping", workspaceRoot: "/sleep", hibernated: true });
    const groups = build({
      workspaces: [active, sleeping],
      entries: [entry({ workspaceId: "ws-4", cwd: "/sleep/sub", hibernated: true })],
    });
    expect(groups[1].hibernated).toBe(true);
    expect(groups[1].rows.map((r) => [r.label, r.hibernated])).toEqual([
      ["Workspace Root", true],
      [null, true],
    ]);
  });

  it("drops browser tabs, which carry no folder", () => {
    const noRoot = ws({ id: "ws-5", title: "Bare" });
    const groups = build({
      workspaces: [active, noRoot],
      entries: [entry({ workspaceId: "ws-5", kind: "browser", cwd: "" })],
    });
    expect(groups).toHaveLength(1);
  });
});

describe("filterFolderGroups", () => {
  const withHome = ws({ id: "ws-6", title: "HomeWorkspace" });
  const groups = build({
    workspaces: [active, other, withHome],
    home: "/Users/avilches",
    activeTabEntry: entry({ workspaceId: "ws-1", cwd: "/repo/src-tauri" }),
    entries: [
      entry({ workspaceId: "ws-1", cwd: "/repo/src-tauri" }),
      entry({ workspaceId: "ws-2", cwd: "/dotfiles/home" }),
      entry({ workspaceId: "ws-6", cwd: "/Users/avilches/server.py" }),
    ],
  });

  it("returns every row with no indices on an empty query", () => {
    const [g1, g2] = filterFolderGroups(groups, "  ");
    // current tab, workspace root and home
    expect(g1.rows).toHaveLength(3);
    expect(g2.rows).toHaveLength(2);
    expect(g1.rows.every((r) => r.indices === undefined)).toBe(true);
  });

  it("ignores accents in both the folder and the query", () => {
    const accented = build({
      workspaces: [active],
      home: null,
      activeTabEntry: entry({ workspaceId: "ws-1", cwd: "/música/canción" }),
      entries: [entry({ workspaceId: "ws-1", cwd: "/música/canción" })],
    });
    const [g] = filterFolderGroups(accented, "cancion");
    expect(g.rows.length).toBeGreaterThan(0);
    expect(filterFolderGroups(accented, "música").length).toBe(1);
  });

  it("requires the whole word as a substring and highlights exactly that run", () => {
    const [only] = filterFolderGroups(groups, "s/home");
    expect(only.workspaceId).toBe("ws-2");
    expect(only.rows).toHaveLength(1);
    // "/dotfiles/home": s / h o m e at indices 8..13.
    expect(only.rows[0].indices).toEqual([8, 9, 10, 11, 12, 13]);
  });

  describe("everything a row shows is searchable", () => {
    const shown = build({
      workspaces: [active, other],
      workspaceEntries: [
        { workspaceId: "ws-1", title: "Kex | zsh", color: null, icon: null, hibernated: false, tabCount: 1, lastUsedAt: 0 },
        { workspaceId: "ws-2", title: "Dotfiles", color: null, icon: null, hibernated: false, tabCount: 1, lastUsedAt: 0 },
      ],
      home: "/Users/a",
      activeTabEntry: entry({ workspaceId: "ws-1", cwd: "/repo/src" }),
      entries: [entry({ workspaceId: "ws-1", cwd: "/repo/src" }), entry({ workspaceId: "ws-2", cwd: "/dotfiles/x" })],
      branchOf: (dir) => (dir === "/repo/src" ? "feat/login" : ""),
    });

    it("finds a row by its branch and highlights it", () => {
      const [g] = filterFolderGroups(shown, "login");
      expect(g.rows.map((r) => r.path)).toEqual(["/repo/src"]);
      expect(g.rows[0].branchIndices).toEqual([5, 6, 7, 8, 9]);
      expect(g.rows[0].indices).toBeUndefined();
    });

    it("finds a row by its label", () => {
      const [g] = filterFolderGroups(shown, "root");
      expect(g.rows.map((r) => r.label)).toEqual(["Workspace Root"]);
      expect(g.rows[0].labelIndices).toEqual([10, 11, 12, 13]);
    });

    it("keeps the whole group when the workspace title matches", () => {
      const groupsMatched = filterFolderGroups(shown, "dotf");
      expect(groupsMatched.map((g) => g.workspaceId)).toEqual(["ws-2"]);
      expect(groupsMatched[0].rows).toHaveLength(2);
      expect(groupsMatched[0].titleIndices).toEqual([0, 1, 2, 3]);
    });

    it("combines words across path, branch and title", () => {
      const [g] = filterFolderGroups(shown, "kex login src");
      expect(g.rows.map((r) => r.path)).toEqual(["/repo/src"]);
    });
  });

  it("matches every token somewhere in the path, highlighting all of them", () => {
    const [only] = filterFolderGroups(groups, "repo tauri");
    expect(only.workspaceId).toBe("ws-1");
    expect(only.rows).toHaveLength(1);
    expect(only.rows[0].path).toBe("/repo/src-tauri");
    // "repo" at 1..4, "tauri" at 10..14.
    expect(only.rows[0].indices).toEqual([1, 2, 3, 4, 10, 11, 12, 13, 14]);
  });

  it("never matches inside the home prefix (ser does not hit Users)", () => {
    const matched = filterFolderGroups(groups, "ser");
    expect(matched.map((g) => g.rows.map((r) => r.path))).toEqual([["/Users/avilches/server.py"]]);
    // Indices are against the displayed "~/server.py".
    expect(matched[0].rows[0].display).toBe("~/server.py");
    expect(matched[0].rows[0].indices).toEqual([2, 3, 4]);
  });

  it("drops rows missing any token", () => {
    expect(filterFolderGroups(groups, "dotfiles tauri")).toEqual([]);
  });

  it("keeps group order and row order (no reordering on search)", () => {
    const [g1, g2] = filterFolderGroups(groups, "o");
    expect(g1.workspaceId).toBe("ws-1");
    expect(g2.workspaceId).toBe("ws-2");
  });
});

describe("label and Tab hint", () => {
  const withHint = build({
    workspaces: [active],
    activeTabEntry: entry({ workspaceId: "ws-1", cwd: "/repo/src" }),
    entries: [entry({ workspaceId: "ws-1", cwd: "/repo/src" })],
    repoOf: () => "/repo",
    worktreesByRepo: wts("/repo", [REPO_MAIN, WT_ALPHA]),
  });

  it("does not search the label of a row whose label the hint replaced", () => {
    expect(filterFolderGroups(withHint, "current")).toEqual([]);
  });
});

describe("resolved workspace identity", () => {
  const wsEntry = (over: Partial<WorkspaceEntry>): WorkspaceEntry => ({
    workspaceId: "ws-1",
    title: "Kex",
    color: null,
    icon: null,
    hibernated: false,
    tabCount: 1,
    lastUsedAt: 0,
    ...over,
  });

  it("titles a group with the expanded template, not the raw one", () => {
    const raw = ws({ id: "ws-1", title: "{repo} | {tab}", workspaceRoot: "/repo" });
    const blank = ws({ id: "ws-2", title: "", workspaceRoot: "/sleep", hibernated: true });
    const groups = build({
      workspaces: [raw, blank],
      workspaceEntries: [
        wsEntry({ workspaceId: "ws-1", title: "Kex | zsh", icon: "Folder01Icon", color: "#4f8fff" }),
        wsEntry({ workspaceId: "ws-2", title: "~/sleep", hibernated: true }),
      ],
    });
    expect(groups.map((g) => g.workspaceTitle)).toEqual(["Kex | zsh", "~/sleep"]);
    expect(groups[0].workspaceIcon).toBe("Folder01Icon");
    expect(groups[0].workspaceColor).toBe("#4f8fff");
  });
});

describe("home collapsed to ~", () => {
  const withCwd = (home: string | null, cwd: string) =>
    build({
      home,
      workspaces: [active],
      entries: [entry({ workspaceId: "ws-1", cwd })],
    })[0];

  it("shows the home prefix as ~ and leaves other paths alone", () => {
    const group = withCwd("/Users/a", "/Users/a/Hub/Kex");
    expect(group.rows.find((r) => r.path === "/Users/a/Hub/Kex")?.display).toBe("~/Hub/Kex");
    const outside = withCwd("/Users/a", "/opt/tool");
    expect(outside.rows.find((r) => r.path === "/opt/tool")?.display).toBe("/opt/tool");
  });

  it("shows the home itself as ~", () => {
    const group = withCwd("/Users/a/", "/Users/a/x");
    expect(group.rows.find((r) => r.label === "Home")?.display).toBe("~");
  });

  it("expresses the match indices against the displayed text", () => {
    const [g] = filterFolderGroups([withCwd("/Users/a", "/Users/a/Hub/Kex")], "hub");
    const row = g.rows.find((r) => r.path === "/Users/a/Hub/Kex");
    expect(row?.indices?.map((i) => row.display[i]).join("")).toBe("Hub");
  });
});
