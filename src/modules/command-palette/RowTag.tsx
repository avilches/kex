import type { TabEntry } from "./lib/tabEntries";

// What choosing a row does, said before the row title so a terminal, a file and an action do not
// read the same. `closed` marks a reentry row: the tab no longer exists and choosing it reopens it.
export type RowTagKind =
  | "Workspace"
  | "Action"
  | "Setting"
  | "Terminal"
  | "File"
  | "Browser"
  | "Git";

export function tabTagKind(kind: TabEntry["kind"]): RowTagKind {
  if (kind === "terminal") return "Terminal";
  if (kind === "editor" || kind === "markdown") return "File";
  if (kind === "browser") return "Browser";
  return "Git";
}

export function RowTag({
  kind,
  closed,
}: {
  kind: RowTagKind;
  closed?: boolean;
}) {
  return (
    <span className="flex w-16 shrink-0 flex-col items-center text-[10px] leading-tight font-semibold tracking-wide text-muted-foreground/70 uppercase">
      {closed ? (
        <span className="text-[8.5px] font-medium opacity-80">Closed</span>
      ) : null}
      {kind}
    </span>
  );
}
