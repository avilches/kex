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

const agentAction = (command: string): Action => ({
  id: "a-1",
  name: command,
  kind: "agent",
  command,
  ownButton: false,
});

describe("planAgentSeed", () => {
  it("seeds one Action per new enabled agent, with its own button and no folder", () => {
    const plan = planAgentSeed({ seen: [], agents: [ag("opencode"), ag("pi")], existing: [] });
    expect(plan?.add.map((a) => a.command).sort()).toEqual(["opencode", "pi"]);
    for (const a of plan?.add ?? []) {
      expect(a).toMatchObject({ kind: "agent", ownButton: true });
      expect(a).not.toHaveProperty("cwdMode");
      expect(a.icon).toBe(`agent:${a.command}`);
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
    const plan = planAgentSeed({ seen: [], agents: [ag("opencode")], existing: [agentAction("opencode")] });
    expect(plan).toEqual({ add: [], seen: ["opencode"] });
  });

  it("skips an agent Action already present, whatever flags it carries", () => {
    const plan = planAgentSeed({
      seen: [],
      agents: [ag("opencode"), ag("pi"), ag("claude")],
      existing: [agentAction("opencode --model x"), agentAction("claude --dangerously-skip-permissions")],
    });
    expect(plan?.add.map((a) => a.command)).toEqual(["pi"]);
  });

  it("does not seed over a leftover Action that still carries an old folder mode", () => {
    const old = { ...agentAction("opencode"), cwdMode: "workspace" as const };
    const plan = planAgentSeed({ seen: [], agents: [ag("opencode")], existing: [old] });
    expect(plan).toEqual({ add: [], seen: ["opencode"] });
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
  it("seeds one Action per enabled app, inside the combo, ending in {target}", () => {
    const plan = planAppSeed({ seeded: false, editors: [ed("zed"), ed("vscode")], existing: [] });
    expect(plan).toHaveLength(2);
    for (const a of plan ?? []) {
      expect(a).toMatchObject({ kind: "app", ownButton: false, accepts: "both" });
      expect(a.command).toMatch(/\{target\}$/);
      expect(a.name).not.toMatch(/[{}]/);
      expect(a.command).not.toMatch(/filepath|workspace|cwd/);
    }
    expect(plan?.map((a) => a.icon).sort()).toEqual(["app:vscode", "app:zed"]);
    expect(new Set(plan?.map((a) => a.id)).size).toBe(2);
  });

  it("does not seed a disabled app", () => {
    const plan = planAppSeed({ seeded: false, editors: [ed("zed"), ed("vscode", false)], existing: [] });
    expect(plan?.map((a) => a.icon)).toEqual(["app:zed"]);
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
    expect(plan?.map((a) => a.icon)).toEqual(["app:vscode"]);
  });

  it("seeds a JetBrains-style editor once, and says it takes folders only", () => {
    const plan = planAppSeed({ seeded: false, editors: [ed("pycharm")], existing: [] });
    expect(plan).toHaveLength(1);
    expect(plan?.[0]).toMatchObject({ accepts: "folder" });
    expect(plan?.[0].command).toMatch(/\{target\}$/);
  });

  it("seeds an app once however many places it fits", () => {
    const plan = planAppSeed({ seeded: false, editors: [ed("zed")], existing: [] });
    expect(plan).toHaveLength(1);
  });
});
