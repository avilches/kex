import type { MergedRow } from "./mergeRows";

// The row highlighted when the palette opens with an empty box: the previous tab, so Cmd+P then
// Enter jumps back, and the current one only when there is no other. Typing keeps cmdk's own
// choice of the best result.
export function initialKey(rows: readonly MergedRow[], typing: boolean): string {
  if (typing) return "";
  const previous = rows.find((r) => r.kind === "tab" && !r.current);
  return (previous ?? rows[0])?.key ?? "";
}
