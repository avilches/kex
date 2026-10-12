import type { RestorePlan } from "@/modules/agents/lib/agentSessionRestore";
import { quoteShellPath } from "./quoteShellPath";

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
  agent?: string,
): RestoreBlock {
  const msg = error instanceof Error ? error.message : String(error);
  return { reason: `Could not start the terminal: ${msg}`, dir: dir ?? "", command, agent };
}

type HeldSession = { restoreBlock: RestoreBlock | null; ptyOpening: boolean; disposed: boolean };

export type RestoreActionDeps = {
  setBlock: (block: RestoreBlock | null) => void;
  finishAgent: () => void;
  previewPlan: () => Promise<RestorePlan | null>;
  seedPlan: (plan: RestorePlan) => void;
  detachAgent: () => Promise<void>;
  start: (plain: boolean) => Promise<void>;
};

// ptyOpening is claimed before the first await: once the block is cleared, attachSession would
// otherwise see an idle session and start a second PTY while this one is still awaiting.
async function leaveBlock(
  s: HeldSession,
  d: RestoreActionDeps,
  prepare: (block: RestoreBlock) => Promise<void>,
  plain: boolean,
): Promise<void> {
  const block = s.restoreBlock;
  if (s.disposed || !block || s.ptyOpening) return;
  s.ptyOpening = true;
  d.setBlock(null);
  try {
    await prepare(block);
  } catch (e) {
    console.error("[kex] restore action failed:", e);
    s.ptyOpening = false;
    if (!s.disposed) d.setBlock(block);
    return;
  }
  await d.start(plain);
}

export function retryRestoreFlow(s: HeldSession, d: RestoreActionDeps): Promise<void> {
  return leaveBlock(
    s,
    d,
    async (block) => {
      if (!block.agent) return;
      d.finishAgent();
      const plan = await d.previewPlan();
      if (plan) d.seedPlan(plan);
    },
    false,
  );
}

// The plan and the store entry survive: the tab only gets a plain shell.
export function openWithoutRestoringFlow(s: HeldSession, d: RestoreActionDeps): Promise<void> {
  return leaveBlock(s, d, async () => {}, true);
}

// PowerShell 5.1 has no `&&`. The leading space keeps the line out of shell history.
export function restoreCommandLine(dir: string, command: string, isWindows: boolean): string {
  return ` cd ${quoteShellPath(dir)}${isWindows ? "; " : " && "}${command}\r`;
}

export type PendingOutcome =
  | { kind: "gone" }
  | { kind: "blocked"; block: RestoreBlock }
  | { kind: "run"; line: string };

export function pendingAfterPlan(plan: RestorePlan | null, isWindows: boolean): PendingOutcome {
  if (!plan) return { kind: "gone" };
  if (plan.errorReason) {
    return {
      kind: "blocked",
      block: { reason: plan.errorReason, dir: plan.cwdLaunch, command: plan.attemptedCmd, agent: plan.agent },
    };
  }
  if (!plan.resumeCmd) return { kind: "gone" };
  return { kind: "run", line: restoreCommandLine(plan.cwdLaunch, plan.resumeCmd, isWindows) };
}

export function pendingAfterDirCheck(
  block: RestoreBlock,
  problem: string | null,
  isWindows: boolean,
): PendingOutcome {
  if (problem) return { kind: "blocked", block: { ...block, reason: problem } };
  return { kind: "run", line: restoreCommandLine(block.dir, block.command, isWindows) };
}
