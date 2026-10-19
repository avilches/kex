import { CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { SleepingIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { WorkspaceMark } from "@/modules/workspaces/WorkspaceMark";
import { RowTag } from "./RowTag";
import type { WorkspaceEntry } from "./lib/tabEntries";

export function WorkspaceItem({ entry, onRun }: { entry: WorkspaceEntry; onRun: () => void }) {
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
      <span className="min-w-0 flex-1 truncate">{entry.title}</span>
      {entry.hibernated ? (
        <span role="img" aria-label="Workspace is hibernated" className="shrink-0">
          <HugeiconsIcon icon={SleepingIcon} size={12} strokeWidth={1.75} className="text-muted-foreground" />
        </span>
      ) : null}
      <span className="ml-auto shrink-0 text-[11px] font-normal text-muted-foreground">
        {entry.tabCount} {entry.tabCount === 1 ? "tab" : "tabs"}
      </span>
    </CommandItem>
  );
}
