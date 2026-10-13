import { describe, expect, it } from "vitest";
import { reconcileSubagents, stopOutcome } from "./subagentGate";
import type { SubagentRecord } from "./types";

describe("stopOutcome", () => {
  it("keeps working while any subagent is active, seen or not", () => {
    expect(stopOutcome(1, true)).toBe("working");
    expect(stopOutcome(2, false)).toBe("working");
  });

  it("raises attention when nothing is active and the tab is not seen", () => {
    expect(stopOutcome(0, false)).toBe("attention");
  });

  it("goes idle when nothing is active and the tab is seen", () => {
    expect(stopOutcome(0, true)).toBe("idle");
  });
});

describe("reconcileSubagents", () => {
  const known: Record<string, SubagentRecord> = {
    a1: { agentType: "Explore", startedAt: 10 },
  };

  it("returns the same object when nothing changed", () => {
    const list = [{ id: "a1", agentType: "Explore", description: "" }];
    expect(reconcileSubagents(known, list, 99)).toBe(known);
  });

  it("keeps startedAt of a known subagent and fills its description", () => {
    const list = [{ id: "a1", agentType: "Explore", description: "scan" }];
    expect(reconcileSubagents(known, list, 99)).toEqual({
      a1: { agentType: "Explore", description: "scan", startedAt: 10 },
    });
  });

  it("adds an unknown subagent with the given time", () => {
    const list = [
      { id: "a1", agentType: "Explore", description: "" },
      { id: "a2", agentType: "Plan", description: "plan it" },
    ];
    expect(reconcileSubagents(known, list, 99).a2).toEqual({
      agentType: "Plan",
      description: "plan it",
      startedAt: 99,
    });
  });

  it("drops a stale record that the list no longer has", () => {
    expect(reconcileSubagents(known, [], 99)).toEqual({});
  });
});
