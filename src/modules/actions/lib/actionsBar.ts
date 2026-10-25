import { folderKey, resolveScriptCwd, type ScriptCwdInput } from "@/modules/workspaces/lib/scriptCwd";
import type { ScriptState } from "@/modules/workspaces/lib/terminalEphemeralStore";
import { splitActionName } from "./actionName";
import { commandProblem, commandVariablesUsed, expandCommandArgv, expandCommandShell, missingVariables, unsafeVariables, type CommandShell } from "./commandTemplate";
import { isAgent, isApp, isScript, usesTerminal, type Action, type ActionKind } from "./types";

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
export const MENUS_RESERVE = 78;

export function ownButtonWidth(action: Pick<Action, "name" | "kind">, iconOnly = false): number {
  if (iconOnly) return PADDING + ICON;
  const { main } = splitActionName(action.name.trim() || "Action");
  const label = Math.min(LABEL_CAP, main.length * CHAR_WIDTH);
  return PADDING + label + (isScript(action) ? RUN_ZONE : ICON);
}

// Only a script has a running state: an agent opens a new tab per click and keeps no link.
export function stateOf(action: Action, states: ReadonlyMap<string, ScriptState> | undefined): ScriptState | "idle" {
  return isScript(action) ? (states?.get(action.id) ?? "idle") : "idle";
}

// Whether the bar renders this Action where the user is: hidden ones take no room,
// so they must not consume a slot of the fold either. An agent has no template, so its
// target is the workspace and it shows everywhere.
export function shownAtPlace(
  action: Action,
  state: ScriptState | "idle",
  place: FocusPlace | undefined,
): boolean {
  return !place || state !== "idle" || isAgent(action) || actionShownAt(actionTarget(action.command), place);
}

// How many of the own buttons, taken in the user's order, fit in the room the bar has. The
// rest fold into the menus, so the bar never pushes the search box and the window controls out.
// Count only the buttons the place actually renders: an Action hidden by its target
// (a file Action with a terminal focused, say) must not keep a visible one out.
export function ownButtonsThatFit(
  actions: readonly Action[],
  room: number,
  place?: FocusPlace,
  states?: ReadonlyMap<string, ScriptState>,
  hidden?: ReadonlySet<string>,
): number {
  let left = Math.floor(room) - MENUS_RESERVE;
  let shown = 0;
  const sole = soleIconButtons(actions);
  for (const action of actions) {
    if (hidden?.has(action.id) || !shownAtPlace(action, stateOf(action, states), place)) continue;
    left -= ownButtonWidth(action, sole.has(action.id)) + BAR_GAP;
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
  /** The vars are words for what a variable stands for, not values (Settings has no tab). */
  labels?: boolean;
  /** The folders the runner picks a start folder from, so the bar names the same one. */
  folders?: Omit<ScriptCwdInput, "mode" | "fixedFolder">;
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

// What an Action binds to, read from the variables its command uses: the file it opens,
// the folder it runs in, or nothing local, so it is a matter of the workspace alone. One
// Action has one target: a command using {filepath} and {workspace} is a file Action.
export type ActionTarget = "file" | "folder" | "workspace";

const FOLDER_VARS = new Set(["cwd", "dir", "branch", "repo"]);

export function actionTarget(command: string): ActionTarget {
  const used = commandVariablesUsed(command);
  if (used.has("filepath") || used.has("filename")) return "file";
  for (const name of used) if (FOLDER_VARS.has(name)) return "folder";
  return "workspace";
}

// Where a command is offered: file Actions need a file (an editor or a file row), folder
// Actions a terminal or a folder row, and workspace Actions are Header-only, never bound
// to any row or tab.
export type FocusPlace = { file: boolean; folder: boolean };

export function actionShownAt(target: ActionTarget, place: FocusPlace | "all"): boolean {
  if (place === "all") return true;
  return target === "file" ? place.file : target === "folder" ? place.folder : true;
}

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

export const WORKSPACE_UNSET = "Set a root to this workspace";

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
// Bidi overrides and isolates would make the command shown in Settings differ from what is typed.
const BIDI = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/;

/** An agent command is typed verbatim as one line, so a control character (a newline too) refuses it. */
export function agentCommandProblem(command: string): string | null {
  if (CONTROL.test(command)) return "the command has a control character";
  if (BIDI.test(command)) return "the command has a text direction character";
  return null;
}

// Settings has no focused tab to read values from, so under an app name and on its hover it
// says what the variable stands for in words. The bar never uses this: it shows real values.
export const SETTINGS_LABELS: BarContext = {
  vars: {
    cwd: "Current Directory",
    dir: "Current Directory",
    filepath: "Current File",
    filename: "Current File",
    workspace: "Workspace",
  },
  shell: "posix",
  labels: true,
};

export type ActionSubtitle = {
  /** The line under the name; null leaves the name lineless. */
  text: string | null;
  /** True when the value is a path rendered with its start cut instead of its tail. */
  startTrim: boolean;
};

// The line under the name says what the Action points at in words, not the raw template:
// a workspace Action shows its root like a folder one (Settings, with no real values, says
// "Workspace"), a file Action the file name alone, a folder path its value with the start cut. A variable with
// no readable part keeps the template; a workspace one without a root says so.
export function actionSubtitle(name: string, ctx: BarContext | null): ActionSubtitle {
  const { variable } = splitActionName(name);
  if (!variable) return { text: null, startTrim: false };
  const varName = variable.slice(1, -1);
  const value = ctx?.vars[varName];
  if (varName === "workspace") {
    if (!value) return { text: WORKSPACE_UNSET, startTrim: false };
    return ctx?.labels ? { text: value, startTrim: false } : { text: value, startTrim: true };
  }
  if (value && (varName === "filepath" || varName === "filename")) {
    return { text: value.split(/[\\/]/).filter(Boolean).pop() ?? value, startTrim: false };
  }
  if (value) return { text: value, startTrim: varName === "cwd" };
  return { text: variable, startTrim: false };
}

// A script with no variable in its name says where it runs: the workspace, the last folder
// of a terminal or editor, or its fixed folder. The name's variable, when it has one, still
// wins because that is what the Action points at.
export function scriptSubtitle(action: Pick<Action, "name" | "kind" | "cwdMode" | "cwd">, ctx: BarContext | null): ActionSubtitle {
  if (isAgent(action)) return agentSubtitle(action, ctx);
  const named = actionSubtitle(action.name, ctx);
  if (!isScript(action) || named.text !== null) return named;
  const mode = action.cwdMode ?? "home";
  if (mode === "home") return { text: "Home", startTrim: false };
  if (mode === "fixed") {
    return action.cwd ? { text: action.cwd, startTrim: true } : { text: null, startTrim: false };
  }
  if (mode === "context") {
    const cwd = ctx && !ctx.labels ? ctx.vars.cwd : "";
    return cwd ? { text: cwd, startTrim: true } : { text: "Current folder", startTrim: false };
  }
  return { text: ctx && !ctx.vars.workspace ? WORKSPACE_UNSET : "Workspace", startTrim: false };
}

// An agent has no template, so its name has no variable: the line always says the folder it
// starts in, the real one in the bar and the words for it in Settings.
function agentSubtitle(action: Pick<Action, "cwdMode" | "cwd">, ctx: BarContext | null): ActionSubtitle {
  const mode = action.cwdMode ?? "home";
  const real = ctx && !ctx.labels ? ctx : null;
  const fixed = action.cwd?.trim() || undefined;
  if (mode === "home") return { text: "Home", startTrim: false };
  if (mode === "fixed" && fixed) return { text: fixed, startTrim: true };
  if (mode === "workspace" && ctx && !ctx.vars.workspace) return { text: WORKSPACE_UNSET, startTrim: false };
  // A fixed mode with no folder runs in the workspace folder, as resolveScriptCwd does.
  if (!real) return { text: mode === "context" ? "Current directory" : "Workspace", startTrim: false };
  const start = real.folders
    ? resolveScriptCwd({ mode, fixedFolder: fixed, ...real.folders })
    : mode === "context"
      ? real.vars.cwd
      : real.vars.workspace;
  return start ? { text: start, startTrim: true } : { text: null, startTrim: false };
}

// An agent has nothing to open: its hover says it runs, or why it cannot.
function agentTitle(label: string, disabledReason: string | null): string {
  return disabledReason ? `${label}: ${disabledReason}` : `Run ${label}`;
}

// The hover words of a row: the Open (or Run) and the place, with the root or folder spelled
// out in full for the workspace and folder targets and the file name alone for file targets.
// A blocked row keeps its reason; a variable with no value here has nothing to add.
export function actionRowTitle(
  name: string,
  terminal: boolean,
  disabledReason: string | null,
  ctx: BarContext | null,
): string | null {
  const { main, variable } = splitActionName(name);
  if (disabledReason) return `${main}: ${disabledReason}`;
  if (!variable) return null;
  const varName = variable.slice(1, -1);
  const verb = terminal ? "Run" : "Open";
  const value = ctx?.vars[varName] ?? "";
  if (!value) return null;
  if (varName === "filepath" || varName === "filename") return `${verb} ${value.split(/[\\/]/).filter(Boolean).pop() ?? value} with ${main}`;
  if (varName === "workspace" || varName === "cwd" || varName === "dir") return `${verb} ${main} in ${value}`;
  return null;
}

// A command with no variables runs against the workspace root: an app is spawned from it, and a
// script only when it was told to run there. A script in Home, in the tab's folder or in a
// fixed folder never needs the root.
export function needsWorkspaceRoot(action: Pick<Action, "kind" | "cwdMode">): boolean {
  return isApp(action) || action.cwdMode === "workspace";
}

// Why an Action cannot run right now, or null when it can. Scripts are typed into a
// terminal, so a value that cannot be quoted safely also blocks them; an app is spawned
// without a shell and never is. A command with no variables runs in the workspace itself,
// so a missing root blocks it too, with the words the row shows for that case.
export function actionAvailability(action: Action, ctx: BarContext | null): string | null {
  if (action.command.trim() === "") return "it has no command";
  if (ctx?.hibernated) return "workspace is hibernated";
  if (isAgent(action)) {
    const problem = agentCommandProblem(action.command);
    if (problem) return problem;
    return ctx && action.cwdMode === "workspace" && !ctx.vars.workspace ? WORKSPACE_UNSET : null;
  }
  if (!ctx) return VARIABLE.test(action.command) ? "needs a workspace" : null;
  const used = commandVariablesUsed(action.command);
  if (used.size === 0 && needsWorkspaceRoot(action) && !ctx.vars.workspace) return WORKSPACE_UNSET;
  const problem = commandProblem(action.command, usesTerminal(action) ? ctx.shell : undefined);
  if (problem) return problem;
  const missing = missingVariables(action.command, ctx.vars);
  if (missing.includes("workspace")) return WORKSPACE_UNSET;
  if (missing.length > 0) return describeMissing(missing);
  if (usesTerminal(action)) {
    const unsafe = unsafeVariables(action.command, ctx.vars, ctx.shell);
    if (unsafe.length > 0) return `${unsafe.map((n) => `{${n}}`).join(", ")} holds characters that are unsafe to type into a terminal`;
  }
  return null;
}

const DYNAMIC_VARS = ["cwd", "dir", "branch", "repo"];

// What running the Action here would do: its kind, the command it ends up with and the
// folder it starts in. Null when that cannot be told (a variable with no value, a command
// that does not expand), so such an Action is never compared.
function effectKey(action: Action, ctx: BarContext): string | null {
  const folders = ctx.folders ?? {};
  try {
    if (isApp(action)) {
      if (missingVariables(action.command, ctx.vars).length > 0) return null;
      const spawn = folders.workspaceRoot?.trim() || folders.workspaceCwd;
      return JSON.stringify([action.kind, expandCommandArgv(action.command, ctx.vars), folderKey(spawn)]);
    }
    const start = folderKey(resolveScriptCwd({ mode: action.cwdMode, fixedFolder: action.cwd, ...folders }));
    if (isAgent(action)) return JSON.stringify([action.kind, action.command, start]);
    if (missingVariables(action.command, ctx.vars).length > 0) return null;
    return JSON.stringify([action.kind, expandCommandShell(action.command, ctx.vars, ctx.shell), start]);
  } catch {
    return null;
  }
}

// Twins: Actions that depend on the focused tab and would do exactly what another one does
// right now (an agent in the workspace folder and the same agent in the current folder, with
// the focus at the root). The bar hides them so the same effect is not offered twice. With
// the same effect, a button beats a menu entry; with the same placement, a static Action
// beats a dynamic one, and two of the same sort are the user's own doing, so both stay. A
// script that is not idle is never hidden, and a blocked Action neither hides nor survives.
// Nothing is hidden without a real context, or while the workspace sleeps.
export function twinIds(
  actions: readonly Action[],
  ctx: BarContext | null,
  states: ReadonlyMap<string, ScriptState>,
  place?: FocusPlace,
): Set<string> {
  const hidden = new Set<string>();
  if (!ctx || ctx.labels || ctx.hibernated) return hidden;
  const groups = new Map<string, { action: Action; dynamic: boolean; idle: boolean }[]>();
  for (const action of actions) {
    const state = stateOf(action, states);
    if (state === "idle" && actionAvailability(action, ctx) !== null) continue;
    if (!shownAtPlace(action, state, place)) continue;
    const key = effectKey(action, ctx);
    if (!key) continue;
    const used = commandVariablesUsed(action.command);
    const dynamic = (!isAgent(action) && DYNAMIC_VARS.some((v) => used.has(v))) || action.cwdMode === "context";
    const group = groups.get(key) ?? [];
    group.push({ action, dynamic, idle: state === "idle" });
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    let kept = group;
    if (new Set(group.map((c) => !!c.action.ownButton)).size > 1) {
      for (const c of group) if (!c.action.ownButton && c.idle) hidden.add(c.action.id);
      kept = group.filter((c) => !hidden.has(c.action.id));
    }
    if (kept.some((c) => !c.dynamic)) {
      for (const c of kept) if (c.dynamic && c.idle) hidden.add(c.action.id);
    }
  }
  return hidden;
}

export type BarItem = {
  id: string;
  /** The Action belongs to the global scope rather than the workspace. */
  global: boolean;
  name: string;
  action: Action;
  state: ScriptState | "idle";
  active: boolean;
  /** The zone can stop it: running, or already stopping by the first Ctrl+C. */
  stoppable: boolean;
  disabledReason: string | null;
  /** The line under the name: what the Action points at in this place. */
  subtitle: string | null;
  /** The subtitle is a path a long value renders with its start cut. */
  subtitleTrim: boolean;
  /** The hover words of the row, or null to say nothing. */
  title: string | null;
  /** An own button drawn as its app icon alone. */
  iconOnly: boolean;
};

// Agents, then scripts, then apps, everywhere an Action list is shown: the Header, its menu, the
// Add combo and Settings. In a narrow bar the last kind is the first to fold into the menu.
export const KIND_ORDER: readonly ActionKind[] = ["agent", "script", "app"];

// Each kind keeps the user's order inside it, so the kinds never interleave.
export function byKind<T extends Pick<Action, "kind">>(actions: readonly T[]): T[] {
  return KIND_ORDER.flatMap((kind) => actions.filter((a) => a.kind === kind));
}

// The own buttons the bar may draw, in order: those the place shows. Each list comes already
// in bar order, the workspace one before the global one.
export function ownButtonCandidates(
  local: readonly Action[],
  global: readonly Action[],
  states: ReadonlyMap<string, ScriptState>,
  place: FocusPlace | undefined,
  hidden?: ReadonlySet<string>,
): Action[] {
  return [...local, ...global].filter(
    (action) =>
      action.ownButton &&
      !hidden?.has(action.id) &&
      shownAtPlace(action, stateOf(action, states), place),
  );
}

// A button of a detected app or agent that is the only one of it in the bar needs no words:
// its icon says which one it is. With several of the same, the name and the line under it
// tell them apart. Apps and agents count apart; the result is the ids drawn icon-only.
export function soleIconButtons(buttons: readonly Pick<Action, "id" | "appId" | "kind">[]): Set<string> {
  const keyOf = (a: Pick<Action, "appId" | "kind">) => ((isApp(a) || isAgent(a)) && a.appId ? `${a.kind}:${a.appId}` : null);
  const count = new Map<string, number>();
  for (const a of buttons) {
    const key = keyOf(a);
    if (key) count.set(key, (count.get(key) ?? 0) + 1);
  }
  return new Set(buttons.filter((a) => count.get(keyOf(a) ?? "") === 1).map((a) => a.id));
}

export const MENU_DRAG_PREFIX = "menu:";
export const DROP_MENU = "zone:menu";
export const DROP_MENU_PREFIX = "mzone:";
export const DROP_MENU_WORKSPACE = "mzone:workspace";
export const DROP_MENU_GLOBAL = "mzone:global";

type Scope = "workspace" | "global";

// The bar has one zone per scope and kind: apps, agents and scripts of the workspace, and
// the same of the global scope. Each one takes only its own kind.
export const barZoneId = (scope: Scope, kind: ActionKind) => `zone:${scope}:${kind}s`;

export function parseBarZone(id: string): { scope: Scope; kind: ActionKind } | null {
  const m = /^zone:(workspace|global):(app|agent|script)s$/.exec(id);
  return m ? { scope: m[1] as Scope, kind: m[2] as ActionKind } : null;
}

type Placed = Pick<BarItem, "id" | "global" | "action">;

// Where a dragged Action ends up: its scope, whether it is a bar button, and its place. Inside
// one list (bar to bar, menu to menu, same scope) it takes the place of the Action it lands
// on (`reorderOver`, as a reorder does). Across lists or scopes it goes before `placeBefore`,
// last for null, and where it falls when absent.
export type Drop = {
  id: string;
  from: Scope;
  to: Scope;
  wasButton: boolean;
  button: boolean;
  reorderOver?: string;
  placeBefore?: string | null;
};

const sameKind = (a: Placed, b: Placed) => a.action.kind === b.action.kind;

// What dropping `activeId` (a bar button, or a menu row prefixed with MENU_DRAG_PREFIX) on
// `overId` does. A button or the frame of the bar makes it a button of that scope; a row or
// the frame of the menu makes it a menu entry of that scope; the menu trigger hides a button
// in its own scope, and is no target for a row, which already lives there. Apps and scripts
// are drawn apart, so on landing among Actions of its own kind it takes a place there (`after`
// says the pointer is past the middle of the one it lands on), and on a row of the other kind
// of a menu section that has some of its own kind it goes nowhere; a section with none of its
// kind takes it anywhere, and it goes last.
export function resolveDrop(
  buttons: readonly Placed[],
  menuItems: readonly Placed[],
  activeId: string,
  overId: string,
  after = false,
): Drop | null {
  const fromMenu = activeId.startsWith(MENU_DRAG_PREFIX);
  const id = fromMenu ? activeId.slice(MENU_DRAG_PREFIX.length) : activeId;
  const from = (fromMenu ? menuItems : buttons).find((i) => i.id === id);
  if (!from || activeId === overId) return null;
  const scopeOf = (global: boolean): Scope => (global ? "global" : "workspace");
  const fromScope = scopeOf(from.global);
  let to: Scope;
  let button: boolean;
  let over: Placed | undefined;
  let list: readonly Placed[] = [];
  if (overId === DROP_MENU) {
    if (fromMenu) return null;
    to = fromScope;
    button = false;
  } else if (parseBarZone(overId)) {
    const zone = parseBarZone(overId)!;
    if (zone.kind !== from.action.kind) return null;
    to = zone.scope;
    button = true;
  } else if (overId === DROP_MENU_WORKSPACE || overId === DROP_MENU_GLOBAL) {
    to = overId === DROP_MENU_GLOBAL ? "global" : "workspace";
    button = false;
  } else if (overId.startsWith(MENU_DRAG_PREFIX)) {
    over = menuItems.find((i) => i.id === overId.slice(MENU_DRAG_PREFIX.length));
    if (!over) return null;
    to = scopeOf(over.global);
    button = false;
    list = menuItems;
  } else {
    over = buttons.find((i) => i.id === overId);
    if (!over) return null;
    to = scopeOf(over.global);
    button = true;
    list = buttons;
  }
  const wasButton = !fromMenu;
  let reorderOver: string | undefined;
  let placeBefore: string | null | undefined;
  if (over && over.id !== from.id) {
    const peers = list.filter((i) => scopeOf(i.global) === to && sameKind(i, from) && i.id !== from.id);
    if (sameKind(over, from)) {
      if (to === fromScope && wasButton === button) reorderOver = over.id;
      else {
        const next = peers[peers.findIndex((i) => i.id === over!.id) + 1];
        placeBefore = after ? (next?.id ?? null) : over.id;
      }
    } else if (peers.length > 0) {
      return null;
    }
  }
  if (to === fromScope && button === wasButton && !reorderOver) return null;
  return {
    id: from.id,
    from: fromScope,
    to,
    wasButton,
    button,
    ...(reorderOver ? { reorderOver } : {}),
    ...(placeBefore !== undefined ? { placeBefore } : {}),
  };
}

export type BarModel = {
  buttons: BarItem[];
  /** The Actions that are not own buttons, apps, agents and scripts in that order: the workspace
   * ones first, then the global ones, each scope in the user's order. */
  menu: { workspace: BarItem[]; global: BarItem[] };
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
  /** What the focused tab is: file Actions show on a file, folder Actions on a terminal,
   * workspace Actions always. Absent: every Action shows (nothing depends on a place). */
  place?: FocusPlace;
  /** Twin Actions to leave out (`twinIds`); absent: worked out from the other inputs. */
  hidden?: ReadonlySet<string>;
};

// Own buttons first (workspace Actions, then global, each by kind in the user's order),
// then the one menu for the rest: workspace Actions, then global, again in the
// user's order. A running script is never disabled whatever its variables are now: it has
// to stay stoppable, and it stays visible whatever the focused tab is, so its Stop keeps a
// place to live.
export function buildActionsBarModel({ local, global = [], context, states, activeId, ownButtonsShown, place, hidden }: BuildInput): BarModel {
  const toItem = (action: Action, isGlobal: boolean): BarItem => {
    const state = stateOf(action, states);
    const running = state === "running";
    const label = action.name.trim() || "Action";
    const subtitle = scriptSubtitle({ ...action, name: label }, context);
    const disabledReason = running ? null : actionAvailability(action, context);
    return {
      id: action.id,
      global: isGlobal,
      name: label,
      action,
      state,
      active: action.id === activeId,
      stoppable: state !== "idle",
      disabledReason,
      subtitle: subtitle.text,
      subtitleTrim: subtitle.startTrim,
      title: isAgent(action) ? agentTitle(label, disabledReason) : actionRowTitle(label, isScript(action), disabledReason, context),
      iconOnly: false,
    };
  };
  const twins = hidden ?? twinIds([...local, ...global], context, states, place);
  const limit = ownButtonsShown ?? Number.POSITIVE_INFINITY;
  const ordered = [...byKind(local).map((a) => [a, false] as const), ...byKind(global).map((a) => [a, true] as const)];
  const model: BarModel = {
    buttons: [],
    menu: { workspace: [], global: [] },
    empty: local.length + global.length === 0,
  };
  const buttonIds = new Set(
    ownButtonCandidates(byKind(local), byKind(global), states, place, twins)
      .slice(0, limit)
      .map((a) => a.id),
  );
  for (const [action, isGlobal] of ordered) {
    if (twins.has(action.id)) continue;
    const item = toItem(action, isGlobal);
    if (!shownAtPlace(action, item.state, place)) continue;
    if (buttonIds.has(action.id)) model.buttons.push(item);
    else if (isGlobal) model.menu.global.push(item);
    else model.menu.workspace.push(item);
  }
  const sole = soleIconButtons(model.buttons.map((b) => b.action));
  for (const b of model.buttons) b.iconOnly = sole.has(b.action.id);
  return model;
}

export type MenuEntry = { kind: "main" | "stop"; enabled: boolean };

// The rows a menu draws for one item. The main row focuses or runs it. A blocked Action
// has a disabled row, but a running script never does, so it can be brought into view; a
// waiting one stays enabled too, because the row click focuses its tab and does not
// restart it. The start or stop control of the row is outside the item, so the row never
// needs a second entry.
export function menuEntries(item: BarItem): MenuEntry[] {
  const waiting = item.state === "waiting";
  const main: MenuEntry = { kind: "main", enabled: waiting || item.state === "running" || item.disabledReason === null };
  return [main];
}

// What the command palette lists: the Actions the Header offers here, runnable ones only. A
// blocked Action is left out instead of muted, and a script already running stays so it can
// be shown or stopped.
export function paletteActions(model: Pick<BarModel, "buttons" | "menu">): BarItem[] {
  return [...model.buttons, ...model.menu.workspace, ...model.menu.global].filter(
    (i) => i.disabledReason === null || i.stoppable,
  );
}
