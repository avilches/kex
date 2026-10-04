import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { seedRestorePlan, consumeRestorePlan, type RestorePlan } from "@/modules/agents/lib/agentSessionRestore";

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
