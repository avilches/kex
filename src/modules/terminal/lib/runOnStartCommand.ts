import type { Tab } from "@/modules/workspaces/lib/types";

type TerminalTab = Extract<Tab, { kind: "terminal" }>;

type Fields = Pick<TerminalTab, "persistentCommand" | "persistentCommandManual">;

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
