import { DEFAULT_ACTION_ICON_SIZE } from "@/lib/actionIconSizes";
import type { ScriptState } from "@/modules/workspaces/lib/terminalEphemeralStore";
import { splitActionName } from "./actionName";
import { inHeader, offeredAt, type FocusPlace } from "./actionTargets";
export { actionTarget, type ActionTarget, type FocusPlace } from "./actionTargets";
import { commandProblem, unsafeVariables, type CommandShell } from "./commandTemplate";
import { scriptCwdProblem } from "@/modules/workspaces/lib/scriptCwd";
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
// ICON is the icon at the default size; a bigger or smaller one moves the width by the difference.
const iconWidth = (iconSize: number): number => Math.max(0, ICON + iconSize - DEFAULT_ACTION_ICON_SIZE);
// The width fits the main name only: the variable line fronts underneath it, past the cap.
export const MENUS_RESERVE = 78;

export function ownButtonWidth(
  action: Pick<Action, "name" | "kind">,
  iconOnly = false,
  iconSize: number = DEFAULT_ACTION_ICON_SIZE,
): number {
  if (iconOnly) return PADDING + iconWidth(iconSize);
  const { main } = splitActionName(action.name.trim() || "Action");
  const label = Math.min(LABEL_CAP, main.length * CHAR_WIDTH);
  return PADDING + label + (isScript(action) ? RUN_ZONE : iconWidth(iconSize));
}

// Only a script has a running state: an agent opens a new tab per click and keeps no link.
export function stateOf(action: Action, states: ReadonlyMap<string, ScriptState> | undefined): ScriptState | "idle" {
  return isScript(action) ? (states?.get(action.id) ?? "idle") : "idle";
}

// Whether the Header bar (own buttons and the Actions menu) carries this Action. The bar is
// the same whatever tab is focused, so it only holds what acts on the workspace root (`inHeader`).
// A script that is not idle stays whatever it is, so it can be stopped.
export function onBar(action: Action, state: ScriptState | "idle"): boolean {
  return state !== "idle" || inHeader(action);
}

// How many of the own buttons, taken in the user's order, fit in the room the bar has once the
// menus have taken theirs. The rest fold into the menu, so the bar never pushes the search box
// and the window controls out.
export function ownButtonsThatFit(
  actions: readonly Action[],
  room: number,
  iconSize: number = DEFAULT_ACTION_ICON_SIZE,
): number {
  let left = Math.floor(room) - MENUS_RESERVE;
  let shown = 0;
  const sole = soleIconButtons(actions);
  for (const action of actions) {
    left -= ownButtonWidth(action, sole.has(action.id), iconSize) + BAR_GAP;
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
  /** The folder and the file the focused tab offers, "" when it has none. */
  focus?: { folder: string; file: string };
  /** The folders the runner picks a start folder from, so the bar names the same one. */
  folders?: { workspaceRoot?: string | null; workspaceCwd?: string | null };
};

const NEEDS: Record<string, string> = { target: "a folder or file to act on" };

// The words for what an Action still lacks; a variable with no friendly name is quoted.
export function describeMissing(names: readonly string[]): string {
  const unknown = names.filter((n) => !(n in NEEDS));
  if (unknown.length > 0 && unknown.length === names.length) {
    return `${unknown.map((n) => `{${n}}`).join(", ")} ${unknown.length > 1 ? "have" : "has"} no value here`;
  }
  const needs = [...new Set(names.filter((n) => n in NEEDS).map((n) => NEEDS[n]))];
  return `needs ${needs.join(" and ")}`;
}

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

// Settings has no workspace to read a root from, so under a script name it says what the place
// is in words. The bar never uses this: it shows real values.
export const SETTINGS_LABELS: BarContext = { vars: {}, shell: "posix", labels: true };

export type SubtitleLead = "root" | "home" | "tab" | "file";

export type ActionSubtitle = {
  /** The line under the name; null leaves the name lineless. */
  text: string | null;
  /** True when the value is a path rendered with its start cut instead of its tail. */
  startTrim: boolean;
  /** The icon drawn before the line: the workspace root pin, Home, the current tab's folder, or a file. */
  lead?: SubtitleLead;
};

// The line under a name tells where the script runs when the menu does not already say it: the
// workspace root or its fixed folder. A script that acts on any folder or any file runs where it
// was offered, which the menu already names, and agents and apps have no line at all.
export function scriptSubtitle(
  action: Pick<Action, "kind" | "runs" | "cwd">,
  ctx: BarContext | null,
): ActionSubtitle {
  if (!isScript(action)) return { text: null, startTrim: false };
  if (action.runs === "fixed") return action.cwd ? { text: action.cwd, startTrim: true } : { text: null, startTrim: false };
  if (action.runs === "workspace") return workspaceLine(ctx);
  return { text: null, startTrim: false };
}

// Where a workspace-rooted script starts: the root itself, or the words for it in Settings.
function workspaceLine(ctx: BarContext | null): ActionSubtitle {
  if (!ctx || ctx.labels) return { text: "Workspace root", startTrim: false, lead: "root" };
  if (!ctx.folders?.workspaceRoot?.trim()) return { text: WORKSPACE_UNSET, startTrim: false };
  return { text: ctx.folders.workspaceRoot.trim(), startTrim: true, lead: "root" };
}

// An agent has nothing to open: its hover says it runs, or why it cannot.
export function agentTitle(label: string, disabledReason: string | null): string {
  return disabledReason ? `${label}: ${disabledReason}` : `Run ${label}`;
}

// The hover of an app, which has no line under its name: it says what it opens, read from the context.
export function appTitle(name: string, disabledReason: string | null, ctx: BarContext | null): string {
  const { main } = splitActionName(name);
  if (disabledReason) return `${main}: ${disabledReason}`;
  const target = ctx?.vars.target ?? "";
  if (ctx?.targetKind === "file") return target ? `Open ${target.split(/[\\/]/).filter(Boolean).pop() ?? target} with ${main}` : `Open the current file with ${main}`;
  if (ctx?.targetKind === "folder") return target ? `Open ${main} in ${target}` : `Open ${main} in the current folder`;
  return `Open ${main} in the workspace root`;
}

// The hover words of a script row: where it runs when it always runs in the same place. A
// blocked row keeps its reason.
export function actionRowTitle(
  name: string,
  action: Pick<Action, "runs" | "cwd">,
  disabledReason: string | null,
  ctx: BarContext | null,
): string | null {
  const { main } = splitActionName(name);
  if (disabledReason) return `${main}: ${disabledReason}`;
  if (action.runs === "fixed" && action.cwd) return `Run ${main} in ${action.cwd}`;
  if (action.runs !== "workspace") return null;
  if (ctx?.labels) return `Run ${main} in Workspace root`;
  const root = ctx?.folders?.workspaceRoot?.trim();
  return root ? `Run ${main} in ${root}` : null;
}

// What needs the workspace root: an app (it opens it from the Header), an agent, and a script that
// runs on any folder (the Header offers it on the root) or only in the root. A fixed folder and a
// script on any file never do.
export function needsWorkspaceRoot(action: Pick<Action, "kind" | "runs">): boolean {
  return !isScript(action) || action.runs === "folder" || action.runs === "workspace";
}

const hasRoot = (ctx: BarContext) => !!ctx.folders?.workspaceRoot?.trim();

// Why an Action cannot run right now, or null when it can. Scripts are typed into a terminal, so a
// value that cannot be quoted safely also blocks them; an app is spawned without a shell and never
// is. What needs the workspace root is blocked without one, with the words the row shows for that.
export function actionAvailability(action: Action, ctx: BarContext | null): string | null {
  if (action.command.trim() === "") return "it has no command";
  if (isAgent(action)) {
    const problem = agentCommandProblem(action.command);
    if (problem) return problem;
    return ctx && !hasRoot(ctx) ? WORKSPACE_UNSET : null;
  }
  if (isScript(action) && action.runs === "fixed") {
    const folder = action.cwd ? scriptCwdProblem(action.cwd) : "it has no folder";
    if (folder) return folder;
  }
  const problem = commandProblem(action.command, usesTerminal(action) ? (ctx?.shell ?? "posix") : undefined, undefined, action.runs);
  if (problem) return problem;
  if (!ctx) return null;
  if (needsWorkspaceRoot(action) && !hasRoot(ctx)) return WORKSPACE_UNSET;
  if (isScript(action) && action.runs === "file" && !ctx.vars.target) return describeMissing(["target"]);
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
// An app is never one, it lives in the menus whatever its flag says. Each list comes already in bar order, the workspace one before the global one.
export function ownButtonCandidates(
  local: readonly Action[],
  global: readonly Action[],
  states: ReadonlyMap<string, ScriptState>,
): Action[] {
  return [...local, ...global].filter((action) => action.ownButton && !isApp(action) && onBar(action, stateOf(action, states)));
}

// An agent button whose logo no other button of the bar shares needs no words: the logo says
// which one it is. With several of the same logo (Claude and Claude with Yolo) the name tells
// them apart. A glyph or a script never qualifies, a glyph does not say what the button is.
export function soleIconButtons(buttons: readonly Pick<Action, "id" | "kind" | "icon">[]): Set<string> {
  const count = new Map<string, number>();
  for (const a of buttons) if (a.icon) count.set(a.icon, (count.get(a.icon) ?? 0) + 1);
  return new Set(
    buttons.filter((a) => isAgent(a) && a.icon?.startsWith("agent:") && count.get(a.icon) === 1).map((a) => a.id),
  );
}

export const MENU_DRAG_PREFIX = "menu:";
export const DROP_MENU = "zone:menu";
export const DROP_MENU_PREFIX = "mzone:";
export const DROP_MENU_WORKSPACE = "mzone:workspace";
export const DROP_MENU_GLOBAL = "mzone:global";

type Scope = "workspace" | "global";

// The bar has one zone per scope and kind: agents and scripts of the workspace, and the same
// of the global scope. Each one takes only its own kind. Apps have none: they stay in the menus.
export const barZoneId = (scope: Scope, kind: ActionKind) => `zone:${scope}:${kind}s`;

export function parseBarZone(id: string): { scope: Scope; kind: ActionKind } | null {
  const m = /^zone:(workspace|global):(agent|script)s$/.exec(id);
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
  if (button && isApp(from.action)) return null;
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
  /** How many own buttons are shown; the rest fold into the menus. Absent: all of them. */
  ownButtonsShown?: number;
  /** What the focused tab is: a folder on a terminal, a file on an editor. It feeds the context
   * combo only; the bar itself is the same whatever tab is focused. */
  place?: FocusPlace;
  /** The bar is being rearranged: lines name what a variable stands for, not today's values. */
  arranging?: boolean;
};

// Whether the focused-tab submenu has anything it could ever offer on some folder or file, which
// decides if it is drawn at all.
export function hasContextActions(local: readonly Action[], global: readonly Action[]): boolean {
  const any = (a: Action) => offeredAt(a, "folder") || offeredAt(a, "file");
  return local.some(any) || global.some(any);
}

const lastSegment = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

// The bar has own buttons first (workspace Actions, then global, each by kind in the user's
// order), then the one menu for the rest: workspace Actions, then global, again in the user's
// order. Both hold only agents and workspace Actions, so they do not change with the focused
// tab. The folder and file Actions go to the context combo, which acts on the focused tab. A
// running script is never disabled whatever its variables are now: it has to stay stoppable,
// and it stays visible whatever the focused tab is, so its Stop keeps a place to live.
export function buildActionsBarModel({ local, global = [], context, states, ownButtonsShown, place, arranging }: BuildInput): BarModel {
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
    const subtitle = scriptSubtitle(action, words);
    const disabledReason = running ? null : actionAvailability(action, ctx);
    return {
      id: action.id,
      global: isGlobal,
      name: label,
      action,
      state,
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
          ? appTitle(label, disabledReason, words)
          : actionRowTitle(label, action, disabledReason, words),
      iconOnly: false,
    };
  };
  const limit = ownButtonsShown ?? Number.POSITIVE_INFINITY;
  const ordered = [...byKind(local).map((a) => [a, false] as const), ...byKind(global).map((a) => [a, true] as const)];
  const kind: ContextCombo["kind"] = place?.folder ? "folder" : place?.file ? "file" : null;
  const comboPath = kind === "folder" ? (context?.focus?.folder ?? "") : kind === "file" ? (context?.focus?.file ?? "") : "";
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
  // What the combo offers acts on what the combo is on, not on the workspace root: each item is judged
  // against its own {target}, and the folder it starts in is that folder (the one that holds the file),
  // so a workspace without a root does not grey what a focused folder or file can perfectly well run.
  const comboFolder = kind === "file" ? comboPath.replace(/[\\/][^\\/]*$/, "") || comboPath : comboPath;
  const comboContext: BarContext | null =
    context && comboPath && kind
      ? {
          ...context,
          vars: { ...context.vars, target: comboPath },
          targetKind: kind,
          folders: { ...context.folders, workspaceRoot: comboFolder },
        }
      : context;
  for (const [action, isGlobal] of ordered) {
    const state = stateOf(action, states);
    let barItem: BarItem | undefined;
    const item = () => (barItem ??= toItem(action, isGlobal));
    if (kind && !(isScript(action) && state !== "idle") && offeredAt(action, kind)) {
      const comboItem = toItem(action, isGlobal, comboContext, comboPath, kind);
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
