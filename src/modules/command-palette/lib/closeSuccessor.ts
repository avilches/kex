import type { MergedRow } from "./mergeRows";

// The order MergedList draws the rows in. Typing is the rank order with the current tab first;
// the idle list regroups them under fixed headings, so it is not the order of `rows`.
export function displayOrder(
  rows: readonly MergedRow[],
  typing: boolean,
  commandGroups: readonly string[],
): MergedRow[] {
  if (typing) return [...rows];
  const tabs = rows.filter((r) => r.kind === "tab");
  const actions = rows.filter((r) => r.kind === "action");
  const commands = rows.filter((r) => r.kind === "command");
  return [
    ...tabs.filter((r) => r.kind === "tab" && r.current),
    ...tabs.filter((r) => r.kind === "tab" && !r.current),
    ...rows.filter((r) => r.kind === "closed"),
    ...actions.filter((r) => r.kind === "action" && !r.item.global),
    ...actions.filter((r) => r.kind === "action" && r.item.global),
    ...commandGroups.flatMap((g) =>
      commands.filter((r) => r.kind === "command" && r.item.group === g),
    ),
  ];
}

// The row to select once `key` disappears: the one below it so the list does not seem to move,
// the one above when it was the last, null when nothing is left.
export function successorKey(
  ordered: readonly MergedRow[],
  key: string,
): string | null {
  const i = ordered.findIndex((r) => r.key === key);
  if (i < 0) return null;
  return (ordered[i + 1] ?? ordered[i - 1])?.key ?? null;
}
