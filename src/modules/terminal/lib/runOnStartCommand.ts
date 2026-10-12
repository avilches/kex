import type { Tab } from "@/modules/workspaces/lib/types";

type TerminalTab = Extract<Tab, { kind: "terminal" }>;

type Fields = Pick<TerminalTab, "persistentCommand" | "persistentCommandManual">;

// The shell hook cuts the reported command at this length.
export const REPORTED_COMMAND_LIMIT = 256;

/**
 * The command a tab can persist as Run on Start, from what the shell reports.
 * A running script reports its typed wrapper, so the script's own command
 * replaces it; a report as long as the hook's limit may be cut short and is
 * never followed.
 */
export function followableCommand(
  running: string | null,
  scriptCommand: string | null,
): string | null {
  if (scriptCommand?.trim()) return scriptCommand.trim();
  if (!running || running.length >= REPORTED_COMMAND_LIMIT) return null;
  return running;
}

/** Command to store when Run on Start is switched on; an agent tab never copies the running one. */
export function commandOnEnable(
  tab: Fields,
  followable: string | null,
  isAgent: boolean,
): string | undefined {
  return tab.persistentCommand ?? (isAgent ? undefined : (followable ?? undefined));
}

export function effectiveRunOnStartCommand(tab: Fields, running: string | null): string {
  if (tab.persistentCommandManual) return tab.persistentCommand ?? "";
  return running ?? tab.persistentCommand ?? "";
}

export function commitRunOnStartEdit(value: string, running: string | null): Fields {
  const v = value.trim();
  if (v) return { persistentCommand: v, persistentCommandManual: true };
  return { persistentCommand: running ?? undefined, persistentCommandManual: false };
}

// Fields to write so a followed (non-manual) command reaches the persisted tab, or null when
// nothing needs to change.
export function syncFollowedCommand(tab: Fields, running: string | null): Fields | null {
  if (tab.persistentCommandManual || !running || tab.persistentCommand === running) return null;
  return { persistentCommand: running, persistentCommandManual: false };
}
