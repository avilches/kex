import type { ScriptState } from "@/modules/workspaces/lib/terminalEphemeralStore";
import { splitActionName } from "./actionName";
import { commandProblem, missingVariables, unsafeVariables, type CommandShell } from "./commandTemplate";
import type { Action } from "./types";

export const COMPACT_WIDTH = 720;

// Below this header width the search box shrinks to an icon.
export function isCompactBar(headerWidth: number): boolean {
  return headerWidth < COMPACT_WIDTH;
}

// Estimated pixel widths of the bar, close enough to decide what fits without measuring each
// button: the label is capped at 120 px (max-w-[120px]), a character is about 6 px at 11 px
// font, and every button has its padding; a script adds its 22 px run zone.
export const BAR_GAP = 8;
const PADDING = 14;
const CHAR_WIDTH = 6;
const LABEL_CAP = 120;
const RUN_ZONE = 24;
const ICON = 18;
// The width fits the main name only: the variable line fronts underneath it, past the cap.
export const MENUS_RESERVE = 2 * 78 + BAR_GAP;

export function ownButtonWidth(action: Pick<Action, "name" | "runInTerminal">): number {
  const { main } = splitActionName(action.name.trim() || "Action");
  const label = Math.min(LABEL_CAP, main.length * CHAR_WIDTH);
  return PADDING + label + (action.runInTerminal ? RUN_ZONE : ICON);
}

// How many of the own buttons, taken in the user's order, fit in the room the bar has. The
// rest fold into the menus, so the bar never pushes the search box and the window controls out.
export function ownButtonsThatFit(actions: readonly Pick<Action, "name" | "runInTerminal">[], room: number): number {
  let left = Math.floor(room) - MENUS_RESERVE;
  let shown = 0;
  for (const action of actions) {
    left -= ownButtonWidth(action) + BAR_GAP;
    if (left < 0) break;
    shown += 1;
  }
  return shown;
}

export type BarContext = {
  vars: Readonly<Record<string, string>>;
  shell: CommandShell;
  /** The workspace is asleep: nothing can run until it wakes. */
  hibernated?: boolean;
};

const NEEDS: Record<string, string> = {
  filepath: "an open file",
  filename: "an open file",
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
  if (ctx?.hibernated) return "workspace is hibernated";
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
  /** The global Actions of the workspace scope live in Settings and run everywhere. */
  scriptsGlobal: BarItem[];
  appsGlobal: BarItem[];
  empty: boolean;
};

type BuildInput = {
  local: readonly Action[];
  global?: readonly Action[];
  context: BarContext | null;
  states: ReadonlyMap<string, ScriptState>;
  activeId: string | undefined;
  /** How many own buttons are shown; the rest fold into the menus. Absent: all of them. */
  ownButtonsShown?: number;
};

// Own buttons first in the user's order (workspace Actions, then global, scripts and apps
// mixed), then the two grouped menus. A running script is never disabled whatever its
// variables are now: it has to stay stoppable.
export function buildActionsBarModel({ local, global = [], context, states, activeId, ownButtonsShown }: BuildInput): BarModel {
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
  const limit = ownButtonsShown ?? Number.POSITIVE_INFINITY;
  const model: BarModel = { buttons: [], scripts: [], apps: [], scriptsGlobal: [], appsGlobal: [], empty: local.length + global.length === 0 };
  for (const [position, action] of [...local, ...global].entries()) {
    const item = toItem(action);
    const isGlobal = position >= local.length;
    if (action.ownButton && model.buttons.length < limit) {
      model.buttons.push(item);
      continue;
    }
    if (isGlobal) (action.runInTerminal ? model.scriptsGlobal : model.appsGlobal).push(item);
    else (action.runInTerminal ? model.scripts : model.apps).push(item);
  }
  return model;
}

export type MenuEntry = { kind: "main" | "stop"; enabled: boolean };

// The rows a menu draws for one item. The main row focuses or runs it; a script that is
// running or stopping also gets a Stop row of its own, because the stop control inside the
// main row is a nested button that the arrow keys of the menu never reach. A blocked Action
// has a disabled row, but a running script never does, so it can always be focused.
export function menuEntries(item: BarItem): MenuEntry[] {
  const waiting = item.state === "waiting";
  const busy = item.state !== "idle";
  const main: MenuEntry = { kind: "main", enabled: !waiting && (busy || item.disabledReason === null) };
  if (!item.action.runInTerminal || !busy) return [main];
  return [main, { kind: "stop", enabled: item.stoppable }];
}
