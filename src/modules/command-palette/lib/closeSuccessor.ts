import type { MergedRow } from "./mergeRows";

// The order MergedList draws the rows in. Typing is the order of `rows` (current tab, other tabs, then the ranked rest);
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

// The row to select once every key in `gone` has disappeared, starting from the highlighted one.
// A highlighted row that stays (Close Other Tabs) is kept; otherwise it is the first row that
// stays below it so the list does not seem to move, the nearest one above when
// none stays below, null when nothing is left.
export function successorOf(
  ordered: readonly MergedRow[],
  gone: ReadonlySet<string>,
  from: string,
): string | null {
  const i = ordered.findIndex((r) => r.key === from);
  if (i < 0) return null;
  if (!gone.has(from)) return from;
  for (let k = i + 1; k < ordered.length; k++) {
    if (!gone.has(ordered[k].key)) return ordered[k].key;
  }
  for (let k = i - 1; k >= 0; k--) {
    if (!gone.has(ordered[k].key)) return ordered[k].key;
  }
  return null;
}

export function successorKey(
  ordered: readonly MergedRow[],
  key: string,
): string | null {
  return successorOf(ordered, new Set([key]), key);
}
