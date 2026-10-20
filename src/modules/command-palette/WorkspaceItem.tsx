import { CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { WorkspaceMark } from "@/modules/workspaces/WorkspaceMark";
import { SleepingIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { HighlightText } from "./HighlightText";
import type { RowHighlight } from "./lib/mergeRows";
import type { WorkspaceEntry } from "./lib/tabEntries";
import { RowTag } from "./RowTag";

export function WorkspaceItem({
  entry,
  highlight,
  onRun,
}: {
  entry: WorkspaceEntry;
  highlight?: RowHighlight;
  onRun: () => void;
}) {
  return (
    <CommandItem
      value={`ws:${entry.workspaceId}`}
      onSelect={onRun}
      className={cn("text-[12.5px]", entry.hibernated && "opacity-60")}
    >
      <RowTag kind="Workspace" />
      <WorkspaceMark
        id={entry.workspaceId}
        color={entry.color}
        icon={entry.icon ?? undefined}
        size={14}
      />
      <span className="min-w-0 flex-1 truncate">
        <HighlightText
          text={entry.title}
          indices={highlight?.field === "title" ? highlight.indices : undefined}
        />
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
      <span className="ml-auto shrink-0 text-[11px] font-normal text-muted-foreground">
        {entry.tabCount} {entry.tabCount === 1 ? "tab" : "tabs"}
      </span>
    </CommandItem>
  );
}
