import { describe, expect, it } from "vitest";
import type { RestorePlan } from "@/modules/agents/lib/agentSessionRestore";
import { decideStart, needsDirCheck, openFailureBlock } from "./restoreStart";

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

  it("accepts a plain string error and no command", () => {
    expect(openFailureBlock("denied", undefined, "")).toEqual({
      reason: "Could not start the terminal: denied",
      dir: "",
      command: "",
    });
  });
});
