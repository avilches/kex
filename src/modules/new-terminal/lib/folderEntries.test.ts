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
    worktrees: [],
    branchOf: () => "",
    ...over,
  });

describe("buildFolderGroups", () => {
  it("opens with the current tab folder, the workspace root and home, then the tab folders alphabetically", () => {
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
      ["Workspace Root", "/repo"],
      ["Home", "/Users/a"],
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

  it("puts the main checkout under the current tab, then the other worktrees alphabetically", () => {
    const [group] = build({
      activeTabEntry: entry({ workspaceId: "ws-1", cwd: "/repo/.claude/worktrees/perf/src" }),
      worktrees: [
        { path: "/repo/.claude/worktrees/zeta", branch: "z", isMain: false },
        { path: "/repo", branch: "main", isMain: true },
        { path: "/repo/.claude/worktrees/alpha", branch: "a", isMain: false },
      ],
    });
    expect(group.rows.map((r) => [r.label, r.path, r.branch])).toEqual([
      ["Current tab", "/repo/.claude/worktrees/perf/src", null],
      ["Main checkout", "/repo", "main"],
      [null, "/repo/.claude/worktrees/alpha", "a"],
      [null, "/repo/.claude/worktrees/zeta", "z"],
    ]);
  });

  it("lists the worktrees even when the current tab is the main checkout, and never repeats it", () => {
    const [group] = build({
      activeTabEntry: entry({ workspaceId: "ws-1", cwd: "/repo" }),
      worktrees: [
        { path: "/repo", branch: "main", isMain: true },
        { path: "/repo/.claude/worktrees/a", branch: "a", isMain: false },
      ],
    });
    expect(group.rows.map((r) => [r.label, r.path])).toEqual([
      ["Current tab", "/repo"],
      [null, "/repo/.claude/worktrees/a"],
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

  it("requires the whole word as a substring and highlights exactly that run", () => {
    const [only] = filterFolderGroups(groups, "home");
    expect(only.workspaceId).toBe("ws-2");
    expect(only.rows).toHaveLength(1);
    // "/dotfiles/home": h o m e at indices 10..13.
    expect(only.rows[0].indices).toEqual([10, 11, 12, 13]);
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
