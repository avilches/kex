// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import type { SleepingTab } from "@/modules/workspaces/lib/hibernate";
import { carryOnWake, resetWakeCarry, wakeCarryOf } from "@/modules/workspaces/lib/wakeCarry";
import { liveTabSources } from "./liveTabSources";
import { tabSection } from "./tabRank";

const slept: SleepingTab = {
  id: "t1",
  kind: "terminal",
  title: "api",
  hibernation: { at: 1, agent: "claude", indicator: "attention" },
};

describe("liveTabSources after a wake", () => {
  beforeEach(() => {
    resetWakeCarry();
    useAgentStore.setState({ sessions: {}, notifications: [], closedSessions: {} });
  });

  it("keeps the agent and the orange dot of a tab that just woke, so it sits under Need attention", () => {
    carryOnWake([slept]);
    const src = liveTabSources();
    expect(src.agentOf("t1")).toBe("claude");
    expect(src.visualOf("t1")).toBe("attention");
    expect(tabSection({ indicator: src.visualOf("t1"), running: false, agent: "" })).toBe("attention");
  });

  it("gives a tab that never slept with a dot nothing extra", () => {
    const src = liveTabSources();
    expect(src.agentOf("t2")).toBeUndefined();
    expect(src.visualOf("t2")).toBeNull();
  });

  it("lets the live session speak once the agent is back, and forgets what was carried", () => {
    carryOnWake([slept]);
    useAgentStore.getState().startIdle("t1", "ws-1", "claude");
    const src = liveTabSources();
    expect(src.agentOf("t1")).toBe("claude");
    expect(src.visualOf("t1")).toBeNull();
    expect(wakeCarryOf("t1")).toBeUndefined();
  });
});
