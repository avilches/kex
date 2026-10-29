import { describe, expect, it } from "vitest";
import type { RestorePlan } from "@/modules/agents/lib/agentSessionRestore";
import {
  decideStart,
  needsDirCheck,
  openFailureBlock,
  refreshHeldBlock,
  retryRestoreFlow,
  type RestoreActionDeps,
  type RestoreBlock,
} from "./restoreStart";

const plan = (over: Partial<RestorePlan> = {}): RestorePlan => ({
  tabId: "t1",
  agent: "claude",
  resumeCmd: "",
  attemptedCmd: "",
  cwdLaunch: "/work",
  errorReason: "",
  ...over,
});

const base = { plan: null, persistentCommand: undefined, initialCwd: "/home", dirProblem: null };

describe("decideStart", () => {
  it("resumes the agent in its launch directory", () => {
    const d = decideStart({ ...base, plan: plan({ resumeCmd: "claude --resume 'a'" }) });
    expect(d).toEqual({ kind: "spawn", cwd: "/work", inject: "resume" });
  });

  it("blocks on a plan error and carries directory, command, reason and agent", () => {
    const d = decideStart({
      ...base,
      plan: plan({ errorReason: "Folder not found: /work", attemptedCmd: "claude --resume 'a'" }),
    });
    expect(d).toEqual({
      kind: "blocked",
      block: {
        reason: "Folder not found: /work",
        dir: "/work",
        command: "claude --resume 'a'",
        agent: "claude",
        restorable: true,
      },
    });
  });

  it("spawns plain when the plan has neither command nor error", () => {
    expect(decideStart({ ...base, plan: plan() })).toEqual({ kind: "spawn", cwd: "/home", inject: "none" });
  });

  it("runs the saved command when there is no plan and the directory is fine", () => {
    const d = decideStart({ ...base, persistentCommand: "pnpm dev" });
    expect(d).toEqual({ kind: "spawn", cwd: "/home", inject: "command" });
  });

  it("blocks a saved command whose directory is unusable", () => {
    const d = decideStart({ ...base, persistentCommand: "pnpm dev", dirProblem: "Not a folder: /home" });
    expect(d).toEqual({
      kind: "blocked",
      block: { reason: "Not a folder: /home", dir: "/home", command: "pnpm dev", restorable: true },
    });
  });

  it("spawns a plain terminal whose folder is gone, Rust picks the nearest folder that exists", () => {
    const d = decideStart({ ...base, initialCwd: "/pepe", dirProblem: "Folder not found: /pepe" });
    expect(d).toEqual({ kind: "spawn", cwd: "/pepe", inject: "none" });
  });

  it("spawns plain with nothing to run", () => {
    expect(decideStart(base)).toEqual({ kind: "spawn", cwd: "/home", inject: "none" });
  });
});

describe("needsDirCheck", () => {
  it("is only true for a saved command with a directory and no plan", () => {
    expect(needsDirCheck({ plan: null, persistentCommand: "x", initialCwd: "/a" })).toBe(true);
    expect(needsDirCheck({ plan: plan(), persistentCommand: "x", initialCwd: "/a" })).toBe(false);
    expect(needsDirCheck({ plan: null, persistentCommand: "", initialCwd: "/a" })).toBe(false);
    expect(needsDirCheck({ plan: null, persistentCommand: "x", initialCwd: undefined })).toBe(false);
  });
});

describe("openFailureBlock", () => {
  it("describes a PTY that could not be opened, with the command that was pending", () => {
    expect(openFailureBlock(new Error("boom"), "/home", "pnpm dev")).toEqual({
      reason: "Could not start the terminal: boom",
      dir: "/home",
      command: "pnpm dev",
      restorable: false,
    });
  });

  it("keeps the agent so a retry can fetch a fresh plan", () => {
    expect(openFailureBlock("denied", "/work", "claude --resume 'a'", "claude").agent).toBe("claude");
  });

  it("accepts a plain string error and no command", () => {
    expect(openFailureBlock("denied", undefined, "")).toEqual({
      reason: "Could not start the terminal: denied",
      dir: "",
      command: "",
      restorable: false,
    });
  });
});

describe("retryRestoreFlow", () => {
  const block = (over: Partial<RestoreBlock> = {}): RestoreBlock => ({ reason: "r", dir: "/work", command: "claude", restorable: true, ...over });
  function setup(restoreBlock: RestoreBlock | null, over: Partial<RestoreActionDeps> = {}) {
    const s = { restoreBlock, ptyOpening: false, disposed: false };
    const calls: string[] = [];
    const openingAt: Record<string, boolean> = {};
    const d: RestoreActionDeps = {
      setBlock: (b) => {
        s.restoreBlock = b;
        calls.push(b ? "block" : "unblock");
      },
      finishAgent: () => void calls.push("finish"),
      previewPlan: async () => {
        calls.push("preview");
        openingAt.preview = s.ptyOpening;
        return plan({ resumeCmd: "claude -r" });
      },
      seedPlan: () => void calls.push("seed"),
      detachAgent: async () => {
        calls.push("detach");
        openingAt.detach = s.ptyOpening;
      },
      start: async () => void calls.push("start"),
      ...over,
    };
    return { s, d, calls, openingAt };
  }

  it("retry claims ptyOpening before awaiting the new plan, then re-plans and starts", async () => {
    const { s, d, calls, openingAt } = setup(block({ agent: "claude" }));
    await retryRestoreFlow(s, d);
    expect(openingAt.preview).toBe(true);
    expect(calls).toEqual(["finish", "preview", "seed", "start"]);
  });

  it("retry without an agent just starts", async () => {
    const { s, d, calls } = setup(block());
    await retryRestoreFlow(s, d);
    expect(calls).toEqual(["start"]);
  });

  it("retry keeps the modal up while it works, so the button can show its spinner", async () => {
    const b = block({ agent: "claude" });
    const seen: Array<RestoreBlock | null> = [];
    const { s, d } = setup(b, { start: async () => void seen.push(s.restoreBlock) });
    await retryRestoreFlow(s, d);
    expect(seen).toEqual([b]);
  });

  it("puts the block back and frees ptyOpening when the preview fails", async () => {
    const b = block({ agent: "claude" });
    const { s, d, calls } = setup(b, {
      previewPlan: async () => {
        throw new Error("boom");
      },
    });
    await retryRestoreFlow(s, d);
    expect(s.restoreBlock).toBe(b);
    expect(s.ptyOpening).toBe(false);
    expect(calls).not.toContain("start");
  });

  it("ignores a second click while the first is in flight, a disposed tab and a tab without block", async () => {
    const { s, d, calls } = setup(block({ agent: "claude" }));
    await Promise.all([retryRestoreFlow(s, d), retryRestoreFlow(s, d)]);
    expect(calls.filter((c) => c === "start")).toHaveLength(1);
    const gone = setup(block(), {});
    gone.s.disposed = true;
    await retryRestoreFlow(gone.s, gone.d);
    const none = setup(null);
    await retryRestoreFlow(none.s, none.d);
    expect(gone.calls).toEqual([]);
    expect(none.calls).toEqual([]);
  });
});

describe("refreshHeldBlock", () => {
  const agentHeld: RestoreBlock = { reason: "old", dir: "/work", command: "claude --resume 'a'", agent: "claude", restorable: true };
  const cmdHeld: RestoreBlock = { reason: "old", dir: "/proj", command: "pnpm dev", restorable: true };

  it("lets a command tab start once its folder exists again", () => {
    expect(refreshHeldBlock(cmdHeld, null, null)).toBeNull();
  });
  it("keeps the values of a command tab and refreshes the reason while the folder is missing", () => {
    expect(refreshHeldBlock(cmdHeld, null, "Folder not found: /proj")).toEqual({ ...cmdHeld, reason: "Folder not found: /proj" });
  });
  it("lets an agent tab resume when the fresh plan is good", () => {
    expect(refreshHeldBlock(agentHeld, plan({ resumeCmd: "claude -r" }), null)).toBeNull();
  });
  it("refreshes the reason from a fresh plan that still fails, keeping the agent and command", () => {
    expect(refreshHeldBlock(agentHeld, plan({ errorReason: "Folder not found: /work" }), null)).toEqual({
      ...agentHeld,
      reason: "Folder not found: /work",
    });
  });
  it("keeps an agent block as it was when there is no plan to judge by", () => {
    expect(refreshHeldBlock(agentHeld, null, null)).toBe(agentHeld);
  });
});
