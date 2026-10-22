import { pathDirname } from "@/lib/pathUtils";
import type { MergedRow } from "./mergeRows";

// Where Cmd+T opens a terminal from the highlighted row: in the folder the row points at, in the
// row's workspace, and beside its tab when the row is a live one.
export type TerminalTarget = {
  cwd: string;
  workspaceId: string;
  hibernated: boolean;
  besideTabId: string | null;
};

export function terminalTargetOf(
  value: string,
  rows: readonly MergedRow[],
): TerminalTarget | null {
  for (const row of rows) {
    if (row.kind === "tab" && value === `tab:${row.entry.tabId}`) {
      const { cwd, workspaceId, hibernated, tabId } = row.entry;
      return cwd ? { cwd, workspaceId, hibernated, besideTabId: tabId } : null;
    }
    if (row.kind === "closed" && value === row.entry.key) {
      const { kind, path, workspaceId, hibernated } = row.entry;
      const cwd = kind === "terminal" ? path : pathDirname(path);
      return cwd ? { cwd, workspaceId, hibernated, besideTabId: null } : null;
    }
  }
  return null;
}
