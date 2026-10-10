import { beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import {
  applyStagedSnapshot,
  consumeRestorePlan,
  seedRestorePlan,
  stageRestoredSnapshot,
  STAGED_SNAPSHOT_TTL_MS,
  type RestorePlan,
} from "@/modules/agents/lib/agentSessionRestore";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { _clearAll, getOscTitle } from "@/modules/terminal/lib/oscTitleStore";

function makePlan(overrides: Partial<RestorePlan> = {}): RestorePlan {
  return {
    tabId: "tab-old",
    agent: "claude",
    resumeCmd: "claude --resume 'sess-1'",
    cwdLaunch: "/home/user/project",
    errorReason: "",
    ...overrides,
  };
}

describe("seedRestorePlan", () => {
  it("makes a plan consumable under the seeded tab id, independent of the plan's own tabId field", () => {
    const plan = makePlan({ tabId: "tab-old" });
    seedRestorePlan("tab-new", plan);
    expect(consumeRestorePlan("tab-new")).toEqual(plan);
  });

  it("consume-once: a second consume for the same tab id returns null", () => {
    seedRestorePlan("tab-new-2", makePlan());
    consumeRestorePlan("tab-new-2");
    expect(consumeRestorePlan("tab-new-2")).toBeNull();
  });

  it("does not affect other tab ids already pending", () => {
    seedRestorePlan("tab-a", makePlan({ agent: "codex" }));
    seedRestorePlan("tab-b", makePlan({ agent: "gemini" }));
    expect(consumeRestorePlan("tab-a")?.agent).toBe("codex");
    expect(consumeRestorePlan("tab-b")?.agent).toBe("gemini");
  });

  it("consumeRestorePlan for an unseeded tab id still returns null", () => {
    expect(consumeRestorePlan("never-seeded")).toBeNull();
  });

  it("preserves an error-shaped plan (e.g. deleted launch cwd) through seed+consume", () => {
    const errorPlan = makePlan({ resumeCmd: "", errorReason: "launch directory no longer exists" });
    seedRestorePlan("tab-error", errorPlan);
    const consumed = consumeRestorePlan("tab-error");
    expect(consumed?.resumeCmd).toBe("");
    expect(consumed?.errorReason).toBe("launch directory no longer exists");
  });
});

describe("staged restore snapshot", () => {
  beforeEach(() => {
    useAgentStore.setState({ sessions: {}, notifications: [], closedSessions: {} });
    _clearAll();
  });

  it("puts the name back and raises the attention dot and bell entry without a new signal", () => {
    stageRestoredSnapshot(makePlan({ tabId: "t1", title: "fixing the build", notification: "attention" }));
    useAgentStore.getState().startIdle("t1", "ws", "claude");

    applyStagedSnapshot("t1");

    const s = useAgentStore.getState();
    expect(getOscTitle("t1")).toBe("fixing the build");
    expect(s.sessions.t1.status).toBe("attention");
    expect(s.notifications).toHaveLength(1);
    expect(s.notifications[0]).toMatchObject({ tabId: "t1", kind: "attention", read: false });
  });

  it("a finished notification adds the bell entry but leaves the session idle", () => {
    stageRestoredSnapshot(makePlan({ tabId: "t2", notification: "finished" }));
    useAgentStore.getState().startIdle("t2", "ws", "claude");

    applyStagedSnapshot("t2");

    const s = useAgentStore.getState();
    expect(s.sessions.t2.status).toBe("idle");
    expect(s.notifications[0].kind).toBe("finished");
  });

  it("applies once and ignores plans with nothing to restore or an unknown kind", () => {
    stageRestoredSnapshot(makePlan({ tabId: "t3", notification: "bogus", title: null }));
    useAgentStore.getState().startIdle("t3", "ws", "claude");
    applyStagedSnapshot("t3");
    expect(useAgentStore.getState().notifications).toHaveLength(0);

    stageRestoredSnapshot(makePlan({ tabId: "t3", title: "once" }));
    applyStagedSnapshot("t3");
    applyStagedSnapshot("t3");
    expect(getOscTitle("t3")).toBe("once");
  });

  it("drops a staged snapshot the agent never claimed in time, so a later manual agent starts clean", () => {
    vi.useFakeTimers();
    try {
      stageRestoredSnapshot(makePlan({ tabId: "t4", title: "old", notification: "attention" }));
      vi.advanceTimersByTime(STAGED_SNAPSHOT_TTL_MS + 1);
      useAgentStore.getState().start("t4", "ws", "claude");

      applyStagedSnapshot("t4");

      expect(getOscTitle("t4")).toBeUndefined();
      expect(useAgentStore.getState().notifications).toHaveLength(0);
      expect(useAgentStore.getState().sessions.t4.status).toBe("working");
    } finally {
      vi.useRealTimers();
    }
  });

  it("prunes expired entries when another tab is staged", () => {
    vi.useFakeTimers();
    try {
      stageRestoredSnapshot(makePlan({ tabId: "t5", title: "stale" }));
      vi.advanceTimersByTime(STAGED_SNAPSHOT_TTL_MS + 1);
      stageRestoredSnapshot(makePlan({ tabId: "t6", title: "fresh" }));
      vi.advanceTimersByTime(1000);

      applyStagedSnapshot("t5");
      applyStagedSnapshot("t6");

      expect(getOscTitle("t5")).toBeUndefined();
      expect(getOscTitle("t6")).toBe("fresh");
    } finally {
      vi.useRealTimers();
    }
  });
});
