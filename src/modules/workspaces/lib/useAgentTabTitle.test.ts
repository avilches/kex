import { describe, expect, it } from "vitest";
import type { AgentSession } from "@/modules/agents/lib/types";
import { resolveAgentTabTitle } from "./useAgentTabTitle";
import type { Tab } from "./types";

// The window between a wake (or an app-restart restore) and the agent's first OSC title:
// no live osc, no running command, no agent session yet. Only what the workspace JSON
// persisted survives.
const woken = (agentTitle?: string): Extract<Tab, { kind: "terminal" }> => ({
  id: "tab-1",
  kind: "terminal",
  cwd: "/home/me",
  ...(agentTitle !== undefined ? { agentTitle } : {}),
});

const session = (sessionTitle?: string): AgentSession => ({
  tabId: "tab-1",
  workspaceId: "ws-1",
  agent: "claude",
  status: "working",
  startedAt: 0,
  lastActivityAt: 0,
  attentionSince: null,
  restored: false,
  restoreError: false,
  subagents: {},
  meta: sessionTitle ? { sessionTitle } : {},
});

describe("resolveAgentTabTitle - persisted agentTitle fills the wake window", () => {
  it("a tab without live sources shows the title the agent last sent", () => {
    const info = resolveAgentTabTitle(woken("fixing the parser"), null, undefined, undefined);
    expect(info.displayTitle).toBe("fixing the parser · me");
    expect(info.isDescription).toBe(true);
  });

  it("the live OSC title wins over the persisted one", () => {
    const info = resolveAgentTabTitle(woken("fixing the parser"), null, "live status", undefined);
    expect(info.displayTitle).toBe("live status · me");
  });

  it("the persisted title also wins over the session title while no OSC has arrived", () => {
    const info = resolveAgentTabTitle(woken("fixing the parser"), null, undefined, session("initial"));
    expect(info.displayTitle).toBe("fixing the parser");
  });

  it("a tab with nothing persisted keeps the folder default", () => {
    const info = resolveAgentTabTitle(woken(), null, undefined, undefined);
    expect(info.displayTitle).toBe("me");
    expect(info.isDescription).toBe(false);
  });

  it("a manual rename wins over the persisted title", () => {
    const named = { ...woken("fixing the parser"), title: "renamed" };
    const info = resolveAgentTabTitle(named, null, undefined, undefined);
    expect(info.displayTitle).toBe("renamed");
  });
});

describe("resolveAgentTabTitle - a sleeping tab keeps the name it had", () => {
  const asleep = (title: string): Tab => ({ ...woken("older"), hibernation: { at: 1, title } });

  it("shows the title saved at hibernation, whatever the live sources say", () => {
    const info = resolveAgentTabTitle(asleep("npm test · main"), "vitest", "live", undefined);
    expect(info.displayTitle).toBe("npm test · main");
    expect(info.isRunning).toBe(false);
  });

  it("a snapshot without a title falls back to the usual resolution", () => {
    const info = resolveAgentTabTitle({ ...woken("older"), hibernation: { at: 1, agent: "claude" } }, null, undefined, undefined);
    expect(info.displayTitle).toBe("older · me");
  });
});

describe("resolveAgentTabTitle - running script name", () => {
  it("shows the Action name instead of the default title while the script runs", () => {
    const info = resolveAgentTabTitle(woken(), null, undefined, undefined, undefined, "Dev");
    expect(info.displayTitle).toBe("Dev");
    expect(info.isDescription).toBe(true);
  });

  it("goes back to the default title once there is no script name", () => {
    const info = resolveAgentTabTitle(woken(), null, undefined, undefined, undefined, undefined);
    expect(info.displayTitle).not.toBe("Dev");
  });

  it("never replaces the user's own title", () => {
    const info = resolveAgentTabTitle({ ...woken(), title: "Mine" }, null, undefined, undefined, undefined, "Dev");
    expect(info.displayTitle).toBe("Mine");
  });
});
