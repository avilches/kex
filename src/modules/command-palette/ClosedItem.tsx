import { CommandItem } from "@/components/ui/command";
import { WorkspaceMark } from "@/modules/workspaces/WorkspaceMark";
import { File01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { HighlightText } from "./HighlightText";
import type { ClosedTabEntry } from "./lib/closedEntries";
import { foldText, highlightIndices, substringIndices } from "./lib/fuzzy";
import { RowTag } from "./RowTag";

export function ClosedItem({
  entry,
  term = "",
  tagHit,
  onRun,
  onContextMenu,
}: {
  entry: ClosedTabEntry;
  term?: string;
  tagHit?: number;
  onRun: () => void;
  onContextMenu?: (e: React.MouseEvent<HTMLElement>) => void;
}) {
  const folder = entry.kind === "terminal";
  const folded = foldText(term.trim());
  const titleIndices = highlightIndices(folded, entry.title);
  const detailIndices = substringIndices(folded, entry.detail);
  const wsIndices = highlightIndices(folded, entry.workspaceTitle);
  return (
    <CommandItem
      value={entry.key}
      onSelect={onRun}
      onContextMenu={onContextMenu}
      className="text-[12.5px]"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 opacity-60">
      <RowTag kind={folder ? "Terminal" : "File"} closed hit={tagHit} />
      <span className="shrink-0 text-muted-foreground">
        <HugeiconsIcon
          icon={folder ? Folder01Icon : File01Icon}
          size={14}
          strokeWidth={1.75}
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">
          <HighlightText text={entry.title} indices={titleIndices} />
        </span>
        <span className="truncate text-[10.5px] font-normal text-muted-foreground/80">
          <HighlightText text={entry.detail} indices={detailIndices} />
        </span>
      </span>
      {entry.workspaceTitle ? (
        <span className="ml-auto flex max-w-56 shrink-0 items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
          <WorkspaceMark
            id={entry.workspaceId}
            color={entry.workspaceColor}
            icon={entry.workspaceIcon ?? undefined}
            size={12}
          />
          <span className="truncate">
            <HighlightText text={entry.workspaceTitle} indices={wsIndices} />
          </span>
        </span>
      ) : null}
      </span>
    </CommandItem>
  );
}
