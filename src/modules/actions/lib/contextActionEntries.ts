import { actionAvailability, type BarContext } from "./actionsBar";
import { missingVariables } from "./commandTemplate";
import type { Action } from "./types";

export type ContextActionKind = "folder" | "file";

export type ContextActionEntry = {
  action: Action;
  /** false is a muted row with its reason; selecting it runs nothing. */
  enabled: boolean;
  reason: string | null;
};

const FILE_VARS = new Set(["filepath", "filename"]);

/** The Actions that fit the place a context menu was opened on. A folder row offers every
 * Action but the ones that need the file it has none of; a file row offers them all. An
 * Action whose remaining variables cannot be filled right now is a muted row with why. */
export function contextActionEntries(
  actions: readonly Action[],
  kind: ContextActionKind,
  ctx: BarContext,
): ContextActionEntry[] {
  const rows: ContextActionEntry[] = [];
  for (const action of actions) {
    if (action.command.trim() === "") continue;
    const reason = actionAvailability(action, ctx);
    const missing = missingVariables(action.command, ctx.vars);
    if (kind === "folder" && missing.some((n) => FILE_VARS.has(n))) continue;
    rows.push({ action, enabled: reason === null, reason });
  }
  return rows;
}
