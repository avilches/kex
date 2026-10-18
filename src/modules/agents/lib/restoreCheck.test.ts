import { describe, it, expect } from "vitest";
import type { RestorePlan } from "@/modules/agents/lib/agentSessionRestore";
import {
  describeSilentResume,
  expectsSessionReport,
  hasResumed,
} from "@/modules/agents/lib/restoreCheck";

const plan = (tabId: string, agent = "claude"): RestorePlan => ({
  tabId,
  agent,
  resumeCmd: `${agent} --resume 'abc'`,
  attemptedCmd: "",
  cwdLaunch: "/tmp",
  errorReason: "",
});

describe("describeSilentResume", () => {
  it("names the tab, the agent and the command that was written", () => {
    const msg = describeSilentResume({ ...plan("tab-a"), resumeCmd: " claude --resume 'x'" });
    expect(msg).toContain("tab-a");
    expect(msg).toContain("claude");
    expect(msg).toContain("claude --resume 'x'");
  });
});

describe("expectsSessionReport", () => {
  it("is false for OpenCode, which stays silent until its first event", () => {
    expect(expectsSessionReport("opencode")).toBe(false);
    expect(expectsSessionReport("OpenCode")).toBe(false);
  });

  it("is true for the agents that report on launch", () => {
    for (const agent of ["claude", "omp", "pi", "codex"]) {
      expect(expectsSessionReport(agent)).toBe(true);
    }
  });
});

describe("hasResumed", () => {
  it("is false without a session or without a session id", () => {
    expect(hasResumed(undefined)).toBe(false);
    expect(hasResumed({})).toBe(false);
    expect(hasResumed({ meta: {} })).toBe(false);
  });

  it("is true once SessionStart delivered the session id", () => {
    expect(hasResumed({ meta: { sessionId: "s1" } })).toBe(true);
  });
});
