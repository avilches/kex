import { beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import {
  applyStagedSnapshot,
  consumeRestorePlan,
  seedRestorePlan,
  stageRestoredSnapshot,
  stagedSnapshotCount,
  STAGED_SNAPSHOT_TTL_MS,
  type RestorePlan,
} from "@/modules/agents/lib/agentSessionRestore";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { _clearAll, getOscTitle, setOscTitle } from "@/modules/terminal/lib/oscTitleStore";

function makePlan(overrides: Partial<RestorePlan> = {}): RestorePlan {
  return {
    tabId: "tab-old",
    agent: "claude",
    resumeCmd: "claude --resume 'sess-1'",
    attemptedCmd: "",
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
    usePreferencesStore.setState({ agentNotifications: true });
    _clearAll();
  });

  it("puts the name back and raises the attention dot and bell entry without a new signal", () => {
    const plan = makePlan({ tabId: "t1", title: "fixing the build", notification: "attention" });
    stageRestoredSnapshot("t1", plan);
    useAgentStore.getState().startIdle("t1", "ws", "claude");

    expect(applyStagedSnapshot("t1")).toBe(true);

    const s = useAgentStore.getState();
    expect(getOscTitle("t1")).toBe("fixing the build");
    expect(s.sessions.t1.status).toBe("attention");
    expect(s.notifications).toHaveLength(1);
    expect(s.notifications[0]).toMatchObject({ tabId: "t1", kind: "attention", read: false });
  });

  it("a finished notification adds the bell entry but leaves the session idle", () => {
    stageRestoredSnapshot("t2", makePlan({ tabId: "t2", notification: "finished" }));
    useAgentStore.getState().startIdle("t2", "ws", "claude");

    applyStagedSnapshot("t2");

    const s = useAgentStore.getState();
    expect(s.sessions.t2.status).toBe("idle");
    expect(s.notifications[0].kind).toBe("finished");
  });

  it("keeps the bell empty when notifications are switched off, but still raises the dot", () => {
    usePreferencesStore.setState({ agentNotifications: false });
    stageRestoredSnapshot("t7", makePlan({ tabId: "t7", notification: "attention" }));
    useAgentStore.getState().startIdle("t7", "ws", "claude");

    applyStagedSnapshot("t7");

    const s = useAgentStore.getState();
    expect(s.notifications).toHaveLength(0);
    expect(s.sessions.t7.status).toBe("attention");
  });

  it("seeds the worktree the agent was in, so the tab follows it before the first prompt", () => {
    stageRestoredSnapshot("t8", makePlan({ tabId: "t8", worktreeCwd: "/home/user/project/.claude/worktrees/pepe" }));
    useAgentStore.getState().startIdle("t8", "ws", "claude");

    expect(applyStagedSnapshot("t8")).toBe(true);

    expect(useAgentStore.getState().sessions.t8.meta).toMatchObject({
      agentCwd: "/home/user/project/.claude/worktrees/pepe",
      worktreeCwd: "/home/user/project/.claude/worktrees/pepe",
    });
  });

  it("is keyed by the tab that spawns the PTY, not by the id inside the plan (reopened closed tab)", () => {
    stageRestoredSnapshot("t-new", makePlan({ tabId: "t-old", title: "reopened" }));
    useAgentStore.getState().startIdle("t-new", "ws", "claude");

    expect(applyStagedSnapshot("t-old")).toBe(false);
    expect(applyStagedSnapshot("t-new")).toBe(true);
    expect(getOscTitle("t-new")).toBe("reopened");
  });

  it("applies once and ignores plans with nothing to restore or an unknown kind", () => {
    stageRestoredSnapshot("t3", makePlan({ tabId: "t3", notification: "bogus", title: null }));
    useAgentStore.getState().startIdle("t3", "ws", "claude");
    expect(applyStagedSnapshot("t3")).toBe(false);
    expect(useAgentStore.getState().notifications).toHaveLength(0);

    stageRestoredSnapshot("t3", makePlan({ tabId: "t3", title: "once" }));
    expect(applyStagedSnapshot("t3")).toBe(true);
    setOscTitle("t3", "agent sent a new one");
    expect(applyStagedSnapshot("t3")).toBe(false);
    expect(getOscTitle("t3")).toBe("agent sent a new one");
  });

  it("drops a staged snapshot the agent never claimed in time, so a later manual agent starts clean", () => {
    vi.useFakeTimers();
    try {
      stageRestoredSnapshot("t4", makePlan({ tabId: "t4", title: "old", notification: "attention" }));
      vi.advanceTimersByTime(STAGED_SNAPSHOT_TTL_MS + 1);
      useAgentStore.getState().start("t4", "ws", "claude");

      expect(applyStagedSnapshot("t4")).toBe(false);

      expect(getOscTitle("t4")).toBeUndefined();
      expect(useAgentStore.getState().notifications).toHaveLength(0);
      expect(useAgentStore.getState().sessions.t4.status).toBe("working");
    } finally {
      vi.useRealTimers();
    }
  });

  it("prunes expired entries from the map when another tab is staged", () => {
    vi.useFakeTimers();
    try {
      stageRestoredSnapshot("t5", makePlan({ tabId: "t5", title: "stale" }));
      const before = stagedSnapshotCount();
      vi.advanceTimersByTime(STAGED_SNAPSHOT_TTL_MS + 1);
      stageRestoredSnapshot("t6", makePlan({ tabId: "t6", title: "fresh" }));

      expect(before).toBeGreaterThan(0);
      expect(stagedSnapshotCount()).toBe(1);
      expect(applyStagedSnapshot("t6")).toBe(true);
      expect(stagedSnapshotCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
