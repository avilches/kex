import type { RestorePlan } from "@/modules/agents/lib/agentSessionRestore";

// Why a terminal was not started: shown in the modal that holds the tab.
export type RestoreBlock = {
  reason: string;
  dir: string;
  command: string;
  agent?: string;
  // False for a PTY open failure: there is no terminal to continue in, so nothing is left pending.
  restorable: boolean;
};

export type StartDecision =
  | { kind: "spawn"; cwd: string | undefined; inject: "resume" | "command" | "none" }
  | { kind: "blocked"; block: RestoreBlock };

type StartInput = {
  plan: RestorePlan | null;
  persistentCommand: string | undefined;
  initialCwd: string | undefined;
};

// A saved command with no agent plan is the only start whose directory nobody has checked yet. A
// shell with nothing to run needs no check: Rust starts it in the nearest folder that exists.
export function needsDirCheck(i: StartInput): boolean {
  return !i.plan && !!i.persistentCommand && !!i.initialCwd;
}

export function decideStart(i: StartInput & { dirProblem: string | null }): StartDecision {
  const { plan } = i;
  if (plan?.errorReason) {
    return {
      kind: "blocked",
      block: {
        reason: plan.errorReason,
        dir: plan.cwdLaunch,
        command: plan.attemptedCmd,
        agent: plan.agent,
        restorable: true,
      },
    };
  }
  if (plan?.resumeCmd) return { kind: "spawn", cwd: plan.cwdLaunch, inject: "resume" };
  if (!plan && i.persistentCommand) {
    if (i.initialCwd && i.dirProblem) {
      return {
        kind: "blocked",
        block: { reason: i.dirProblem, dir: i.initialCwd, command: i.persistentCommand, restorable: true },
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
  return { reason: `Could not start the terminal: ${msg}`, dir: dir ?? "", command, agent, restorable: false };
}

type HeldSession = { restoreBlock: RestoreBlock | null; ptyOpening: boolean; disposed: boolean };

export type RestoreActionDeps = {
  setBlock: (block: RestoreBlock | null) => void;
  finishAgent: () => void;
  previewPlan: () => Promise<RestorePlan | null>;
  seedPlan: (plan: RestorePlan) => void;
  detachAgent: () => Promise<void>;
  start: () => Promise<void>;
};

// ptyOpening is claimed before the first await: attachSession would otherwise see an idle session
// and start a second PTY while this one is still awaiting. The modal stays up so its button can
// show the spinner; the start clears or replaces it.
async function leaveBlock(
  s: HeldSession,
  d: RestoreActionDeps,
  prepare: (block: RestoreBlock) => Promise<void>,
): Promise<void> {
  const block = s.restoreBlock;
  if (s.disposed || !block || s.ptyOpening) return;
  s.ptyOpening = true;
  try {
    await prepare(block);
  } catch (e) {
    console.error("[kex] restore action failed:", e);
    s.ptyOpening = false;
    return;
  }
  await d.start();
}

export function retryRestoreFlow(s: HeldSession, d: RestoreActionDeps): Promise<void> {
  return leaveBlock(s, d, async (block) => {
    if (!block.agent) return;
    d.finishAgent();
    const plan = await d.previewPlan();
    if (plan) d.seedPlan(plan);
  });
}

export type PendingActionDeps = {
  leafId: string;
  getBlock: () => RestoreBlock | null;
  setPending: (block: RestoreBlock | null) => void;
  // A running agent in the shell means the plan is moot and its stored record is the live one.
  isAgentRunning: () => boolean;
  clearPlaceholder: () => void;
};

export async function discardPendingFlow(
  d: PendingActionDeps & { detach: () => Promise<void> },
): Promise<void> {
  const block = d.getBlock();
  d.setPending(null);
  if (!block?.agent || d.isAgentRunning()) return;
  d.clearPlaceholder();
  await d.detach();
}
