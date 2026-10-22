import type { MergedRow } from "./mergeRows";
import type { TabEntry } from "./tabEntries";

// The tab a new terminal would open beside: the highlighted row when it is a tab that knows its folder.
export function terminalTargetOf(
  value: string,
  rows: readonly MergedRow[],
): TabEntry | null {
  for (const row of rows) {
    if (row.kind === "tab" && value === `tab:${row.entry.tabId}`) {
      return row.entry.cwd ? row.entry : null;
    }
  }
  return null;
}
