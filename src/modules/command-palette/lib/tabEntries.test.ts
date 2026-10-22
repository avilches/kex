import { describe, expect, it } from "vitest";
import type { PaneNode, Tab, Workspace } from "@/modules/workspaces/lib/types";
import { initialColorForId } from "@/modules/workspaces/lib/workspaceColor";
import { type TabSources, buildTabEntries, buildWorkspaceEntries, worktreeName } from "./tabEntries";

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
  workspaceTitle: (ws) => ws.title,
  git: () => ({ branch: "", repoRoot: "" }),
  runningCommand: () => null,
  agentOf: () => undefined,
  agentSessionOf: () => undefined,
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

  it("keeps the url of a browser tab and the absolute path of everything else as detail", () => {
    const list = [
      workspace("ws-1", "One", [
        { id: "tab-1", kind: "browser", url: "https://example.com/docs" },
        term("tab-2", { cwd: "/p/Kex" }),
        { id: "tab-3", kind: "editor", path: "/p/Kex/src/foo.ts", dirty: false, preview: false },
      ]),
    ];
    const entries = buildTabEntries(list, sources());
    expect(entries.map((e) => e.detail)).toEqual([
      "https://example.com/docs",
      "/p/Kex",
      "/p/Kex/src/foo.ts",
    ]);
  });

  it("resolves the workspace title and carries its color and icon in every tab row", () => {
    const list = [
      workspace("ws-1", "{host}: {cwd}", [term("tab-1")], { color: "#8b5cf6", icon: "code" }),
    ];
    const [e] = buildTabEntries(list, sources({ workspaceTitle: () => "avilches: ~/Kex" }));
    expect(e.workspaceTitle).toBe("avilches: ~/Kex");
    expect(e.workspaceColor).toBe("#8b5cf6");
    expect(e.workspaceIcon).toBe("code");
  });

  it("gives a workspace without an explicit color its automatic one, and keeps an explicit no-color", () => {
    const auto = workspace("ws-auto", "Auto", [term("tab-1")]);
    const none = workspace("ws-none", "None", [term("tab-2")], { color: null });
    const [a, b] = buildTabEntries([auto, none], sources());
    expect(a.workspaceColor).toBe(initialColorForId("ws-auto"));
    expect(b.workspaceColor).toBeNull();
    const [wa, wb] = buildWorkspaceEntries([auto, none], sources());
    expect(wa.color).toBe(initialColorForId("ws-auto"));
    expect(wb.color).toBeNull();
  });

  it("carries last use, indicator and workspace activity", () => {
    const list = [workspace("ws-1", "One", [term("tab-1")])];
    const [e] = buildTabEntries(
      list,
      sources({ lastUsed: () => 50, visualOf: () => "working", workspaceActiveAt: () => 70 }),
    );
    expect([e.lastUsedAt, e.indicator, e.workspaceActiveAt]).toEqual([50, "working", 70]);
  });

  it("carries the live tab, its agent session and whether it is running", () => {
    const t = term("tab-1");
    const [e] = buildTabEntries(
      [workspace("ws-1", "One", [t])],
      sources({ runningCommand: () => "pnpm dev", agentSessionOf: () => ({ agent: "claude" }) as never }),
    );
    expect(e.tab).toBe(t);
    expect(e.running).toBe(true);
    expect(e.agentSession?.agent).toBe("claude");
  });

  it("marks a tab with no running command as not running", () => {
    const [e] = buildTabEntries([workspace("ws-1", "One", [term("tab-1")])], sources());
    expect(e.running).toBe(false);
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

  it("resolves the title through the sources instead of showing the raw template", () => {
    const list = [workspace("ws-1", "{host}: {cwd}", [term("tab-1")])];
    const [w] = buildWorkspaceEntries(list, sources({ workspaceTitle: () => "avilches: ~/Kex" }));
    expect(w.title).toBe("avilches: ~/Kex");
  });

  it("carries the workspace icon", () => {
    const list = [workspace("ws-1", "One", [term("tab-1")], { icon: "code" })];
    const [w] = buildWorkspaceEntries(list, sources());
    expect(w.icon).toBe("code");
  });
});
