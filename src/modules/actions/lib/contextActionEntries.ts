import { actionAvailability, actionRowTitle, appsFirst, scriptSubtitle, type BarContext } from "./actionsBar";
import { isAgent, isScript, type Action } from "./types";

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

function entriesOf(actions: readonly Action[], ctx: BarContext): ContextActionEntry[] {
  const rows: ContextActionEntry[] = [];
  for (const action of appsFirst(actions)) {
    if (action.command.trim() === "" || isAgent(action)) continue;
    const name = action.name.trim() || "Action";
    const subtitle = scriptSubtitle({ ...action, name }, ctx);
    const reason = actionAvailability(action, ctx);
    rows.push({
      action,
      enabled: reason === null,
      reason,
      subtitle: subtitle.text,
      subtitleTrim: subtitle.startTrim,
      title: actionRowTitle(name, isScript(action), null, ctx),
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
