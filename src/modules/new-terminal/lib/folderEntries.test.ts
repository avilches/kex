import { describe, expect, it } from "vitest";
import type { TabEntry, WorkspaceEntry } from "@/modules/command-palette/lib/tabEntries";
import type { Workspace } from "@/modules/workspaces/lib/types";
import {
  buildFolderGroups,
  filterFolderGroups,
  type FolderGroupsInput,
  type RepoWorktree,
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
  workspaceIcon: over.workspaceIcon ?? null, workspaceRoot: null, paneId: "pane-1", paneTabCount: 1,
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
  order: over.order ?? 0,
});

const active = ws({ id: "ws-1", title: "Kex", workspaceRoot: "/repo" });
const other = ws({ id: "ws-2", title: "Dotfiles", color: "#4f8fff", workspaceRoot: "/dotfiles" });
const empty = ws({ id: "ws-3", title: "No folders" });
const bare = ws({ id: "ws-1", title: "Kex" });

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
    kept: new Map(),
    ...over,
  });

const main = (path: string, branch = "main"): RepoWorktree => ({ path, branch, isMain: true });
const linked = (path: string, branch: string): RepoWorktree => ({ path, branch, isMain: false });

// The worktree listing as git reports it from any of the repository's checkouts.
const listing = (roots: string[], list: RepoWorktree[]) =>
  new Map(roots.map((root) => [root, list] as const));
const repoOfMap = (map: Record<string, string>) => (dir: string) => map[dir] ?? "";

describe("buildFolderGroups", () => {
  it("opens with the current tab folder, then the fixed rows (workspace root, home), then the tab folders by path", () => {
    const entries = [
      entry({ workspaceId: "ws-1", cwd: "/Users/a/zeta" }),
      entry({ workspaceId: "ws-1", cwd: "/repo/src/b" }),
      entry({ workspaceId: "ws-1", cwd: "/Users/a/alpha" }),
      entry({ workspaceId: "ws-1", cwd: "/repo/src/a" }),
    ];
    const [group] = build({ home: "/Users/a", activeTabEntry: entries[1], entries });
    expect(group.rows.map((r) => [r.labels[0] ?? null, r.path])).toEqual([
      ["Current tab", "/repo/src/b"],
      ["Workspace Root", "/repo"],
      ["Home", "/Users/a"],
      [null, "/repo/src/a"],
      [null, "/Users/a/alpha"],
      [null, "/Users/a/zeta"],
    ]);
    expect(group.rows.map((r) => r.pinned)).toEqual([false, true, true, false, false, false]);
    expect(group.rows.map((r) => r.slots)).toEqual([[], ["root"], ["home"], [], [], []]);
  });

  it("carries the branch of every folder that has one", () => {
    const branches: Record<string, string> = { "/repo": "main", "/repo/src": "feat/x" };
    const entries = [
      entry({ workspaceId: "ws-1", cwd: "/repo/src" }),
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
  });

  it("makes one row of the current tab and the root when they are the same folder, and home stays its own", () => {
    const entries = [
      entry({ workspaceId: "ws-1", cwd: "/repo" }),
      entry({ workspaceId: "ws-1", cwd: "/Users/a" }),
    ];
    const [group] = build({ home: "/Users/a", activeTabEntry: entries[0], entries });
    expect(group.rows.map((r) => [r.labels, r.path])).toEqual([
      [["Current tab", "Workspace Root"], "/repo"],
      [["Home"], "/Users/a"],
    ]);
  });

  it("lists the other workspaces in position order, each with its root first and its folders by path", () => {
    const third = ws({ id: "ws-7", title: "Third", workspaceRoot: "/third" });
    const entries = [
      entry({ workspaceId: "ws-7", cwd: "/third/b" }),
      entry({ workspaceId: "ws-2", cwd: "/dotfiles/z" }),
      entry({ workspaceId: "ws-2", cwd: "/dotfiles/home" }),
      entry({ workspaceId: "ws-7", cwd: "/third/a" }),
    ];
    const groups = build({ workspaces: [active, other, empty, third], entries });
    expect(groups.map((g) => g.workspaceTitle)).toEqual(["Kex", "Dotfiles", "Third"]);
    expect(groups[1].active).toBe(false);
    expect(groups[1].rows.map((r) => [r.labels[0] ?? null, r.path])).toEqual([
      ["Workspace Root", "/dotfiles"],
      [null, "/dotfiles/home"],
      [null, "/dotfiles/z"],
    ]);
    expect(groups[2].rows.map((r) => r.path)).toEqual(["/third", "/third/a", "/third/b"]);
  });

  it("dedupes across workspaces: a path already listed never comes back", () => {
    const entries = [
      entry({ workspaceId: "ws-1", cwd: "/dotfiles" }),
      entry({ workspaceId: "ws-2", cwd: "/dotfiles/home" }),
    ];
    const groups = build({
      workspaces: [active, other],
      activeTabEntry: entry({ workspaceId: "ws-1", cwd: "/repo/src" }),
      entries,
    });
    expect(groups.find((g) => g.workspaceId === "ws-1")?.rows.map((r) => r.path)).toEqual([
      "/repo/src",
      "/repo",
      "/dotfiles",
    ]);
    // A workspace always lists its own root, even when another group already shows that folder.
    expect(groups.find((g) => g.workspaceId === "ws-2")?.rows.map((r) => r.path)).toEqual([
      "/dotfiles",
      "/dotfiles/home",
    ]);
  });

  it("lists the root of a workspace with no tabs even when another group shows that folder", () => {
    const groups = build({
      workspaces: [active, other],
      entries: [entry({ workspaceId: "ws-1", cwd: "/dotfiles" })],
    });
    expect(groups.map((g) => g.workspaceId)).toEqual(["ws-1", "ws-2"]);
    expect(groups[1].rows.map((r) => r.labels)).toEqual([["Workspace Root"]]);
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

describe("fixed rows", () => {
  const cur = entry({ workspaceId: "ws-1", cwd: "/repo/.claude/worktrees/alpha" });
  const list = [main("/repo"), linked("/repo/.claude/worktrees/alpha", "alpha")];
  const inRepo = (over: Partial<FolderGroupsInput> = {}) =>
    build({
      workspaces: [active],
      home: "/Users/a",
      activeTabEntry: cur,
      entries: [cur],
      repoOf: repoOfMap({ "/repo/.claude/worktrees/alpha": "/repo/.claude/worktrees/alpha" }),
      worktreesByRepo: listing(["/repo/.claude/worktrees/alpha"], list),
      ...over,
    })[0];
  const shape = (group: { rows: { labels: string[]; slots: string[]; path: string }[] }) =>
    group.rows.map((r) => [r.labels, r.slots, r.path]);

  it("puts the workspace root, the main checkout and home right after the current tab, in that order", () => {
    const group = inRepo({ workspaces: [ws({ id: "ws-1", title: "Kex", workspaceRoot: "/elsewhere" })] });
    expect(shape(group)).toEqual([
      [["Current tab"], [], "/repo/.claude/worktrees/alpha"],
      [["Workspace Root"], ["root"], "/elsewhere"],
      [["Main checkout"], ["main"], "/repo"],
      [["Home"], ["home"], "/Users/a"],
    ]);
  });

  it("makes one row of a folder that is the root and the main checkout, with both labels and both keys", () => {
    const group = inRepo();
    expect(shape(group)).toEqual([
      [["Current tab"], [], "/repo/.claude/worktrees/alpha"],
      [["Workspace Root", "Main checkout"], ["root", "main"], "/repo"],
      [["Home"], ["home"], "/Users/a"],
    ]);
    expect(new Set(group.rows.map((r) => r.key)).size).toBe(group.rows.length);
  });

  it("carries the branch of the main checkout, also when it is merged with the root", () => {
    expect(inRepo().rows.find((r) => r.slots.includes("main"))?.branch).toBe("main");
  });

  it("leaves out a fixed row that does not exist, without moving the others", () => {
    const noRoot = inRepo({ workspaces: [bare] });
    expect(noRoot.rows.map((r) => r.slots)).toEqual([[], ["main"], ["home"]]);
    const noHome = inRepo({ home: null });
    expect(noHome.rows.map((r) => r.slots)).toEqual([[], ["root", "main"]]);
    const noRepo = inRepo({ worktreesByRepo: new Map() });
    expect(noRepo.rows.map((r) => r.slots)).toEqual([[], ["root"], ["home"]]);
  });

  it("merges the fixed rows into the current tab when it is on the same folder, which stays first", () => {
    const atRoot = entry({ workspaceId: "ws-1", cwd: "/repo" });
    const group = inRepo({
      activeTabEntry: atRoot,
      entries: [atRoot],
      repoOf: repoOfMap({ "/repo": "/repo" }),
      worktreesByRepo: listing(["/repo"], list),
    });
    expect(shape(group)).toEqual([
      [["Current tab", "Workspace Root", "Main checkout"], ["root", "main"], "/repo"],
      [["Home"], ["home"], "/Users/a"],
    ]);
    expect(group.rows[0].pinned).toBe(false);
  });

  it("merges home into the current tab when the tab is in the home folder", () => {
    const atHome = entry({ workspaceId: "ws-1", cwd: "/Users/a" });
    const group = inRepo({ activeTabEntry: atHome, entries: [atHome], worktreesByRepo: new Map() });
    expect(shape(group)).toEqual([
      [["Current tab", "Home"], ["home"], "/Users/a"],
      [["Workspace Root"], ["root"], "/repo"],
    ]);
  });

  it("has no main checkout row without a current tab", () => {
    const group = inRepo({ activeTabEntry: null, entries: [] });
    expect(group.rows.map((r) => r.slots)).toEqual([["root"], ["home"]]);
  });

  it("lists a folder that a fixed row already shows only once among the rest", () => {
    const tab = entry({ workspaceId: "ws-1", cwd: "/Users/a" });
    const group = inRepo({ entries: [cur, tab] });
    expect(group.rows.filter((r) => r.path === "/Users/a")).toHaveLength(1);
  });
});

describe("repositories", () => {
  it("gathers the folders of a repository, then orders by repository and path", () => {
    const entries = [
      entry({ workspaceId: "ws-1", cwd: "/work/a" }),
      entry({ workspaceId: "ws-1", cwd: "/work/b" }),
      entry({ workspaceId: "ws-1", cwd: "/tmp/a-worktree-2" }),
    ];
    const both = [main("/work/a"), linked("/tmp/a-worktree-2", "w2")];
    const [group] = build({
      workspaces: [bare],
      entries,
      repoOf: repoOfMap({
        "/work/a": "/work/a",
        "/work/b": "/work/b",
        "/tmp/a-worktree-2": "/tmp/a-worktree-2",
      }),
      worktreesByRepo: new Map([
        ...listing(["/work/a", "/tmp/a-worktree-2"], both),
        ...listing(["/work/b"], [main("/work/b")]),
      ]),
    });
    expect(group.rows.map((r) => r.path)).toEqual(["/work/a", "/tmp/a-worktree-2", "/work/b"]);
    expect(group.rows.map((r) => r.cluster)).toEqual([2, 2, 1]);
    expect(group.rows.map((r) => r.repoName)).toEqual(["a", "a", "b"]);
  });

  it("puts the workspace root among the fixed rows, before the folders of any repository", () => {
    const entries = [
      entry({ workspaceId: "ws-1", cwd: "/aaa/zzz" }),
      entry({ workspaceId: "ws-1", cwd: "/repo/.claude/worktrees/x" }),
    ];
    const list = [main("/repo"), linked("/repo/.claude/worktrees/x", "x")];
    const [group] = build({
      entries,
      repoOf: repoOfMap({
        "/repo": "/repo",
        "/repo/.claude/worktrees/x": "/repo/.claude/worktrees/x",
        "/aaa/zzz": "/aaa/zzz",
      }),
      worktreesByRepo: new Map([
        ...listing(["/repo", "/repo/.claude/worktrees/x"], list),
        ...listing(["/aaa/zzz"], [main("/aaa/zzz")]),
      ]),
    });
    expect(group.rows.map((r) => [r.labels[0] ?? null, r.path])).toEqual([
      ["Workspace Root", "/repo"],
      [null, "/aaa/zzz"],
      [null, "/repo/.claude/worktrees/x"],
    ]);
  });

  it("opens with the current tab, then home, then the other folders of its repository", () => {
    const entries = [
      entry({ workspaceId: "ws-1", cwd: "/zzz" }),
      entry({ workspaceId: "ws-1", cwd: "/repo/b" }),
      entry({ workspaceId: "ws-1", cwd: "/repo/cur" }),
      entry({ workspaceId: "ws-1", cwd: "/repo/a" }),
    ];
    const [group] = build({
      workspaces: [bare],
      home: "/Users/a",
      activeTabEntry: entries[2],
      entries,
      repoOf: repoOfMap({ "/repo/cur": "/repo", "/repo/a": "/repo", "/repo/b": "/repo" }),
    });
    expect(group.rows.map((r) => [r.labels[0] ?? null, r.path])).toEqual([
      ["Current tab", "/repo/cur"],
      ["Home", "/Users/a"],
      [null, "/repo/a"],
      [null, "/repo/b"],
      [null, "/zzz"],
    ]);
    const ofRepo = group.rows.filter((r) => r.repoKey === "/repo" && !r.pinned);
    expect(ofRepo.map((r) => [r.cluster, r.headed])).toEqual([
      [3, false],
      [3, true],
      [3, true],
    ]);
  });

  it("puts the repository heading on the first folder after the fixed rows, not on the current tab", () => {
    const cur = entry({ workspaceId: "ws-1", cwd: "/repo" });
    const wt = entry({ workspaceId: "ws-1", cwd: "/repo/.claude/worktrees/x" });
    const scripts = entry({ workspaceId: "ws-1", cwd: "/repo/scripts" });
    const [group] = build({
      workspaces: [ws({ id: "ws-1", title: "Kex", workspaceRoot: "/docs" })],
      home: "/Users/a",
      activeTabEntry: cur,
      entries: [cur, wt, scripts],
      repoOf: repoOfMap({ "/repo": "/repo", "/repo/.claude/worktrees/x": "/repo", "/repo/scripts": "/repo", "/docs": "/docs" }),
    });
    expect(group.rows.map((r) => [r.path, r.headed])).toEqual([
      ["/repo", false],
      ["/docs", false],
      ["/Users/a", false],
      ["/repo/.claude/worktrees/x", true],
      ["/repo/scripts", true],
    ]);
  });

  it("gives the repository of the current tab a heading even when the current tab is alone in it", () => {
    const [group] = build({
      workspaces: [bare],
      activeTabEntry: entry({ workspaceId: "ws-1", cwd: "/repo/cur" }),
      repoOf: () => "/repo",
    });
    expect(group.rows[0]).toMatchObject({ labels: ["Current tab"], cluster: 1, headed: true, repoName: "repo" });
  });

  it("leaves a folder alone in its repository without a heading, unless it is the current tab", () => {
    const [group] = build({
      workspaces: [bare],
      entries: [entry({ workspaceId: "ws-1", cwd: "/lone" })],
      repoOf: repoOfMap({ "/lone": "/lone" }),
    });
    expect(group.rows[0]).toMatchObject({ cluster: 1, headed: false });
  });

  it("does not list any worktree until Tab asks for them", () => {
    const [group] = build({
      workspaces: [bare],
      activeTabEntry: entry({ workspaceId: "ws-1", cwd: "/repo/cur" }),
      repoOf: () => "/repo",
      worktreesByRepo: listing(["/repo"], [main("/repo"), linked("/repo/.claude/worktrees/a", "a")]),
    });
    expect(group.rows.map((r) => r.path)).toEqual(["/repo/cur", "/repo"]);
  });

  describe("the Tab hint", () => {
    const solo = [main("/solo"), linked("/solo-wt", "w")];
    const mine = [main("/repo"), linked("/repo/.claude/worktrees/alpha", "alpha")];
    const solo2 = [main("/solo2"), linked("/solo2-wt", "w")];
    const [group] = build({
      activeTabEntry: entry({ workspaceId: "ws-1", cwd: "/solo/cur" }),
      entries: [
        entry({ workspaceId: "ws-1", cwd: "/repo/src" }),
        entry({ workspaceId: "ws-1", cwd: "/other" }),
        entry({ workspaceId: "ws-1", cwd: "/solo2/x" }),
      ],
      repoOf: repoOfMap({
        "/solo/cur": "/solo",
        "/repo": "/repo",
        "/repo/src": "/repo",
        "/other": "/other",
        "/solo2/x": "/solo2",
      }),
      worktreesByRepo: new Map([
        ...listing(["/solo"], solo),
        ...listing(["/repo"], mine),
        ...listing(["/other"], [main("/other")]),
        ...listing(["/solo2"], solo2),
      ]),
    });
    const at = (path: string) => group.rows.find((r) => r.path === path)!;

    it("is carried by every row of a repository, with a heading when it has several folders", () => {
      expect(at("/repo").pinned).toBe(true);
      for (const path of ["/repo", "/repo/src"]) {
        expect(at(path).repoHint).toEqual({ kind: "show", count: 1 });
      }
    });

    it("is carried by a row alone in its repository, and by a pinned row, without a heading", () => {
      expect(at("/solo/cur").repoHint).toEqual({ kind: "show", count: 1 });
      expect(at("/solo2/x").cluster).toBe(1);
      expect(at("/solo2/x").repoHint).toEqual({ kind: "show", count: 2 });
    });

    it("is absent when the repository has nothing more to show", () => {
      expect(at("/other").repoHint).toBeNull();
    });
  });

  describe("adding the worktrees with Tab", () => {
    const entries = [
      entry({ workspaceId: "ws-1", cwd: "/repo/.claude/worktrees/alpha" }),
      entry({ workspaceId: "ws-1", cwd: "/zzz" }),
    ];
    const list = [
      linked("/repo/.claude/worktrees/zeta", "z"),
      main("/repo"),
      linked("/repo/.claude/worktrees/alpha", "a"),
      linked("/repo/.claude/worktrees/beta", "b"),
    ];
    const open = (
      expansions: Map<string, string>,
      kept: Map<string, { workspaceId: string; path: string }> = new Map(),
    ) =>
      build({
        workspaces: [bare],
        activeTabEntry: entries[0],
        entries,
        repoOf: repoOfMap({ "/repo/.claude/worktrees/alpha": "/repo/.claude/worktrees/alpha" }),
        worktreesByRepo: listing(["/repo/.claude/worktrees/alpha"], list),
        expansions,
        kept,
      })[0];

    it("flags the rows as loading until the listing of their repository arrives", () => {
      const common = {
        workspaces: [bare],
        activeTabEntry: entries[0],
        entries,
        repoOf: repoOfMap({ "/repo/.claude/worktrees/alpha": "/repo/.claude/worktrees/alpha" }),
      };
      const waiting = build({ ...common })[0];
      expect(waiting.rows[0].worktreesLoading).toBe(true);
      const answered = build({
        ...common,
        worktreesByRepo: listing(["/repo/.claude/worktrees/alpha"], list),
      })[0];
      expect(answered.rows[0].worktreesLoading).toBe(false);
      const refused = build({
        ...common,
        worktreesByRepo: listing(["/repo/.claude/worktrees/alpha"], []),
      })[0];
      expect(refused.rows[0].worktreesLoading).toBe(false);
    });

    it("offers them first: the rows of the repository carry the show hint", () => {
      const group = open(new Map());
      expect(group.rows[0].repoHint).toEqual({ kind: "show", count: 2 });
    });

    it("adds the missing ones to its group, alphabetical, after the main checkout that is already fixed, without repeats", () => {
      const group = open(new Map([["/repo", "ws-1"]]));
      expect(group.rows.map((r) => [r.labels[0] ?? null, r.path, r.branch])).toEqual([
        ["Current tab", "/repo/.claude/worktrees/alpha", null],
        ["Main checkout", "/repo", "main"],
        [null, "/repo/.claude/worktrees/beta", "b"],
        [null, "/repo/.claude/worktrees/zeta", "z"],
        [null, "/zzz", null],
      ]);
      expect(new Set(group.rows.map((r) => r.path)).size).toBe(group.rows.length);
    });

    it("marks the added worktrees as nested, after the folders that were already there", () => {
      const group = open(new Map([["/repo", "ws-1"]]));
      expect(group.rows.map((r) => [r.path, r.nested])).toEqual([
        ["/repo/.claude/worktrees/alpha", false],
        ["/repo", false],
        ["/repo/.claude/worktrees/beta", true],
        ["/repo/.claude/worktrees/zeta", true],
        ["/zzz", false],
      ]);
    });

    it("counts every worktree of the repository, whether they are shown or not", () => {
      const before = open(new Map()).rows[0];
      const after = open(new Map([["/repo", "ws-1"]])).rows[0];
      expect(before.worktreeCount).toBe(4);
      expect(after.worktreeCount).toBe(4);
    });

    it("turns the hint into hide for every row of the repository", () => {
      const group = open(new Map([["/repo", "ws-1"]]));
      const clustered = [group.rows[0], group.rows[2], group.rows[3]];
      expect(clustered.map((r) => r.cluster)).toEqual([3, 3, 3]);
      expect(group.rows.slice(0, 4).map((r) => r.repoHint)).toEqual([
        { kind: "hide" },
        { kind: "hide" },
        { kind: "hide" },
        { kind: "hide" },
      ]);
    });

    it("takes them away again when the expansion is dropped, leaving the list as it was", () => {
      const before = open(new Map());
      const after = open(new Map([["/repo", "ws-1"]]));
      const hidden = open(new Map());
      expect(after.rows.length).toBeGreaterThan(before.rows.length);
      expect(hidden.rows.map((r) => r.path)).toEqual(before.rows.map((r) => r.path));
    });

    it("keeps only the worktree that had the focus when the repository is collapsed", () => {
      const kept = new Map([["/repo", { workspaceId: "ws-1", path: "/repo/.claude/worktrees/beta" }]]);
      const group = open(new Map(), kept);
      expect(group.rows.map((r) => [r.path, r.nested])).toEqual([
        ["/repo/.claude/worktrees/alpha", false],
        ["/repo", false],
        ["/repo/.claude/worktrees/beta", true],
        ["/zzz", false],
      ]);
      expect(group.rows[0].repoHint).toEqual({ kind: "show", count: 1 });
    });

    it("lists it once when the repository is expanded again", () => {
      const kept = new Map([["/repo", { workspaceId: "ws-1", path: "/repo/.claude/worktrees/beta" }]]);
      const paths = open(new Map([["/repo", "ws-1"]]), kept).rows.map((r) => r.path);
      expect(new Set(paths).size).toBe(paths.length);
      expect(paths).toContain("/repo/.claude/worktrees/beta");
    });

    it("adds them to the workspace it was pressed in", () => {
      const groups = build({
        workspaces: [active, other],
        activeTabEntry: entries[0],
        entries,
        repoOf: repoOfMap({ "/repo/.claude/worktrees/alpha": "/repo/.claude/worktrees/alpha" }),
        worktreesByRepo: listing(["/repo/.claude/worktrees/alpha"], list),
        expansions: new Map([["/repo", "ws-2"]]),
      });
      const dotfiles = groups.find((g) => g.workspaceId === "ws-2")!;
      expect(dotfiles.rows.some((r) => r.path === "/repo/.claude/worktrees/zeta")).toBe(true);
      const kex = groups.find((g) => g.workspaceId === "ws-1")!;
      expect(kex.rows.some((r) => r.path === "/repo/.claude/worktrees/zeta")).toBe(false);
    });

    it("works for any repository without touching the others", () => {
      const [group] = build({
        workspaces: [bare],
        entries: [
          entry({ workspaceId: "ws-1", cwd: "/one" }),
          entry({ workspaceId: "ws-1", cwd: "/two" }),
        ],
        repoOf: repoOfMap({ "/one": "/one", "/two": "/two" }),
        worktreesByRepo: new Map([
          ...listing(["/one"], [main("/one"), linked("/one-wt", "x")]),
          ...listing(["/two"], [main("/two"), linked("/two-wt", "y")]),
        ]),
        expansions: new Map([["/two", "ws-1"]]),
      });
      expect(group.rows.map((r) => [r.path, r.repoHint])).toEqual([
        ["/one", { kind: "show", count: 1 }],
        ["/two", { kind: "hide" }],
        ["/two-wt", { kind: "hide" }],
      ]);
    });
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
    expect(g1.rows).toHaveLength(3);
    expect(g2.rows).toHaveLength(2);
    expect(g1.rows.every((r) => r.indices === undefined)).toBe(true);
  });

  it("requires the whole word as a substring and highlights exactly that run", () => {
    const [only] = filterFolderGroups(groups, "s/home");
    expect(only.workspaceId).toBe("ws-2");
    expect(only.rows).toHaveLength(1);
    expect(only.rows[0].indices).toEqual([8, 9, 10, 11, 12, 13]);
  });

  it("matches every token somewhere in the path, highlighting all of them", () => {
    const [only] = filterFolderGroups(groups, "repo tauri");
    expect(only.workspaceId).toBe("ws-1");
    expect(only.rows).toHaveLength(1);
    expect(only.rows[0].path).toBe("/repo/src-tauri");
    expect(only.rows[0].indices).toEqual([1, 2, 3, 4, 10, 11, 12, 13, 14]);
  });

  it("never matches inside the home prefix (ser does not hit Users)", () => {
    const matched = filterFolderGroups(groups, "ser");
    expect(matched.map((g) => g.rows.map((r) => r.path))).toEqual([["/Users/avilches/server.py"]]);
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

  describe("everything a row shows is searchable", () => {
    const shown = build({
      workspaces: [active, other],
      workspaceEntries: [
        { workspaceId: "ws-1", title: "Kex | zsh", color: null, icon: null, tabCount: 1, root: null, canHibernate: false, lastUsedAt: 0 },
        { workspaceId: "ws-2", title: "Dotfiles", color: null, icon: null, tabCount: 1, root: null, canHibernate: false, lastUsedAt: 0 },
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
      expect(g.rows.map((r) => r.labels)).toEqual([["Workspace Root"]]);
      expect(g.rows[0].labelIndices).toEqual([[10, 11, 12, 13]]);
    });

    it("highlights each label of a row that is several things, in its own slot", () => {
      const merged = {
        ...shown[0].rows[0],
        labels: ["Workspace Root", "Main checkout"] as ("Workspace Root" | "Main checkout")[],
      };
      const [g] = filterFolderGroups([{ ...shown[0], rows: [merged] }], "main");
      expect(g.rows[0].labelIndices).toEqual([[], [0, 1, 2, 3]]);
    });

    it("keeps the whole group when the workspace title matches", () => {
      const matched = filterFolderGroups(shown, "dotf");
      expect(matched.map((g) => g.workspaceId)).toEqual(["ws-2"]);
      expect(matched[0].rows).toHaveLength(2);
      expect(matched[0].titleIndices).toEqual([0, 1, 2, 3]);
    });

    it("combines words across path, branch and title", () => {
      const [g] = filterFolderGroups(shown, "kex login src");
      expect(g.rows.map((r) => r.path)).toEqual(["/repo/src"]);
    });
  });

  describe("repository headings and hints", () => {
    const grouped = build({
      workspaces: [bare],
      entries: [
        entry({ workspaceId: "ws-1", cwd: "/work/qiskit-serverless/a" }),
        entry({ workspaceId: "ws-1", cwd: "/work/qiskit-serverless/b" }),
      ],
      repoOf: () => "/work/qiskit-serverless",
    });

    it("finds the folders of a repository by its name and highlights it", () => {
      const [g] = filterFolderGroups(grouped, "serverless");
      expect(g.rows).toHaveLength(2);
      expect(g.rows[0].repoNameIndices).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    });

    it("keeps searching the label of a row whose repository has a hint", () => {
      const single = build({
        workspaces: [bare],
        activeTabEntry: entry({ workspaceId: "ws-1", cwd: "/solo/cur" }),
        repoOf: () => "/solo",
        worktreesByRepo: listing(["/solo"], [main("/solo"), linked("/solo-wt", "w")]),
      });
      expect(single[0].rows[0].repoHint).not.toBeNull();
      expect(filterFolderGroups(single, "current")[0].rows).toHaveLength(1);
    });
  });
});

describe("resolved workspace identity", () => {
  const wsEntry = (over: Partial<WorkspaceEntry>): WorkspaceEntry => ({
    workspaceId: "ws-1",
    title: "Kex",
    color: null,
    icon: null,
    tabCount: 1,
    root: null,
    canHibernate: false,
    lastUsedAt: 0,
    ...over,
  });

  it("titles a group with the expanded template, not the raw one", () => {
    const raw = ws({ id: "ws-1", title: "{repo} | {tab}", workspaceRoot: "/repo" });
    const blank = ws({ id: "ws-2", title: "", workspaceRoot: "/sleep" });
    const groups = build({
      workspaces: [raw, blank],
      workspaceEntries: [
        wsEntry({ workspaceId: "ws-1", title: "Kex | zsh", icon: "Folder01Icon", color: "#4f8fff" }),
        wsEntry({ workspaceId: "ws-2", title: "~/sleep" }),
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
    expect(group.rows.find((r) => r.labels.includes("Home"))?.display).toBe("~");
  });

  it("expresses the match indices against the displayed text", () => {
    const [g] = filterFolderGroups([withCwd("/Users/a", "/Users/a/Hub/Kex")], "hub");
    const row = g.rows.find((r) => r.path === "/Users/a/Hub/Kex");
    expect(row?.indices?.map((i) => row.display[i]).join("")).toBe("Hub");
  });
});
