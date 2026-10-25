import { describe, expect, it } from "vitest";
import type { DetectedEditor } from "@/modules/external-editors/types";
import { planAgentSeed } from "./agentSeed";
import type { Action } from "./types";

const ag = (id: string, enabled?: boolean): DetectedEditor => ({
  id,
  name: id.toUpperCase(),
  binary: `/bin/${id}`,
  argsBeforePath: [],
  kind: "agent",
  enabled,
});

const agentAction = (command: string, cwdMode: Action["cwdMode"]): Action => ({
  id: "a-1",
  name: command,
  kind: "agent",
  command,
  cwdMode,
  ownButton: false,
});

describe("planAgentSeed", () => {
  it("seeds one current-directory Action per enabled agent", () => {
    const plan = planAgentSeed({ seeded: false, agents: [ag("claude"), ag("pi")], existing: [] });
    expect(plan?.map((a) => a.command).sort()).toEqual(["claude", "pi"]);
    for (const a of plan ?? []) {
      expect(a).toMatchObject({ kind: "agent", cwdMode: "context", ownButton: true });
      expect(a.appId).toBe(a.command);
      expect(a.iconId).toBe(a.command);
    }
    expect(plan?.find((a) => a.command === "claude")?.name).toBe("CLAUDE");
    expect(new Set(plan?.map((a) => a.id)).size).toBe(2);
  });

  it("has nothing to seed once seeded", () => {
    expect(planAgentSeed({ seeded: true, agents: [ag("claude")], existing: [] })).toBeNull();
  });

  it("has nothing to seed without agents", () => {
    expect(planAgentSeed({ seeded: false, agents: [], existing: [] })).toBeNull();
  });

  it("plans an empty list when every enabled agent is already there", () => {
    expect(planAgentSeed({ seeded: false, agents: [ag("claude")], existing: [agentAction("claude", "context")] })).toEqual([]);
  });

  it("skips an agent Action already present with the same identity", () => {
    const plan = planAgentSeed({
      seeded: false,
      agents: [ag("claude"), ag("pi")],
      existing: [agentAction("claude", "context")],
    });
    expect(plan?.map((a) => a.command)).toEqual(["pi"]);
  });

  it("still seeds when the existing one starts elsewhere", () => {
    const plan = planAgentSeed({
      seeded: false,
      agents: [ag("claude")],
      existing: [agentAction("claude", "workspace")],
    });
    expect(plan?.map((a) => a.command)).toEqual(["claude"]);
  });

  it("has nothing to seed when every agent is disabled", () => {
    expect(planAgentSeed({ seeded: false, agents: [ag("claude", false)], existing: [] })).toBeNull();
    expect(planAgentSeed({ seeded: false, agents: [ag("claude", false), ag("pi")], existing: [] })?.map((a) => a.command)).toEqual(["pi"]);
  });
});
