import { describe, expect, it } from "vitest";
import { tabDetailLines, tabLocation } from "./rowDetail";
import type { TabEntry } from "./tabEntries";

const entry = (over: Partial<TabEntry> = {}): TabEntry => ({
  tabId: "tab-1",
  workspaceId: "ws-1",
  workspaceTitle: "Work",
  workspaceColor: null,
  workspaceIcon: null,
  hibernated: false,
  kind: "terminal",
  title: "zsh",
  note: null,
  cwd: "/p/Kex",
  detail: "/p/Kex",
  worktree: "",
  branch: "",
  process: "",
  command: "",
  agent: "",
  indicator: null,
  tab: { id: "tab-1", kind: "terminal" },
  agentSession: undefined,
  running: false,
  lastUsedAt: 0,
  workspaceActiveAt: 0,
  order: 0,
  ...over,
});

describe("tabDetailLines", () => {
  it("puts the process and the branch on their own line when there are both", () => {
    expect(tabDetailLines(entry({ command: "top", branch: "main" }))).toEqual(["/p/Kex", "top \u00b7 main"]);
  });

  it("puts a lone process before the path and a lone branch after it", () => {
    expect(tabDetailLines(entry({ command: "vim notes.md" }))).toEqual(["vim \u00b7 /p/Kex"]);
    expect(tabDetailLines(entry({ branch: "main" }))).toEqual(["/p/Kex \u00b7 main"]);
  });

  it("drops the arguments, any path and leading variables of the command", () => {
    expect(tabDetailLines(entry({ command: "pnpm dev --port 3000" }))).toEqual(["pnpm \u00b7 /p/Kex"]);
    expect(tabDetailLines(entry({ command: "NODE_ENV=prod /usr/bin/node server.js" }))).toEqual(["node \u00b7 /p/Kex"]);
  });

  it("ignores the process of an agent", () => {
    expect(tabDetailLines(entry({ command: "claude", agent: "claude" }))).toEqual(["/p/Kex"]);
    expect(tabDetailLines(entry({ command: "claude", agent: "claude", branch: "main" }))).toEqual(["/p/Kex \u00b7 main"]);
  });

  it("is just the path with nothing else, and empty with nothing at all", () => {
    expect(tabDetailLines(entry())).toEqual(["/p/Kex"]);
    expect(tabDetailLines(entry({ detail: "" }))).toEqual([]);
  });
});

describe("tabLocation", () => {
  it("keeps the absolute path as it is", () => {
    expect(tabLocation(entry({ detail: "/Users/x/Hub/Projects/Kex/src/foo.ts" }))).toBe(
      "/Users/x/Hub/Projects/Kex/src/foo.ts",
    );
  });

  it("strips the protocol of a browser url", () => {
    expect(tabLocation(entry({ kind: "browser", detail: "https://example.com/docs" }))).toBe(
      "example.com/docs",
    );
  });

  it("is null when the tab has nowhere to point", () => {
    expect(tabLocation(entry({ detail: "" }))).toBeNull();
    expect(tabLocation(entry({ kind: "browser", detail: "https://" }))).toBeNull();
  });
});
