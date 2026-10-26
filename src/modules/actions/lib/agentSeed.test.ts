import { describe, expect, it } from "vitest";
import type { DetectedEditor } from "@/modules/external-editors/types";
import { planAgentSeed, planAppSeed } from "./agentSeed";
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
  it("seeds one current-directory Action per new enabled agent", () => {
    const plan = planAgentSeed({ seen: [], agents: [ag("opencode"), ag("pi")], existing: [] });
    expect(plan?.add.map((a) => a.command).sort()).toEqual(["opencode", "pi"]);
    for (const a of plan?.add ?? []) {
      expect(a).toMatchObject({ kind: "agent", cwdMode: "context", ownButton: true });
      expect(a.appId).toBe(a.command);
      expect(a.iconId).toBe(a.command);
    }
    expect(plan?.add.find((a) => a.command === "opencode")?.name).toBe("OPENCODE");
    expect(new Set(plan?.add.map((a) => a.id)).size).toBe(2);
    expect(plan?.seen.sort()).toEqual(["opencode", "pi"]);
  });

  it("has nothing to seed when every agent was seen", () => {
    expect(planAgentSeed({ seen: ["opencode"], agents: [ag("opencode")], existing: [] })).toBeNull();
  });

  it("seeds only the agents never seen", () => {
    const plan = planAgentSeed({ seen: ["opencode"], agents: [ag("opencode"), ag("pi")], existing: [] });
    expect(plan?.add.map((a) => a.command)).toEqual(["pi"]);
    expect(plan?.seen).toEqual(["pi"]);
  });

  it("has nothing to seed without agents", () => {
    expect(planAgentSeed({ seen: [], agents: [], existing: [] })).toBeNull();
  });

  it("adds nothing but still marks the agent seen when its Action is already there", () => {
    const plan = planAgentSeed({ seen: [], agents: [ag("opencode")], existing: [agentAction("opencode", "context")] });
    expect(plan).toEqual({ add: [], seen: ["opencode"] });
  });

  it("skips an agent Action already present, whatever flags it carries", () => {
    const plan = planAgentSeed({
      seen: [],
      agents: [ag("opencode"), ag("pi"), ag("claude")],
      existing: [agentAction("opencode --model x", "context"), agentAction("claude --dangerously-skip-permissions", "context")],
    });
    expect(plan?.add.map((a) => a.command)).toEqual(["pi"]);
  });

  it("still seeds when the existing one starts elsewhere", () => {
    const plan = planAgentSeed({
      seen: [],
      agents: [ag("opencode")],
      existing: [agentAction("opencode", "workspace")],
    });
    expect(plan?.add.map((a) => a.command)).toEqual(["opencode"]);
  });

  it("has nothing to seed when every agent is disabled, and does not mark a disabled one", () => {
    expect(planAgentSeed({ seen: [], agents: [ag("opencode", false)], existing: [] })).toBeNull();
    const plan = planAgentSeed({ seen: [], agents: [ag("opencode", false), ag("pi")], existing: [] });
    expect(plan?.add.map((a) => a.command)).toEqual(["pi"]);
    expect(plan?.seen).toEqual(["pi"]);
  });

  it("seeds the agents without a bypass switch bare and the others with it", () => {
    const plan = planAgentSeed({ seen: [], agents: [ag("pi"), ag("claude")], existing: [] });
    expect(plan?.add.map((a) => a.command).sort()).toEqual(["claude --dangerously-skip-permissions", "pi"]);
  });
});

const ed = (id: string, enabled?: boolean): DetectedEditor => ({
  id,
  name: id,
  binary: `/bin/${id}`,
  argsBeforePath: [],
  kind: "editor",
  enabled,
});

const appAction = (command: string, name = command): Action => ({
  id: "a-2",
  name,
  kind: "app",
  command,
  ownButton: true,
});

describe("planAppSeed", () => {
  it("seeds one cwd Action per enabled app, inside the combo", () => {
    const plan = planAppSeed({ seeded: false, editors: [ed("zed"), ed("vscode")], existing: [] });
    expect(plan).toHaveLength(2);
    for (const a of plan ?? []) {
      expect(a).toMatchObject({ kind: "app", ownButton: false });
      expect(a.command).toMatch(/\{cwd\}/);
      expect(a.name).toMatch(/\{cwd\}/);
      expect(a.command).not.toMatch(/filepath|workspace/);
    }
    expect(plan?.map((a) => a.appId).sort()).toEqual(["vscode", "zed"]);
    expect(new Set(plan?.map((a) => a.id)).size).toBe(2);
  });

  it("does not seed a disabled app", () => {
    const plan = planAppSeed({ seeded: false, editors: [ed("zed"), ed("vscode", false)], existing: [] });
    expect(plan?.map((a) => a.appId)).toEqual(["zed"]);
  });

  it("has nothing to seed once seeded", () => {
    expect(planAppSeed({ seeded: true, editors: [ed("zed")], existing: [] })).toBeNull();
  });

  it("has nothing to seed without an enabled app", () => {
    expect(planAppSeed({ seeded: false, editors: [], existing: [] })).toBeNull();
    expect(planAppSeed({ seeded: false, editors: [ed("zed", false)], existing: [] })).toBeNull();
  });

  it("plans an empty list when every app is already there", () => {
    const [zed] = planAppSeed({ seeded: false, editors: [ed("zed")], existing: [] }) ?? [];
    expect(planAppSeed({ seeded: false, editors: [ed("zed")], existing: [zed] })).toEqual([]);
  });

  it("skips an app whose command exists under another name", () => {
    const [zed] = planAppSeed({ seeded: false, editors: [ed("zed")], existing: [] }) ?? [];
    const plan = planAppSeed({
      seeded: false,
      editors: [ed("zed"), ed("vscode")],
      existing: [appAction(zed.command, "My editor")],
    });
    expect(plan?.map((a) => a.appId)).toEqual(["vscode"]);
  });

  it("seeds a JetBrains-style editor, which has no file variant", () => {
    const plan = planAppSeed({ seeded: false, editors: [ed("idea")], existing: [] });
    expect(plan).toHaveLength(1);
    expect(plan?.[0].command).toMatch(/\{cwd\}/);
  });
});
