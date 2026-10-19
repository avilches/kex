import { describe, expect, it } from "vitest";
import { tabLocation } from "./rowDetail";
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
  indicator: null,
  tab: { id: "tab-1", kind: "terminal" },
  agentSession: undefined,
  running: false,
  lastUsedAt: 0,
  workspaceActiveAt: 0,
  order: 0,
  ...over,
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
