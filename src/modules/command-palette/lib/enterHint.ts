import {
  actionMenuItems,
  closedMenuItems,
  tabMenuItems,
  workspaceMenuItems,
  type RowMenuItem,
} from "./rowMenu";
import type { MergedRow } from "./mergeRows";

// What Enter does on the highlighted row, for the palette footer: the label of the row menu's
// Enter item, so the footer and the menu never disagree.
export function enterHintOf(value: string, rows: readonly MergedRow[]): string {
  const row = rows.find((r) => r.key === value);
  if (!row) return "Select";
  if (row.kind === "command") return "Run action";
  const items: RowMenuItem[] =
    row.kind === "tab"
      ? tabMenuItems(row.entry)
      : row.kind === "workspace"
        ? workspaceMenuItems(row.entry)
        : row.kind === "closed"
          ? closedMenuItems(row.entry)
          : actionMenuItems(row.item);
  return items.find((i) => i.enter)?.label ?? "Select";
}
