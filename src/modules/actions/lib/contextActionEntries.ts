import { folderKey } from "@/modules/workspaces/lib/scriptCwd";
import type { ScriptState } from "@/modules/workspaces/lib/terminalEphemeralStore";
import { actionAvailability, actionTarget, agentTitle, actionRowTitle, byKind, scriptSubtitle, twinIds, type BarContext } from "./actionsBar";
import { isAgent, isApp, isScript, type Action } from "./types";

export type ContextActionKind = "folder" | "file";

export type ContextActionEntry = {
  action: Action;
  /** false is a muted row with its reason; selecting it runs nothing. */
  enabled: boolean;
  reason: string | null;
  /** The line under the name: what the row's file or folder gives the variable. */
  subtitle: string | null;
  /** The subtitle is a path a long value renders with its start cut. */
  subtitleTrim: boolean;
  /** The hover words of an enabled row (where it opens); null says nothing. */
  title: string | null;
};

export type ContextActionGroups = { workspace: ContextActionEntry[]; global: ContextActionEntry[] };

function entriesOf(actions: readonly Action[], ctx: BarContext, withAgents = false): ContextActionEntry[] {
  const rows: ContextActionEntry[] = [];
  for (const action of byKind(actions)) {
    if (action.command.trim() === "" || (isAgent(action) && !withAgents)) continue;
    const name = action.name.trim() || "Action";
    const subtitle = scriptSubtitle({ ...action, name }, ctx);
    const reason = actionAvailability(action, ctx);
    rows.push({
      action,
      enabled: reason === null,
      reason,
      subtitle: subtitle.text,
      subtitleTrim: subtitle.startTrim,
      title: isAgent(action) ? agentTitle(name, null) : actionRowTitle(name, isScript(action), null, ctx),
    });
  }
  return rows;
}

/** Every Action but the agents (their target is the workspace, so they live in the Header
 * only), grouped and ordered as the Header combo does (workspace first, global after, apps
 * before scripts), including the ones that have their own button there. The ones whose
 * variables cannot be filled from the row are muted entries with why. */
export function contextActionEntries(
  local: readonly Action[],
  global: readonly Action[],
  ctx: BarContext,
): ContextActionGroups {
  return { workspace: entriesOf(local, ctx), global: entriesOf(global, ctx) };
}

function runsInFolder(action: Action, atWorkspace: boolean): boolean {
  const target = actionTarget(action.command);
  if (target === "file") return false;
  if (target === "folder") return true;
  if (!isApp(action) && action.cwdMode === "context") return true;
  return atWorkspace;
}

/** What the new-tab surfaces (the + menu of a pane, the new terminal palette) offer: the scripts
 * and agents, which open a terminal, that run in the folder (a folder command, or one starting
 * in the current directory), and the workspace ones only while that folder is the workspace's.
 * Apps open no terminal, so they are never here. Only the runnable ones, with the twins the
 * Header hides left out (an agent in the current directory and in the workspace are one entry
 * at the workspace root). */
export function newTabActionEntries(
  local: readonly Action[],
  global: readonly Action[],
  ctx: BarContext,
  states: ReadonlyMap<string, ScriptState>,
): ContextActionGroups {
  const folders = ctx.folders ?? {};
  const workspaceFolder = folderKey(folders.workspaceRoot?.trim() || folders.workspaceCwd);
  const atWorkspace = workspaceFolder !== "" && folderKey(folders.focusFolder) === workspaceFolder;
  const pick = (actions: readonly Action[]) =>
    actions.filter((a) => a.command.trim() !== "" && !isApp(a) && runsInFolder(a, atWorkspace) && actionAvailability(a, ctx) === null);
  const l = pick(local);
  const g = pick(global);
  const hidden = twinIds([...l, ...g], ctx, states, { file: false, folder: true });
  const keep = (actions: Action[]) => entriesOf(actions.filter((a) => !hidden.has(a.id)), ctx, true);
  return { workspace: keep(l), global: keep(g) };
}
