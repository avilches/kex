import { describe, expect, it } from "vitest";
import type { PaneNode, Tab, Workspace } from "@/modules/workspaces/lib/types";
import {
  type TabSources,
  buildTabEntries,
  buildWorkspaceEntries,
  duplicateTitleIds,
  worktreeName,
} from "./tabEntries";

const pane = (id: string, tabs: Tab[]): PaneNode => ({
  kind: "pane",
  id,
  tabs,
  activeTabId: tabs[0]?.id ?? null,
});

const workspace = (id: string, title: string, tabs: Tab[], extra: Partial<Workspace> = {}): Workspace => ({
  id,
  title,
  paneTree: pane(`pane-${id}`, tabs),
  activePaneId: `pane-${id}`,
  ...extra,
});

const term = (id: string, extra: Partial<Extract<Tab, { kind: "terminal" }>> = {}): Tab => ({
  id,
  kind: "terminal",
  ...extra,
});

const sources = (over: Partial<TabSources> = {}): TabSources => ({
  displayTitle: (t) => t.title ?? t.id,
  git: () => ({ branch: "", repoRoot: "" }),
  runningCommand: () => null,
  agentOf: () => undefined,
  visualOf: () => null,
  lastUsed: () => 0,
  workspaceActiveAt: () => 0,
  ...over,
});

describe("worktreeName", () => {
  it("extracts the folder under .claude/worktrees", () => {
    expect(worktreeName("/p/Kex/.claude/worktrees/palette-tabs-search/src")).toBe("palette-tabs-search");
    expect(worktreeName("C:\\p\\Kex\\.claude\\worktrees\\wt1")).toBe("wt1");
  });
  it("is empty outside a worktree", () => {
    expect(worktreeName("/p/Kex/src")).toBe("");
    expect(worktreeName("")).toBe("");
  });
});

describe("buildTabEntries", () => {
  it("flattens every tab of every workspace in tree order", () => {
    const list = [
      workspace("ws-1", "One", [term("tab-1"), term("tab-2")]),
      workspace("ws-2", "Two", [term("tab-3")]),
    ];
    const entries = buildTabEntries(list, sources());
    expect(entries.map((e) => [e.tabId, e.workspaceTitle, e.order])).toEqual([
      ["tab-1", "One", 0],
      ["tab-2", "One", 1],
      ["tab-3", "Two", 2],
    ]);
  });

  it("fills cwd, branch and worktree from the sources", () => {
    const list = [workspace("ws-1", "One", [term("tab-1", { cwd: "/p/Kex/.claude/worktrees/wt1/src" })])];
    const [e] = buildTabEntries(
      list,
      sources({ git: () => ({ branch: "feature", repoRoot: "/p/Kex/.claude/worktrees/wt1" }) }),
    );
    expect(e.cwd).toBe("/p/Kex/.claude/worktrees/wt1/src");
    expect(e.branch).toBe("feature");
    expect(e.worktree).toBe("wt1");
  });

  it("treats a blank note as no note", () => {
    const list = [workspace("ws-1", "One", [term("tab-1", { note: "  \n" }), term("tab-2", { note: "buy milk" })])];
    const entries = buildTabEntries(list, sources());
    expect(entries.map((e) => e.note)).toEqual([null, "buy milk"]);
  });

  it("joins the running command and the agent into process", () => {
    const list = [workspace("ws-1", "One", [term("tab-1")])];
    const [e] = buildTabEntries(
      list,
      sources({ runningCommand: () => "pnpm dev", agentOf: () => "claude" }),
    );
    expect(e.process).toBe("pnpm dev claude");
  });

  it("falls back to the hibernation snapshot for a sleeping terminal", () => {
    const list = [
      workspace("ws-1", "One", [term("tab-1", { hibernation: { agent: "claude", command: "npm test" } })], {
        hibernated: true,
      }),
    ];
    const [e] = buildTabEntries(list, sources());
    expect(e.hibernated).toBe(true);
    expect(e.process).toBe("npm test claude");
  });

  it("uses the repo root as cwd of a git-history tab", () => {
    const list = [workspace("ws-1", "One", [{ id: "tab-1", kind: "git-history", repoRoot: "/p/Kex" }])];
    const [e] = buildTabEntries(list, sources());
    expect(e.cwd).toBe("/p/Kex");
  });

  it("gives a blank browser tab empty cwd and keeps the title the source returns", () => {
    const list = [workspace("ws-1", "One", [{ id: "tab-1", kind: "browser", url: "" }])];
    const [e] = buildTabEntries(list, sources({ displayTitle: () => "" }));
    expect(e.cwd).toBe("");
    expect(e.title).toBe("");
  });

  it("carries last use, indicator and workspace activity", () => {
    const list = [workspace("ws-1", "One", [term("tab-1")])];
    const [e] = buildTabEntries(
      list,
      sources({ lastUsed: () => 50, visualOf: () => "working", workspaceActiveAt: () => 70 }),
    );
    expect([e.lastUsedAt, e.indicator, e.workspaceActiveAt]).toEqual([50, "working", 70]);
  });
});

describe("buildWorkspaceEntries", () => {
  it("counts tabs and takes the newest tab use as last use", () => {
    const list = [workspace("ws-1", "One", [term("tab-1"), term("tab-2")], { color: "#fff" })];
    const [w] = buildWorkspaceEntries(
      list,
      sources({ lastUsed: (id) => (id === "tab-2" ? 90 : 10), workspaceActiveAt: () => 40 }),
    );
    expect(w).toMatchObject({ workspaceId: "ws-1", title: "One", color: "#fff", tabCount: 2, lastUsedAt: 90 });
  });

  it("falls back to the workspace activity when no tab was ever used", () => {
    const list = [workspace("ws-1", "One", [term("tab-1")])];
    const [w] = buildWorkspaceEntries(list, sources({ workspaceActiveAt: () => 40 }));
    expect(w.lastUsedAt).toBe(40);
  });
});

describe("duplicateTitleIds", () => {
  it("flags tabs sharing title and workspace", () => {
    const list = [
      workspace("ws-1", "One", [term("tab-1", { title: "zsh" }), term("tab-2", { title: "zsh" })]),
      workspace("ws-2", "Two", [term("tab-3", { title: "zsh" })]),
    ];
    const ids = duplicateTitleIds(buildTabEntries(list, sources()));
    expect([...ids].sort()).toEqual(["tab-1", "tab-2"]);
  });
});
