import { describe, expect, it } from "vitest";
import { tabLocation, tabStatus } from "./rowDetail";
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

describe("tabStatus", () => {
  it("joins the process name and the branch with a middle dot", () => {
    expect(tabStatus(entry({ command: "top", branch: "main" }))).toBe("top · main");
  });

  it("drops the arguments, any path and leading variables of the command", () => {
    expect(tabStatus(entry({ command: "pnpm dev --port 3000" }))).toBe("pnpm");
    expect(tabStatus(entry({ command: "NODE_ENV=prod /usr/bin/node server.js" }))).toBe("node");
  });

  it("shows only the branch for an agent, and only the process without a branch", () => {
    expect(tabStatus(entry({ command: "claude --resume", agent: "claude", branch: "main" }))).toBe("main");
    expect(tabStatus(entry({ command: "vim notes.md" }))).toBe("vim");
  });

  it("is null when there is nothing to show", () => {
    expect(tabStatus(entry())).toBeNull();
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
