import type { RestorePlan } from "@/modules/agents/lib/agentSessionRestore";
import { quoteShellPath } from "./quoteShellPath";

// Why a terminal was not started: shown in the modal that holds the tab.
export type RestoreBlock = {
  reason: string;
  dir: string;
  command: string;
  agent?: string;
  // False for a PTY open failure: there is no terminal to continue in, so nothing is left pending.
  restorable: boolean;
};

// What a tab that stops (hibernate or close) keeps of a restore that did not run, so the way back
// shows the same state: `modal` is the error dialog, otherwise the plan only waits in the menu.
export type HeldBlock = { block: RestoreBlock; modal: boolean };

export function heldBlockOf(modal: RestoreBlock | null, pending: RestoreBlock | null): HeldBlock | null {
  if (modal) return { block: modal, modal: true };
  return pending ? { block: pending, modal: false } : null;
}

export type StartDecision =
  | { kind: "spawn"; cwd: string | undefined; inject: "resume" | "command" | "none" }
  | { kind: "blocked"; block: RestoreBlock };

type StartInput = {
  plan: RestorePlan | null;
  persistentCommand: string | undefined;
  initialCwd: string | undefined;
};

// A saved command with no agent plan is the only start whose directory nobody has checked yet.
export function needsDirCheck(i: StartInput): boolean {
  return !i.plan && !!i.persistentCommand && !!i.initialCwd;
}

export function decideStart(i: StartInput & { dirProblem: string | null }): StartDecision {
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
          restorable: true,
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
        block: {
          reason: i.dirProblem,
          dir: i.initialCwd,
          command: i.persistentCommand,
          restorable: true,
        },
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
  // A retry keeps the modal up so its button can show the spinner; the start clears or replaces it.
  if (plain) d.setBlock(null);
  try {
    await prepare(block);
  } catch (e) {
    console.error("[kex] restore action failed:", e);
    s.ptyOpening = false;
    if (plain && !s.disposed) d.setBlock(block);
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

// PowerShell 5.1 has no `&&`.
export function restoreCommandLine(dir: string, command: string, isWindows: boolean): string {
  return `cd ${quoteShellPath(dir)}${isWindows ? "; " : " && "}${command}\r`;
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
      block: {
        reason: plan.errorReason,
        dir: plan.cwdLaunch,
        command: plan.attemptedCmd,
        agent: plan.agent,
        restorable: true,
      },
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

export type PendingActionDeps = {
  leafId: string;
  getBlock: () => RestoreBlock | null;
  setPending: (block: RestoreBlock | null) => void;
  // A running agent in the shell means the plan is moot and its stored record is the live one.
  isAgentRunning: () => boolean;
  clearPlaceholder: () => void;
};

export type RetryPendingDeps = PendingActionDeps & {
  isWindows: boolean;
  previewPlan: () => Promise<RestorePlan | null>;
  checkDir: (path: string) => Promise<string | null>;
  // True once the tab was closed or its PTY replaced while a check was awaiting.
  isStale: () => boolean;
  markBlocked: (block: RestoreBlock) => void;
  // The retry found the problem still there: the menu closed already, so tell the user why.
  stillBlocked: (block: RestoreBlock) => void;
  adopt: (plan: RestorePlan) => void;
  write: (line: string) => Promise<void>;
};

const retrying = new Set<string>();

export async function retryPendingFlow(d: RetryPendingDeps): Promise<void> {
  const block = d.getBlock();
  if (!block || retrying.has(d.leafId)) return;
  if (d.isAgentRunning()) {
    d.setPending(null);
    return;
  }
  retrying.add(d.leafId);
  try {
    let plan: RestorePlan | null = null;
    let outcome: PendingOutcome;
    if (block.agent) {
      plan = await d.previewPlan();
      outcome = pendingAfterPlan(plan, d.isWindows);
    } else {
      outcome = pendingAfterDirCheck(block, await d.checkDir(block.dir), d.isWindows);
    }
    if (d.isStale()) return;
    if (d.isAgentRunning()) {
      d.setPending(null);
      return;
    }
    if (outcome.kind === "blocked") {
      d.setPending(outcome.block);
      if (block.agent) d.markBlocked(outcome.block);
      d.stillBlocked(outcome.block);
      return;
    }
    d.setPending(null);
    if (block.agent) d.clearPlaceholder();
    if (outcome.kind !== "run") return;
    if (plan) d.adopt(plan);
    await d.write(outcome.line);
  } finally {
    retrying.delete(d.leafId);
  }
}

export async function discardPendingFlow(
  d: PendingActionDeps & { detach: () => Promise<void> },
): Promise<void> {
  const block = d.getBlock();
  d.setPending(null);
  if (!block?.agent || d.isAgentRunning()) return;
  d.clearPlaceholder();
  await d.detach();
}
