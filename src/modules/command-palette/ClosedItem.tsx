import { CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { WorkspaceMark } from "@/modules/workspaces/WorkspaceMark";
import {
  File01Icon,
  Folder01Icon,
  SleepingIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { HighlightText } from "./HighlightText";
import type { ClosedTabEntry } from "./lib/closedEntries";
import type { RowHighlight } from "./lib/mergeRows";
import { RowTag } from "./RowTag";

export function ClosedItem({
  entry,
  highlight,
  onRun,
}: {
  entry: ClosedTabEntry;
  highlight?: RowHighlight;
  onRun: () => void;
}) {
  const folder = entry.kind === "terminal";
  const titleIndices =
    highlight?.field === "title" ? highlight.indices : undefined;
  const detailIndices =
    highlight?.field === "detail" ? highlight.indices : undefined;
  const wsIndices =
    highlight?.field === "workspace" ? highlight.indices : undefined;
  return (
    <CommandItem
      value={entry.key}
      onSelect={onRun}
      className={cn("text-[12.5px]", entry.hibernated && "opacity-60")}
    >
      <RowTag kind={folder ? "Terminal" : "File"} closed />
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
      {entry.hibernated ? (
        <span
          role="img"
          aria-label="Workspace is hibernated"
          className="shrink-0"
        >
          <HugeiconsIcon
            icon={SleepingIcon}
            size={12}
            strokeWidth={1.75}
            className="text-muted-foreground"
          />
        </span>
      ) : null}
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
    </CommandItem>
  );
}
