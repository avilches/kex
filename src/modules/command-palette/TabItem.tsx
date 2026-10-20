import { CommandItem } from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { SleepingIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { TabBarIcon } from "@/modules/workspaces/lib/tabBarIcon";
import { WorkspaceMark } from "@/modules/workspaces/WorkspaceMark";
import { RowTag } from "./RowTag";
import { tabLocation, tabStatus } from "./lib/rowDetail";
import type { TabEntry } from "./lib/tabEntries";

const KIND_LABEL: Record<TabEntry["kind"], string> = {
  terminal: "Terminal",
  editor: "Editor",
  markdown: "Markdown",
  browser: "Browser",
  "git-diff": "Git diff",
  "git-history": "Git history",
  "git-commit-file": "Git commit file",
};

export function TabItem({ entry, onRun }: { entry: TabEntry; onRun: () => void }) {
  const location = tabLocation(entry);
  const status = tabStatus(entry);
  const note = entry.note?.replace(/\s+/g, " ").trim();
  return (
    <CommandItem
      value={`tab:${entry.tabId}`}
      onSelect={onRun}
      className={cn("text-[12.5px]", entry.hibernated && "opacity-60")}
    >
      <RowTag kind="Tab" />
      <span className="shrink-0 self-start pt-0.5 text-muted-foreground">
        <TabBarIcon tab={entry.tab} agentSession={entry.agentSession} running={entry.running} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{entry.title || KIND_LABEL[entry.kind]}</span>
        {location ? (
          <span className="truncate text-[10.5px] font-normal text-muted-foreground/80">{location}</span>
        ) : null}
        {status ? (
          <span className="truncate text-[10.5px] font-normal text-muted-foreground/70">{status}</span>
        ) : null}
        {note ? (
          <span className="truncate text-[10.5px] font-normal text-muted-foreground/60">{note}</span>
        ) : null}
      </span>
      {entry.indicator === "working" ? (
        <Spinner size={11} className="shrink-0" />
      ) : entry.indicator ? (
        <span
          role="img"
          aria-label="Agent needs attention"
          className={cn(
            "size-[6px] shrink-0 rounded-full",
            entry.indicator === "error" ? "bg-destructive" : "bg-amber-400",
          )}
        />
      ) : null}
      {entry.hibernated ? (
        <span role="img" aria-label="Workspace is hibernated" className="shrink-0">
          <HugeiconsIcon
            icon={SleepingIcon}
            size={12}
            strokeWidth={1.75}
            className="text-muted-foreground"
          />
        </span>
      ) : null}
      <span className="ml-auto flex max-w-56 shrink-0 items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
        <WorkspaceMark
          id={entry.workspaceId}
          color={entry.workspaceColor}
          icon={entry.workspaceIcon ?? undefined}
          size={12}
        />
        <span className="truncate">{entry.workspaceTitle}</span>
      </span>
    </CommandItem>
  );
}
