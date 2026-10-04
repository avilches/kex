import { describe, it, expect } from "vitest";
import type { RestorePlan } from "@/modules/agents/lib/agentSessionRestore";
import {
  describeOrphans,
  describeSilentResume,
  findOrphanedPlans,
  hasResumed,
} from "@/modules/agents/lib/restoreCheck";

const plan = (tabId: string, agent = "claude"): RestorePlan => ({
  tabId,
  agent,
  resumeCmd: `${agent} --resume 'abc'`,
  cwdLaunch: "/tmp",
  errorReason: "",
});

describe("findOrphanedPlans", () => {
  it("returns only the plans whose tab is gone", () => {
    const plans = [plan("tab-a"), plan("tab-b"), plan("tab-c")];
    const orphaned = findOrphanedPlans(plans, new Set(["tab-a", "tab-c"]));
    expect(orphaned.map((p) => p.tabId)).toEqual(["tab-b"]);
  });

  it("returns nothing when every tab still exists", () => {
    expect(findOrphanedPlans([plan("tab-a")], new Set(["tab-a"]))).toEqual([]);
  });
});

describe("describeOrphans", () => {
  it("is null when nothing was lost, so no toast is shown", () => {
    expect(describeOrphans(3, [])).toBeNull();
  });

  it("states how many of the total were lost and which tabs", () => {
    const msg = describeOrphans(3, [plan("tab-b"), plan("tab-c", "codex")]);
    expect(msg).toContain("2 of 3");
    expect(msg).toContain("tab-b (claude)");
    expect(msg).toContain("tab-c (codex)");
  });
});

describe("describeSilentResume", () => {
  it("names the tab, the agent and the command that was written", () => {
    const msg = describeSilentResume({ ...plan("tab-a"), resumeCmd: " claude --resume 'x'" });
    expect(msg).toContain("tab-a");
    expect(msg).toContain("claude");
    expect(msg).toContain("claude --resume 'x'");
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
