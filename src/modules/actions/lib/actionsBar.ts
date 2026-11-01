import type { ScriptCwdInput } from "@/modules/workspaces/lib/scriptCwd";
import type { ScriptState } from "@/modules/workspaces/lib/terminalEphemeralStore";
import { splitActionName } from "./actionName";
import { comboCandidate, inBar, inCombo, type FocusPlace } from "./actionTargets";
export { actionTarget, type ActionTarget, type FocusPlace } from "./actionTargets";
import { commandProblem, commandVariablesUsed, missingVariables, unsafeVariables, type CommandShell } from "./commandTemplate";
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
// The context combo: its icon, a name capped at about 100 px and the chevron.
export const CONTEXT_RESERVE = 140;

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

// Whether the Header bar (own buttons and the Actions menu) carries this Action. The bar is
// the same whatever tab is focused, so it only holds what does not depend on the tab: agents
// (their target is the workspace) and workspace Actions. A folder or file Action lives in the
// context combo instead, except a script that is not idle, which stays so it can be stopped.
export function onBar(action: Action, state: ScriptState | "idle"): boolean {
  return state !== "idle" || inBar(action);
}

// How many of the own buttons, taken in the user's order, fit in the room the bar has once the
// menus have taken theirs; `reserve` is the room of the context combo. The rest fold into the
// menu, so the bar never pushes the search box and the window controls out.
export function ownButtonsThatFit(actions: readonly Action[], room: number, reserve = 0): number {
  let left = Math.floor(room) - MENUS_RESERVE - reserve;
  let shown = 0;
  const sole = soleIconButtons(actions);
  for (const action of actions) {
    left -= ownButtonWidth(action, sole.has(action.id)) + BAR_GAP;
    if (left < 0) break;
    shown += 1;
  }
  return shown;
}

export type BarContext = {
  vars: Readonly<Record<string, string>>;
  shell: CommandShell;
  /** The vars are words for what a variable stands for, not values (Settings has no tab). */
  labels?: boolean;
  /** What an app's {target} is in this context, set for the context combo; absent in the bar,
   * where it is the workspace root. */
  targetKind?: "file" | "folder";
  /** The folders the runner picks a start folder from, so the bar names the same one. */
  folders?: Omit<ScriptCwdInput, "mode" | "fixedFolder">;
};

const NEEDS: Record<string, string> = {
  filepath: "an open file",
  filename: "an open file",
  workspace: "a workspace root",
  target: "a workspace root",
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

export const WORKSPACE_UNSET = "A workspace root is needed";

/** A blocked Action whose only problem is the missing root. It stays clickable, because the way out
 * is one click away: the shell opens the Sidebar where the root is chosen. */
export function needsRootFix(disabledReason: string | null): boolean {
  return disabledReason === WORKSPACE_UNSET;
}

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
    cwd: "Current folder",
    dir: "Current folder",
    filepath: "Current file",
    filename: "Current file",
    workspace: "Workspace root",
  },
  shell: "posix",
  labels: true,
};

export type SubtitleLead = "root" | "home" | "tab" | "file";

export type ActionSubtitle = {
  /** The line under the name; null leaves the name lineless. */
  text: string | null;
  /** True when the value is a path rendered with its start cut instead of its tail. */
  startTrim: boolean;
  /** The icon drawn before the line: the workspace root pin, Home, the current tab's folder, or a file. */
  lead?: SubtitleLead;
};

// The line under the name says what the Action points at in words, not the raw template:
// a workspace Action shows its root like a folder one (Settings, with no real values, says
// "Workspace root"), a file Action the file name alone, a folder path its value with the start cut. A variable with
// no readable part keeps the template; a workspace one without a root says so.
export function actionSubtitle(name: string, ctx: BarContext | null): ActionSubtitle {
  const { variable } = splitActionName(name);
  if (!variable) return { text: null, startTrim: false };
  const varName = variable.slice(1, -1);
  const value = ctx?.vars[varName];
  if (varName === "workspace") {
    if (!value) return { text: WORKSPACE_UNSET, startTrim: false };
    return { text: value, startTrim: !ctx?.labels, lead: "root" };
  }
  if (value && (varName === "filepath" || varName === "filename")) {
    return { text: value.split(/[\\/]/).filter(Boolean).pop() ?? value, startTrim: false, lead: "file" };
  }
  if (value) return { text: value, startTrim: varName === "cwd", ...(varName === "cwd" ? { lead: "tab" as const } : {}) };
  return { text: variable, startTrim: false };
}

// A script with no variable in its name says where it runs: the workspace, the last folder
// of a terminal or editor, or its fixed folder. The name's variable, when it has one, still
// wins because that is what the Action points at.
export function scriptSubtitle(
  action: Pick<Action, "name" | "kind" | "cwdMode" | "cwd"> & Partial<Pick<Action, "command" | "accepts">>,
  ctx: BarContext | null,
): ActionSubtitle {
  // An agent has no folder of its own: the Header starts it in the workspace root, so its line is
  // the root itself, or the words for it in Settings.
  if (isAgent(action)) return workspaceLine(ctx);
  if (isApp(action)) return appSubtitle(ctx, action.accepts);
  const named = actionSubtitle(action.name, ctx);
  if (!isScript(action) || named.text !== null) return named;
  const mode = action.cwdMode ?? "home";
  if (mode === "home") return { text: "Home", startTrim: false, lead: "home" };
  if (mode === "fixed") {
    return action.cwd ? { text: action.cwd, startTrim: true } : { text: null, startTrim: false };
  }
  if (mode === "context") {
    const cwd = ctx && !ctx.labels ? ctx.vars.cwd : "";
    return cwd ? { text: cwd, startTrim: true, lead: "tab" } : { text: "Current folder", startTrim: false, lead: "tab" };
  }
  return workspaceLine(ctx);
}

// With no real place (Settings, arranging) an app says in words what it opens; a file-only one
// never opens the root.
function appWords(ctx: BarContext | null, accepts: Action["accepts"]): "file" | "folder" | "root" | null {
  if (ctx && !ctx.labels) return null;
  return ctx?.targetKind ?? (accepts === "file" ? "file" : "root");
}

// What an app opens where it is offered.
function appSubtitle(ctx: BarContext | null, accepts: Action["accepts"]): ActionSubtitle {
  const words = appWords(ctx, accepts);
  if (words === "file") return { text: "Current file", startTrim: false, lead: "file" };
  if (words === "folder") return { text: "Current folder", startTrim: false, lead: "tab" };
  if (words === "root") return { text: "Workspace root", startTrim: false, lead: "root" };
  if (!ctx) return workspaceLine(ctx);
  if (ctx.targetKind === "file") {
    const file = ctx.vars.target ?? "";
    return file ? { text: file.split(/[\\/]/).filter(Boolean).pop() ?? file, startTrim: false, lead: "file" } : { text: null, startTrim: false };
  }
  if (ctx.targetKind === "folder") {
    const folder = ctx.vars.target ?? "";
    return folder ? { text: folder, startTrim: true, lead: "tab" } : { text: null, startTrim: false };
  }
  return workspaceLine(ctx);
}

// Where a workspace-rooted Action starts: the root itself, or the words for it in Settings.
function workspaceLine(ctx: BarContext | null): ActionSubtitle {
  const root = ctx?.vars.workspace;
  if (ctx && !root) return { text: WORKSPACE_UNSET, startTrim: false };
  if (!ctx || ctx.labels) return { text: "Workspace root", startTrim: false, lead: "root" };
  return { text: root!, startTrim: true, lead: "root" };
}

// An agent has nothing to open: its hover says it runs, or why it cannot.
export function agentTitle(label: string, disabledReason: string | null): string {
  return disabledReason ? `${label}: ${disabledReason}` : `Run ${label}`;
}

// The hover of an app: what it opens, read from the context since its name has no variable.
export function appTitle(name: string, disabledReason: string | null, ctx: BarContext | null, accepts?: Action["accepts"]): string {
  const { main } = splitActionName(name);
  if (disabledReason) return `${main}: ${disabledReason}`;
  const words = appWords(ctx, accepts);
  if (words === "file") return `Open the current file with ${main}`;
  if (words === "folder") return `Open ${main} in the current folder`;
  if (words === "root" || !ctx) return `Open ${main} in the workspace root`;
  const target = ctx.vars.target ?? "";
  if (ctx.targetKind === "file") {
    return `Open ${target.split(/[\\/]/).filter(Boolean).pop() ?? target} with ${main}`;
  }
  return target ? `Open ${main} in ${target}` : `Open ${main}`;
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
  if (isAgent(action)) {
    const problem = agentCommandProblem(action.command);
    if (problem) return problem;
    return ctx && !ctx.vars.workspace ? WORKSPACE_UNSET : null;
  }
  if (!ctx) return VARIABLE.test(action.command) ? "needs a workspace" : null;
  const used = commandVariablesUsed(action.command);
  if (used.size === 0 && needsWorkspaceRoot(action) && !ctx.vars.workspace) return WORKSPACE_UNSET;
  const problem = commandProblem(action.command, usesTerminal(action) ? ctx.shell : undefined);
  if (problem) return problem;
  const missing = missingVariables(action.command, ctx.vars);
  if (missing.includes("workspace") || (isApp(action) && missing.includes("target"))) return WORKSPACE_UNSET;
  if (missing.length > 0) return describeMissing(missing);
  if (usesTerminal(action)) {
    const unsafe = unsafeVariables(action.command, ctx.vars, ctx.shell);
    if (unsafe.length > 0) return `${unsafe.map((n) => `{${n}}`).join(", ")} holds characters that are unsafe to type into a terminal`;
  }
  return null;
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
  /** The only thing missing is the workspace root: drawn grey with a dashed border, and a click
   * takes the user to where the root is set instead of running. */
  needsRoot: boolean;
  /** What {target} stands for when this item runs, set on the items of the context combo (the
   * focused folder or file). Absent on the bar, where an app opens the workspace root. */
  runTarget?: string;
  /** Whether that target is a file or a folder, which decides where the app is launched from. */
  runTargetKind?: "file" | "folder";
  /** The line under the name: what the Action points at in this place. */
  subtitle: string | null;
  /** The subtitle is a path a long value renders with its start cut. */
  subtitleTrim: boolean;
  /** The icon drawn before the subtitle. */
  subtitleLead: SubtitleLead | null;
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

// The own buttons the bar may draw, in order: those flagged as buttons that the bar carries.
// Each list comes already in bar order, the workspace one before the global one.
export function ownButtonCandidates(
  local: readonly Action[],
  global: readonly Action[],
  states: ReadonlyMap<string, ScriptState>,
): Action[] {
  return [...local, ...global].filter((action) => action.ownButton && onBar(action, stateOf(action, states)));
}

// A button of a detected app or agent that is the only one of it in the bar needs no words:
// its icon says which one it is. With several of the same, the name and the line under it
// tell them apart. Apps and agents count apart; the result is the ids drawn icon-only.
// A picked icon does not say which app it is, so such a button always keeps its words.
export function soleIconButtons(buttons: readonly Pick<Action, "id" | "appId" | "kind" | "icon">[]): Set<string> {
  const keyOf = (a: Pick<Action, "appId" | "kind" | "icon">) =>
    (isApp(a) || isAgent(a)) && a.appId && !a.icon ? `${a.kind}:${a.appId}` : null;
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
  /** The folder and file Actions of the focused tab, in the one combo whose place never moves. */
  contextCombo: ContextCombo;
  empty: boolean;
};

export type ContextCombo = {
  /** Some Action depends on a folder or a file, so the combo is drawn (grey when nothing applies). */
  exists: boolean;
  /** What the focused tab offers: the folder of a terminal, the file of an editor, else nothing. */
  kind: "folder" | "file" | null;
  /** The folder or file name the combo acts on, and its full path for the hover. */
  label: string;
  path: string;
  workspace: BarItem[];
  global: BarItem[];
  /** Why the combo has nothing to offer right now, or null when it does. */
  reason: string | null;
};

export const NO_CONTEXT_REASON = "Focus a terminal or a file to use its Actions";

type BuildInput = {
  local: readonly Action[];
  global?: readonly Action[];
  context: BarContext | null;
  states: ReadonlyMap<string, ScriptState>;
  activeId: string | undefined;
  /** How many own buttons are shown; the rest fold into the menus. Absent: all of them. */
  ownButtonsShown?: number;
  /** What the focused tab is: a folder on a terminal, a file on an editor. It feeds the context
   * combo only; the bar itself is the same whatever tab is focused. */
  place?: FocusPlace;
  /** The bar is being rearranged: lines name what a variable stands for, not today's values. */
  arranging?: boolean;
};

export function hasContextActions(local: readonly Action[], global: readonly Action[]): boolean {
  return local.some(comboCandidate) || global.some(comboCandidate);
}

const lastSegment = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

// The bar has own buttons first (workspace Actions, then global, each by kind in the user's
// order), then the one menu for the rest: workspace Actions, then global, again in the user's
// order. Both hold only agents and workspace Actions, so they do not change with the focused
// tab. The folder and file Actions go to the context combo, which acts on the focused tab. A
// running script is never disabled whatever its variables are now: it has to stay stoppable,
// and it stays visible whatever the focused tab is, so its Stop keeps a place to live.
export function buildActionsBarModel({ local, global = [], context, states, activeId, ownButtonsShown, place, arranging }: BuildInput): BarModel {
  const toItem = (
    action: Action,
    isGlobal: boolean,
    ctx: BarContext | null = context,
    runTarget?: string,
    runTargetKind?: "file" | "folder",
  ): BarItem => {
    const state = stateOf(action, states);
    const running = state === "running";
    const label = action.name.trim() || "Action";
    const words = arranging ? { ...SETTINGS_LABELS, targetKind: ctx?.targetKind } : ctx;
    const subtitle = scriptSubtitle({ ...action, name: label }, words);
    const disabledReason = running ? null : actionAvailability(action, ctx);
    return {
      id: action.id,
      global: isGlobal,
      name: label,
      action,
      state,
      active: action.id === activeId,
      stoppable: state !== "idle",
      disabledReason,
      needsRoot: needsRootFix(disabledReason),
      ...(runTarget !== undefined ? { runTarget, runTargetKind } : {}),
      subtitle: subtitle.text,
      subtitleTrim: subtitle.startTrim,
      subtitleLead: subtitle.lead ?? null,
      title: isAgent(action)
        ? agentTitle(label, disabledReason)
        : isApp(action)
          ? appTitle(label, disabledReason, words, action.accepts)
          : actionRowTitle(label, isScript(action), disabledReason, words),
      iconOnly: false,
    };
  };
  const limit = ownButtonsShown ?? Number.POSITIVE_INFINITY;
  const ordered = [...byKind(local).map((a) => [a, false] as const), ...byKind(global).map((a) => [a, true] as const)];
  const kind: ContextCombo["kind"] = place?.folder ? "folder" : place?.file ? "file" : null;
  const comboPath = kind === "folder" ? (context?.vars.cwd ?? "") : kind === "file" ? (context?.vars.filepath ?? "") : "";
  const model: BarModel = {
    buttons: [],
    menu: { workspace: [], global: [] },
    contextCombo: {
      exists: hasContextActions(local, global),
      kind,
      label: comboPath ? lastSegment(comboPath) : "",
      path: comboPath,
      workspace: [],
      global: [],
      reason: kind && comboPath ? null : NO_CONTEXT_REASON,
    },
    empty: local.length + global.length === 0,
  };
  const buttonIds = new Set(
    ownButtonCandidates(byKind(local), byKind(global), states)
      .slice(0, limit)
      .map((a) => a.id),
  );
  // An app in the combo opens what the combo is on, so it is judged against its own {target}.
  const comboContext: BarContext | null =
    context && comboPath && kind ? { ...context, vars: { ...context.vars, target: comboPath }, targetKind: kind } : context;
  for (const [action, isGlobal] of ordered) {
    const state = stateOf(action, states);
    let barItem: BarItem | undefined;
    const item = () => (barItem ??= toItem(action, isGlobal));
    if (kind && !(isScript(action) && state !== "idle") && inCombo(action, { folder: kind === "folder", file: kind === "file" })) {
      const comboItem = isApp(action) ? toItem(action, isGlobal, comboContext, comboPath, kind) : item();
      (isGlobal ? model.contextCombo.global : model.contextCombo.workspace).push(comboItem);
    }
    if (!onBar(action, state)) continue;
    if (buttonIds.has(action.id)) model.buttons.push(item());
    else if (isGlobal) model.menu.global.push(item());
    else model.menu.workspace.push(item());
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
// needs a second entry. A row that only lacks the workspace root stays enabled: clicking it
// takes the user to where the root is set.
export function menuEntries(item: BarItem): MenuEntry[] {
  const waiting = item.state === "waiting";
  const main: MenuEntry = {
    kind: "main",
    enabled: waiting || item.state === "running" || item.disabledReason === null || item.needsRoot,
  };
  return [main];
}

// The Actions the Header offers here, runnable ones only (a running script stays so it can be
// stopped). Listed once: an app in the bar and in the combo keeps its bar copy, which opens the root.
export function paletteActions(model: Pick<BarModel, "buttons" | "menu" | "contextCombo">): BarItem[] {
  const { workspace, global } = model.contextCombo;
  const seen = new Set<string>();
  return [...model.buttons, ...model.menu.workspace, ...model.menu.global, ...workspace, ...global].filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return i.disabledReason === null || i.stoppable;
  });
}
