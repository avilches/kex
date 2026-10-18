import { buildScriptInput, resolveScriptCwd, scriptCwdProblem, type ScriptShell } from "@/modules/workspaces/lib/scriptCwd";
import { planScriptStop } from "@/modules/workspaces/lib/scriptRunState";
import type { ScriptState } from "@/modules/workspaces/lib/terminalEphemeralStore";
import {
  commandProblem,
  expandCommandArgv,
  expandCommandShell,
  missingVariables,
} from "./commandTemplate";
import type { Action } from "./types";

// Run and stop decisions for Actions, with no I/O: the shell (useActionRunner) gathers the
// context, asks for a plan and carries it out.

/** The tab an Action last ran in, as it is right now. */
export type LinkedTab = {
  tabId: string;
  exists: boolean;
  terminal: boolean;
  /** This Action's own run is still going there. */
  markRunning: boolean;
  /** The user is running a command of their own there. */
  foreignCommand: boolean;
};

export type RunContext = {
  hibernated: boolean;
  shell: ScriptShell;
  /** Raw values for the command variables ({cwd}, {workspace}, {path}...); "" means no value. */
  vars: Readonly<Record<string, string>>;
  folders: {
    focusFolder?: string | null;
    workspaceRoot?: string | null;
    workspaceCwd?: string | null;
  };
  link: LinkedTab | null;
  scriptPaneExists: boolean;
  atPaneLimit: boolean;
};

export type NewTabPlacement = "scripts-pane" | "split-scripts-pane" | "active-pane";

export type RunPlan =
  | { kind: "blocked"; reason: string; silent?: boolean }
  | { kind: "spawn-app"; argv: string[] }
  | { kind: "already-running"; tabId: string }
  | { kind: "reuse-tab"; tabId: string; input: string }
  | {
      kind: "new-tab";
      placement: NewTabPlacement;
      input: string;
      cwd: string | undefined;
      title: string;
    };

const label = (action: Action) => action.name.trim() || "Action";

const blocked = (action: Action, why: string): RunPlan => ({
  kind: "blocked",
  reason: `${label(action)} not run: ${why}`,
});

function missingMessage(names: string[]): string {
  const list = names.map((n) => `{${n}}`).join(", ");
  return `${list} ${names.length > 1 ? "have" : "has"} no value here`;
}

function expandFailure(e: unknown): string {
  return e instanceof Error ? e.message : "the command cannot be expanded";
}

function planApp(action: Action, ctx: RunContext): RunPlan {
  const problem = commandProblem(action.command);
  if (problem) return blocked(action, problem);
  const missing = missingVariables(action.command, ctx.vars);
  if (missing.length > 0) return blocked(action, missingMessage(missing));
  try {
    return { kind: "spawn-app", argv: expandCommandArgv(action.command, ctx.vars) };
  } catch (e) {
    return blocked(action, expandFailure(e));
  }
}

function newTabPlacement(ctx: RunContext): NewTabPlacement {
  if (ctx.scriptPaneExists) return "scripts-pane";
  return ctx.atPaneLimit ? "active-pane" : "split-scripts-pane";
}

function planScript(action: Action, ctx: RunContext): RunPlan {
  const { link } = ctx;
  if (link?.exists && link.markRunning) return { kind: "already-running", tabId: link.tabId };
  const missing = missingVariables(action.command, ctx.vars);
  if (missing.length > 0) return blocked(action, missingMessage(missing));
  const problem = commandProblem(action.command, ctx.shell, ctx.vars);
  if (problem) return blocked(action, problem);
  const cwd = resolveScriptCwd({
    mode: action.cwdMode,
    fixedFolder: action.cwd,
    focusFolder: ctx.folders.focusFolder,
    workspaceRoot: ctx.folders.workspaceRoot,
    workspaceCwd: ctx.folders.workspaceCwd,
  });
  const cwdIssue = cwd ? scriptCwdProblem(cwd) : null;
  if (cwdIssue) return blocked(action, cwdIssue);
  let input: string;
  try {
    input = buildScriptInput(expandCommandShell(action.command, ctx.vars, ctx.shell), cwd, ctx.shell);
  } catch (e) {
    return blocked(action, expandFailure(e));
  }
  if (link?.exists && link.terminal && !link.foreignCommand) {
    return { kind: "reuse-tab", tabId: link.tabId, input };
  }
  return { kind: "new-tab", placement: newTabPlacement(ctx), input, cwd, title: label(action) };
}

/**
 * What running an Action does. A script reuses the tab it last ran in only while that tab is
 * a terminal with nothing running in it; otherwise it gets a new one, so a busy or vanished
 * tab never keeps it from running. An app is spawned and needs no tab.
 */
export function planActionRun(action: Action, ctx: RunContext): RunPlan {
  if (action.command.trim() === "") return blocked(action, "it has no command");
  if (ctx.hibernated) return { kind: "blocked", reason: "", silent: true };
  return action.runInTerminal ? planScript(action, ctx) : planApp(action, ctx);
}

export type StopPlan =
  | { kind: "none" }
  | { kind: "stop"; tabId: string; mark: ScriptState | false };

/** Stop only means something for a script that is running in a tab that still exists. */
export function planActionStop(link: {
  tabId: string;
  exists: boolean;
  commandSeen: boolean;
} | null): StopPlan {
  if (!link?.exists) return { kind: "none" };
  return { kind: "stop", tabId: link.tabId, mark: planScriptStop(link.commandSeen) };
}

export type RevealPlan = {
  switchWorkspace: boolean;
  /** "activate" moves the pane's active tab and the focus; "reveal" shows it without taking focus. */
  mode: "activate" | "reveal";
};

/**
 * How to bring a script's tab into view. Another workspace is switched to; in the user's own
 * pane a pane shows one tab, so revealing without stealing focus is impossible and activation
 * follows the script; any other pane of this workspace is revealed and the focus stays put.
 */
export function planTabReveal(at: {
  tabWorkspaceId: string;
  tabPaneId: string;
  activeWorkspaceId: string;
  userPaneId: string;
}): RevealPlan {
  if (at.tabWorkspaceId !== at.activeWorkspaceId) return { switchWorkspace: true, mode: "activate" };
  return { switchWorkspace: false, mode: at.tabPaneId === at.userPaneId ? "activate" : "reveal" };
}

/** The Action F12 acts on: the active one, or the first with a command when it has none. */
export function pickRunnableAction(
  actions: readonly Action[],
  activeId: string | undefined,
): Action | undefined {
  const runnable = actions.filter((a) => a.command.trim() !== "");
  return runnable.find((a) => a.id === activeId) ?? runnable[0];
}
