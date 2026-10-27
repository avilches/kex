import { displayOrder } from "./closeSuccessor";
import type { MergedRow } from "./mergeRows";

// The row highlighted when the list is drawn: the first one on screen, which is Current tab when
// there is one. Rows that are not drawn (the other workspaces of the idle list) never count.
export function initialKey(
  rows: readonly MergedRow[],
  typing: boolean,
  commandGroups: readonly string[],
): string {
  return displayOrder(rows, typing, commandGroups)[0]?.key ?? "";
}
