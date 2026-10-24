import { IS_WINDOWS } from "@/lib/platform";
import { resolveScriptCwd, scriptCwdProblem, type ScriptShell } from "@/modules/workspaces/lib/scriptCwd";
import { planScriptStop } from "@/modules/workspaces/lib/scriptRunState";
import type { ScriptState } from "@/modules/workspaces/lib/terminalEphemeralStore";
import {
  commandProblem,
  commandVariablesUsed,
  expandCommandArgv,
  expandCommandShell,
  missingVariables,
} from "./commandTemplate";
import { needsWorkspaceRoot, WORKSPACE_UNSET } from "./actionsBar";
import { isAgent, isScript, type Action } from "./types";

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
  cwd: string | undefined;
};

export type RunContext = {
  hibernated: boolean;
  shell: ScriptShell;
  /** Raw values for the command variables ({cwd}, {workspace}, {filepath}...); "" means no value. */
  vars: Readonly<Record<string, string>>;
  folders: {
    focusFolder?: string | null;
    workspaceRoot?: string | null;
    workspaceCwd?: string | null;
    home?: string | null;
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
  | { kind: "new-agent-tab"; input: string; cwd: string | undefined; title: string }
  | {
      kind: "new-tab";
      placement: NewTabPlacement;
      input: string;
      cwd: string | undefined;
      title: string;
    };

const label = (action: Action) => action.name.trim() || "Action";

// Two folders are the tab's one when the canonical strings match: separators folded to
// forward slashes, no trailing separator, and (Windows folders being case-insensitive on
// disk) case only folded there. A symlinked folder that the shell cwd resolves elsewhere
// reads as a different folder and just opens a new tab, which is the safe side.
const equalFolder = (a: string | undefined, b: string | undefined): boolean => {
  if (!a || !b) return a === b;
  const norm = (p: string) => {
    let q = p.replace(/\\/g, "/").replace(/\/+$/, "");
    if (IS_WINDOWS || /^\\\\/.test(p)) q = q.toLowerCase();
    return q;
  };
  return norm(a) === norm(b);
};

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
  if (commandVariablesUsed(action.command).size === 0 && !ctx.vars.workspace) return blocked(action, WORKSPACE_UNSET);
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
  if (commandVariablesUsed(action.command).size === 0 && needsWorkspaceRoot(action) && !ctx.vars.workspace) {
    return blocked(action, WORKSPACE_UNSET);
  }
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
    home: ctx.folders.home,
  });
  const cwdIssue = cwd ? scriptCwdProblem(cwd) : null;
  if (cwdIssue) return blocked(action, cwdIssue);
  let input: string;
  try {
    input = `${expandCommandShell(action.command, ctx.vars, ctx.shell)}\r`;
  } catch (e) {
    return blocked(action, expandFailure(e));
  }
  // A reused tab already sits in its own folder, so the command can only be typed there
  // when the folder it would get is the one the tab has; otherwise the terminal is born
  // in the folder, with no `cd` line typed at all.
  const sameFolder = link?.exists && equalFolder(link.cwd, cwd);
  if (sameFolder && link.terminal && !link.foreignCommand) {
    return { kind: "reuse-tab", tabId: link.tabId, input };
  }
  return { kind: "new-tab", placement: newTabPlacement(ctx), input, cwd, title: label(action) };
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

// An agent is typed verbatim: braces are literal, so no template is read. Every click is a
// new tab, so no link, running mark or earlier tab is looked at either.
function planAgent(action: Action, ctx: RunContext): RunPlan {
  if (CONTROL.test(action.command)) return blocked(action, "the command has a control character");
  if (action.cwdMode === "workspace" && !ctx.folders.workspaceRoot?.trim()) return blocked(action, WORKSPACE_UNSET);
  const cwd = resolveScriptCwd({
    mode: action.cwdMode,
    fixedFolder: action.cwd,
    focusFolder: ctx.folders.focusFolder,
    workspaceRoot: ctx.folders.workspaceRoot,
    workspaceCwd: ctx.folders.workspaceCwd,
    home: ctx.folders.home,
  });
  const cwdIssue = cwd ? scriptCwdProblem(cwd) : null;
  if (cwdIssue) return blocked(action, cwdIssue);
  return { kind: "new-agent-tab", input: `${action.command}\r`, cwd, title: label(action) };
}

/**
 * What running an Action does. A script reuses the tab it last ran in only while that tab is
 * a terminal with nothing running in it; otherwise it gets a new one, so a busy or vanished
 * tab never keeps it from running. An app is spawned and needs no tab.
 */
export function planActionRun(action: Action, ctx: RunContext): RunPlan {
  if (ctx.hibernated) return { kind: "blocked", reason: "", silent: true };
  if (action.command.trim() === "") return blocked(action, "it has no command");
  if (isAgent(action)) return planAgent(action, ctx);
  return isScript(action) ? planScript(action, ctx) : planApp(action, ctx);
}

export type StopPlan =
  | { kind: "none" }
  | {
      kind: "stop";
      tabId: string;
      mark: ScriptState | false;
      /** "type" types Ctrl+C (the first stop of a run); "signal" SIGTERMs the tab's tree. */
      stage: "type" | "signal";
    };

/**
 * Stop is manual in two stages, no timers: the first click on a running script types
 * Ctrl+C; a click on the still-running (the mark became "waiting") script signals the
 * whole tree, which the failed Ctrl+C could not reach either way. No mark, nothing to
 * do; whatever the user started in that tab since (vim, another dev server) is not ours.
 */
export function planActionStop(
  link: { tabId: string; exists: boolean; mark: ScriptState | undefined; commandSeen: boolean } | null,
): StopPlan {
  if (!link?.exists || !link.mark) return { kind: "none" };
  return {
    kind: "stop",
    tabId: link.tabId,
    mark: planScriptStop(link.commandSeen),
    stage: link.mark === "waiting" ? "signal" : "type",
  };
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
