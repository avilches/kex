import { describe, expect, it } from "vitest";
import type { TabEntry } from "@/modules/command-palette/lib/tabEntries";
import type { Workspace } from "@/modules/workspaces/lib/types";
import {
  buildFolderGroups,
  filterFolderGroups,
  folderRowNote,
  mainCheckoutOf,
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

describe("mainCheckoutOf", () => {
  it("strips the worktree segment of any depth", () => {
    expect(mainCheckoutOf("/repo/.claude/worktrees/perf-lab/src-tauri")).toBe("/repo");
    expect(mainCheckoutOf("/repo/.claude/worktrees/perf-lab")).toBe("/repo");
  });

  it("returns null outside a worktree", () => {
    expect(mainCheckoutOf("/repo/src-tauri")).toBeNull();
  });
});

const active = ws({ id: "ws-1", title: "Kex", workspaceRoot: "/repo" });
const other = ws({ id: "ws-2", title: "Dotfiles", color: "#4f8fff", workspaceRoot: "/dotfiles" });
const empty = ws({ id: "ws-3", title: "No folders" });

describe("buildFolderGroups", () => {
  it("lists the current tab, main checkout and workspace root first, then the rest of the cwds", () => {
    const entries = [
      entry({ workspaceId: "ws-1", cwd: "/repo/.claude/worktrees/perf-lab/src-tauri", branch: "feat/perf", lastUsedAt: 5 }),
      entry({ workspaceId: "ws-1", cwd: "/repo/src", branch: "main", lastUsedAt: 2 }),
      entry({ workspaceId: "ws-2", cwd: "/dotfiles/home" }),
    ];
    const [group] = buildFolderGroups({
      workspaces: [active, other, empty],
      activeWorkspaceId: "ws-1",
      home: null,
      activeTabEntry: entries[0],
      entries,
    });
    expect(group.rows.map((r) => [r.label, r.path])).toEqual([
      ["Current tab", "/repo/.claude/worktrees/perf-lab/src-tauri"],
      ["Main checkout", "/repo"],
      [null, "/repo/src"],
    ]);
    // The workspace root (/repo) is not repeated: main checkout already holds the path,
    // first occurrence keeps its own label.
    expect(group.rows.filter((r) => r.label === null).map((r) => r.path)).toEqual(["/repo/src"]);
  });

  it("keeps one row and one label when a tab cwd coincides with the workspace root", () => {
    const entries = [
      entry({ workspaceId: "ws-1", cwd: "/repo/src", branch: "main" }),
      entry({ workspaceId: "ws-1", cwd: "/repo", lastUsedAt: 9 }),
    ];
    const [group] = buildFolderGroups({
      workspaces: [active, other, empty],
      activeWorkspaceId: "ws-1",
      home: null,
      activeTabEntry: entries[0],
      entries,
    });
    const rootRows = group.rows.filter((r) => r.path === "/repo");
    expect(rootRows).toHaveLength(1);
    // The workspace root row comes before the plain tab rows, so it keeps the single label.
    expect(rootRows[0].label).toBe("Workspace Root");
  });

  it("groups every other workspace with its root and its tab cwds, skipping empty ones", () => {
    const entries = [
      entry({ workspaceId: "ws-2", cwd: "/dotfiles/home", branch: "main", lastUsedAt: 3 }),
      entry({ workspaceId: "ws-2", cwd: "/dotfiles", lastUsedAt: 1 }),
    ];
    const groups = buildFolderGroups({
      workspaces: [active, other, empty],
      activeWorkspaceId: "ws-1",
      home: null,
      activeTabEntry: null,
      entries,
    });
    expect(groups.map((g) => g.workspaceTitle)).toEqual(["Kex", "Dotfiles"]);
    const dotfiles = groups[1];
    expect(dotfiles.active).toBe(false);
    expect(dotfiles.rows.map((r) => [r.label, r.path])).toEqual([
      ["Workspace Root", "/dotfiles"],
      [null, "/dotfiles/home"],
    ]);
  });

  it("dedupes across workspaces: a path already listed never comes back", () => {
    const entries = [
      // The dotfiles workspace root is also a tab cwd of the active workspace.
      entry({ workspaceId: "ws-1", cwd: "/dotfiles", lastUsedAt: 4 }),
      entry({ workspaceId: "ws-2", cwd: "/dotfiles/home", lastUsedAt: 2 }),
    ];
    const groups = buildFolderGroups({
      workspaces: [active, other],
      activeWorkspaceId: "ws-1",
      home: null,
      activeTabEntry: entry({ workspaceId: "ws-1", cwd: "/repo/src" }),
      entries,
    });
    const kex = groups.find((g) => g.workspaceId === "ws-1");
    const dotfiles = groups.find((g) => g.workspaceId === "ws-2");
    // /dotfiles is taken by the active workspace's tab, so the other workspace
    // keeps only the path that is really new.
    expect(kex?.rows.map((r) => r.path)).toEqual(["/repo/src", "/repo", "/dotfiles"]);
    expect(dotfiles?.rows.map((r) => r.path)).toEqual(["/dotfiles/home"]);
  });

  it("skips a workspace whose rows were all listed before", () => {
    const entries = [entry({ workspaceId: "ws-1", cwd: "/dotfiles", lastUsedAt: 4 })];
    const groups = buildFolderGroups({
      workspaces: [active, other],
      activeWorkspaceId: "ws-1",
      home: null,
      activeTabEntry: null,
      entries,
    });
    expect(groups.map((g) => g.workspaceId)).toEqual(["ws-1"]);
  });

  it("keeps hibernated workspaces with their tag", () => {
    const sleeping = ws({ id: "ws-4", title: "Sleeping", workspaceRoot: "/sleep", hibernated: true });
    const groups = buildFolderGroups({
      workspaces: [active, sleeping],
      activeWorkspaceId: "ws-1",
      home: null,
      activeTabEntry: null,
      entries: [entry({ workspaceId: "ws-4", cwd: "/sleep/sub", hibernated: true })],
    });
    expect(groups[1].hibernated).toBe(true);
    // The whole workspace sleeps, so every row of it reads as hibernated.
    expect(groups[1].rows.map((r) => [r.label, r.hibernated])).toEqual([
      ["Workspace Root", true],
      [null, true],
    ]);
  });

  it("drops browser tabs, which carry no folder", () => {
    const noRoot = ws({ id: "ws-5", title: "Bare" });
    const groups = buildFolderGroups({
      workspaces: [active, noRoot],
      activeWorkspaceId: "ws-1",
      home: null,
      activeTabEntry: null,
      entries: [entry({ workspaceId: "ws-5", kind: "browser", cwd: "" })],
    });
    // No root and no tab folders: the group disappears.
    expect(groups).toHaveLength(1);
  });
});

describe("filterFolderGroups", () => {
  const withHome = ws({ id: "ws-6", title: "HomeWorkspace" });
  const groups = buildFolderGroups({
    workspaces: [active, other, withHome],
    activeWorkspaceId: "ws-1",
    home: "/Users/avilches",
    activeTabEntry: entry({ workspaceId: "ws-1", cwd: "/repo/src-tauri", branch: "main" }),
    entries: [
      entry({ workspaceId: "ws-1", cwd: "/repo/src-tauri" }),
      entry({ workspaceId: "ws-2", cwd: "/dotfiles/home" }),
      entry({ workspaceId: "ws-6", cwd: "/Users/avilches/server.py" }),
    ],
  });

  it("returns every row with no indices on an empty query", () => {
    const [g1, g2] = filterFolderGroups(groups, "  ");
    expect(g1.rows).toHaveLength(2);
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
    expect(matched[0].rows[0].indices).toEqual([16, 17, 18]);
  });

  it("drops rows missing any token", () => {
    const matched = filterFolderGroups(groups, "dotfiles tauri");
    expect(matched).toEqual([]);
  });

  it("keeps group order and row order (no reordering on search)", () => {
    const [g1, g2] = filterFolderGroups(groups, "o");
    expect(g1.workspaceId).toBe("ws-1");
    expect(g2.workspaceId).toBe("ws-2");
  });
});

describe("folderRowNote", () => {
  it("joins label, branch and process", () => {
    expect(folderRowNote({
      key: "k", path: "/p", label: "Current tab", branch: "feat", process: "claude",
      matchOffset: 0,
      workspaceId: "ws-1", hibernated: false,
    })).toBe("Current tab \u00b7 feat \u00b7 claude");
  });
});
