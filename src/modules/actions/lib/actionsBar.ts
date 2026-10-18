import type { ScriptState } from "@/modules/workspaces/lib/terminalEphemeralStore";
import { partitionForHeader } from "./actions";
import { commandProblem, missingVariables, unsafeVariables, type CommandShell } from "./commandTemplate";
import type { Action } from "./types";

export const COMPACT_WIDTH = 720;

// Below this header width the own buttons give way to the two menus, so the bar never
// pushes the search box and the window controls out.
export function isCompactBar(headerWidth: number): boolean {
  return headerWidth < COMPACT_WIDTH;
}

export type BarContext = { vars: Readonly<Record<string, string>>; shell: CommandShell };

const NEEDS: Record<string, string> = {
  path: "an open file",
  file: "an open file",
  workspace: "a workspace root",
  cwd: "a folder",
  dir: "a folder",
  branch: "a git branch",
  repo: "a git repository",
};

// The words for what an Action still lacks; a variable with no friendly name is quoted.
export function describeMissing(names: readonly string[]): string {
  const unknown = names.filter((n) => !(n in NEEDS));
  if (unknown.length > 0 && unknown.length === names.length) {
    return `${unknown.map((n) => `{${n}}`).join(", ")} ${unknown.length > 1 ? "have" : "has"} no value here`;
  }
  const needs = [...new Set(names.filter((n) => n in NEEDS).map((n) => NEEDS[n]))];
  return `needs ${needs.join(" and ")}`;
}

const VARIABLE = /\{[?!]?[a-z]/;

// Why an Action cannot run right now, or null when it can. Scripts are typed into a
// terminal, so a value that cannot be quoted safely also blocks them; an app is spawned
// without a shell and never is.
export function actionAvailability(action: Action, ctx: BarContext | null): string | null {
  if (action.command.trim() === "") return "it has no command";
  if (!ctx) return VARIABLE.test(action.command) ? "needs a workspace" : null;
  const problem = commandProblem(action.command, action.runInTerminal ? ctx.shell : undefined);
  if (problem) return problem;
  const missing = missingVariables(action.command, ctx.vars);
  if (missing.length > 0) return describeMissing(missing);
  if (action.runInTerminal) {
    const unsafe = unsafeVariables(action.command, ctx.vars, ctx.shell);
    if (unsafe.length > 0) return `${unsafe.map((n) => `{${n}}`).join(", ")} holds characters that are unsafe to type into a terminal`;
  }
  return null;
}

export type BarItem = {
  id: string;
  name: string;
  action: Action;
  state: ScriptState | "idle";
  active: boolean;
  /** Only scripts that are running can be stopped; apps never. */
  stoppable: boolean;
  disabledReason: string | null;
};

export type BarModel = {
  buttons: BarItem[];
  scripts: BarItem[];
  apps: BarItem[];
  empty: boolean;
};

type BuildInput = {
  actions: readonly Action[];
  context: BarContext | null;
  states: ReadonlyMap<string, ScriptState>;
  activeId: string | undefined;
  compact: boolean;
};

// Own buttons first in the user's order (scripts and apps mixed), then the two grouped
// menus. A running script is never disabled whatever its variables are now: it has to stay
// stoppable.
export function buildActionsBarModel({ actions, context, states, activeId, compact }: BuildInput): BarModel {
  const toItem = (action: Action): BarItem => {
    const state = action.runInTerminal ? (states.get(action.id) ?? "idle") : "idle";
    const running = state === "running";
    return {
      id: action.id,
      name: action.name.trim() || "Action",
      action,
      state,
      active: action.id === activeId,
      stoppable: running,
      disabledReason: running ? null : actionAvailability(action, context),
    };
  };
  const parts = partitionForHeader(actions);
  if (compact) {
    const asScript = (a: Action) => a.runInTerminal;
    const scripts = actions.filter((a) => asScript(a)).map(toItem);
    const apps = actions.filter((a) => !asScript(a)).map(toItem);
    return { buttons: [], scripts, apps, empty: actions.length === 0 };
  }
  return {
    buttons: parts.ownButtons.map(toItem),
    scripts: parts.scripts.map(toItem),
    apps: parts.apps.map(toItem),
    empty: actions.length === 0,
  };
}
