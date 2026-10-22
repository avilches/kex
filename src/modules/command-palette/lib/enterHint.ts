import type { MergedRow } from "./mergeRows";

// What Enter does on the highlighted row, for the palette footer.
export function enterHintOf(value: string, rows: readonly MergedRow[]): string {
  const row = rows.find((r) => r.key === value);
  if (!row) return "Select";
  switch (row.kind) {
    case "tab":
      return "Select tab";
    case "workspace":
      return "Select workspace";
    case "closed":
      return "Reopen";
    case "command":
      return "Run action";
  }
}
