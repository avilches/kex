import { actionAvailability, barSubtitle, actionTarget, type BarContext, type ActionTarget } from "./actionsBar";
import type { Action } from "./types";

export type ContextActionKind = "folder" | "file";

export type ContextActionEntry = {
  action: Action;
  /** false is a muted row with its reason; selecting it runs nothing. */
  enabled: boolean;
  reason: string | null;
  /** The value the row gives the preset variable, instead of the raw template. */
  subtitle: string | null;
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
    const reason = actionAvailability(action, ctx);
    rows.push({
      action,
      enabled: reason === null,
      reason,
      subtitle: barSubtitle(action.name.trim() || "Action", ctx),
    });
  }
  return rows;
}
