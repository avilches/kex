import { actionAvailability, actionRowTitle, scriptSubtitle, actionTarget, type BarContext, type ActionTarget } from "./actionsBar";
import type { Action } from "./types";

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

const TARGETS: Record<ContextActionKind, ActionTarget> = { folder: "folder", file: "file" };

/** The Actions offered on a row: folder rows offer only folder Actions, file rows only
 * file Actions, and the workspace Actions stay in the Header at all times. A row whose
 * remaining variables cannot be filled is a muted entry with why. */
export function contextActionEntries(
  actions: readonly Action[],
  kind: ContextActionKind,
  ctx: BarContext,
): ContextActionEntry[] {
  const rows: ContextActionEntry[] = [];
  for (const action of actions) {
    if (action.command.trim() === "") continue;
    if (actionTarget(action.command) !== TARGETS[kind]) continue;
    const name = action.name.trim() || "Action";
    const subtitle = scriptSubtitle({ ...action, name }, ctx);
    const reason = actionAvailability(action, ctx);
    rows.push({
      action,
      enabled: reason === null,
      reason,
      subtitle: subtitle.text,
      subtitleTrim: subtitle.startTrim,
      title: actionRowTitle(name, action.runInTerminal, null, ctx),
    });
  }
  return rows;
}
