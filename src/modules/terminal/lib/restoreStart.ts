import type { RestorePlan } from "@/modules/agents/lib/agentSessionRestore";

// Why a terminal was not started: shown in the modal that holds the tab.
export type RestoreBlock = {
  reason: string;
  dir: string;
  command: string;
  agent?: string;
};

export type StartDecision =
  | { kind: "spawn"; cwd: string | undefined; inject: "resume" | "command" | "none" }
  | { kind: "blocked"; block: RestoreBlock };

type StartInput = {
  runOnStart: boolean;
  plan: RestorePlan | null;
  persistentCommand: string | undefined;
  initialCwd: string | undefined;
};

// A saved command with no agent plan is the only start whose directory nobody has checked yet.
export function needsDirCheck(i: StartInput): boolean {
  return i.runOnStart && !i.plan && !!i.persistentCommand && !!i.initialCwd;
}

export function decideStart(i: StartInput & { dirProblem: string | null }): StartDecision {
  if (!i.runOnStart) return { kind: "spawn", cwd: i.initialCwd, inject: "none" };
  const { plan } = i;
  if (plan) {
    if (plan.errorReason) {
      return {
        kind: "blocked",
        block: {
          reason: plan.errorReason,
          dir: plan.cwdLaunch,
          command: plan.attemptedCmd,
          agent: plan.agent,
        },
      };
    }
    if (plan.resumeCmd) return { kind: "spawn", cwd: plan.cwdLaunch, inject: "resume" };
    return { kind: "spawn", cwd: i.initialCwd, inject: "none" };
  }
  if (i.persistentCommand) {
    if (i.initialCwd && i.dirProblem) {
      return {
        kind: "blocked",
        block: { reason: i.dirProblem, dir: i.initialCwd, command: i.persistentCommand },
      };
    }
    return { kind: "spawn", cwd: i.initialCwd, inject: "command" };
  }
  return { kind: "spawn", cwd: i.initialCwd, inject: "none" };
}

export function openFailureBlock(
  error: unknown,
  dir: string | undefined,
  command: string,
): RestoreBlock {
  const msg = error instanceof Error ? error.message : String(error);
  return { reason: `Could not start the terminal: ${msg}`, dir: dir ?? "", command };
}
