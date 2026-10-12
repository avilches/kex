import { describe, expect, it } from "vitest";
import type { RestorePlan } from "@/modules/agents/lib/agentSessionRestore";
import {
  cancelRestoreFlow,
  decideStart,
  needsDirCheck,
  openFailureBlock,
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

const base = { runOnStart: true, plan: null, persistentCommand: undefined, initialCwd: "/home", dirProblem: null };

describe("decideStart", () => {
  it("spawns plain at the initial cwd when Run on Start is off, even with a failing plan", () => {
    const d = decideStart({ ...base, runOnStart: false, plan: plan({ errorReason: "Directory not found: /work" }) });
    expect(d).toEqual({ kind: "spawn", cwd: "/home", inject: "none" });
  });

  it("resumes the agent in its launch directory", () => {
    const d = decideStart({ ...base, plan: plan({ resumeCmd: "claude --resume 'a'" }) });
    expect(d).toEqual({ kind: "spawn", cwd: "/work", inject: "resume" });
  });

  it("blocks on a plan error and carries directory, command, reason and agent", () => {
    const d = decideStart({
      ...base,
      plan: plan({ errorReason: "Directory not found: /work", attemptedCmd: "claude --resume 'a'" }),
    });
    expect(d).toEqual({
      kind: "blocked",
      block: {
        reason: "Directory not found: /work",
        dir: "/work",
        command: "claude --resume 'a'",
        agent: "claude",
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
    const d = decideStart({ ...base, persistentCommand: "pnpm dev", dirProblem: "Not a directory: /home" });
    expect(d).toEqual({
      kind: "blocked",
      block: { reason: "Not a directory: /home", dir: "/home", command: "pnpm dev" },
    });
  });

  it("spawns plain with nothing to run", () => {
    expect(decideStart(base)).toEqual({ kind: "spawn", cwd: "/home", inject: "none" });
  });
});

describe("needsDirCheck", () => {
  it("is only true for a saved command with a directory and no plan", () => {
    expect(needsDirCheck({ runOnStart: true, plan: null, persistentCommand: "x", initialCwd: "/a" })).toBe(true);
    expect(needsDirCheck({ runOnStart: false, plan: null, persistentCommand: "x", initialCwd: "/a" })).toBe(false);
    expect(needsDirCheck({ runOnStart: true, plan: plan(), persistentCommand: "x", initialCwd: "/a" })).toBe(false);
    expect(needsDirCheck({ runOnStart: true, plan: null, persistentCommand: "", initialCwd: "/a" })).toBe(false);
    expect(needsDirCheck({ runOnStart: true, plan: null, persistentCommand: "x", initialCwd: undefined })).toBe(false);
  });
});

describe("openFailureBlock", () => {
  it("describes a PTY that could not be opened, with the command that was pending", () => {
    expect(openFailureBlock(new Error("boom"), "/home", "pnpm dev")).toEqual({
      reason: "Could not start the terminal: boom",
      dir: "/home",
      command: "pnpm dev",
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
    });
  });
});

describe("retryRestoreFlow and cancelRestoreFlow", () => {
  const block = (over: Partial<RestoreBlock> = {}): RestoreBlock => ({ reason: "r", dir: "/work", command: "claude", ...over });
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
      start: async (plain) => void calls.push(plain ? "start:plain" : "start"),
      ...over,
    };
    return { s, d, calls, openingAt };
  }

  it("retry claims ptyOpening before awaiting the new plan, then re-plans and starts", async () => {
    const { s, d, calls, openingAt } = setup(block({ agent: "claude" }));
    await retryRestoreFlow(s, d);
    expect(openingAt.preview).toBe(true);
    expect(calls).toEqual(["unblock", "finish", "preview", "seed", "start"]);
  });

  it("retry without an agent just starts", async () => {
    const { s, d, calls } = setup(block());
    await retryRestoreFlow(s, d);
    expect(calls).toEqual(["unblock", "start"]);
  });

  it("cancel claims ptyOpening before detaching, then starts a plain shell", async () => {
    const { s, d, calls, openingAt } = setup(block({ agent: "claude" }));
    await cancelRestoreFlow(s, d);
    expect(openingAt.detach).toBe(true);
    expect(calls).toEqual(["unblock", "finish", "detach", "start:plain"]);
  });

  it("cancel still starts when detaching fails", async () => {
    const { s, d, calls } = setup(block({ agent: "claude" }), {
      detachAgent: async () => {
        throw new Error("x");
      },
    });
    await cancelRestoreFlow(s, d);
    expect(calls[calls.length - 1]).toBe("start:plain");
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
    await cancelRestoreFlow(none.s, none.d);
    expect(gone.calls).toEqual([]);
    expect(none.calls).toEqual([]);
  });
});
