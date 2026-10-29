import { HighlightText } from "./HighlightText";
import type { TabEntry } from "./lib/tabEntries";

// What choosing a row does, said before the row title so a terminal, a file and an action do not
// read the same. `closed` marks a reentry row: the tab no longer exists and choosing it reopens it.
export type RowTagKind =
  | "Workspace"
  | "Action"
  | "Setting"
  | "Terminal"
  | "Agent"
  | "File"
  | "Browser"
  | "Git";

export function tabTagKind({ kind, agent }: Pick<TabEntry, "kind" | "agent">): RowTagKind {
  if (kind === "terminal") return agent ? "Agent" : "Terminal";
  if (kind === "editor" || kind === "markdown") return "File";
  if (kind === "browser") return "Browser";
  return "Git";
}

export function RowTag({
  kind,
  closed,
  hit,
}: {
  kind: RowTagKind;
  closed?: boolean;
  // How many leading letters the typed type word covered, lit so the user sees why the row is there.
  hit?: number;
}) {
  return (
    <span className="flex w-16 shrink-0 flex-col items-center text-[10px] leading-tight font-semibold tracking-wide text-muted-foreground/70 uppercase">
      {closed ? (
        <span className="text-[8.5px] font-medium opacity-80">Closed</span>
      ) : null}
      <HighlightText
        text={kind}
        indices={hit ? Array.from({ length: hit }, (_, i) => i) : undefined}
      />
    </span>
  );
}
