import { CommandItem } from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { SleepingIcon, StickyNote03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { TabBarIcon } from "@/modules/workspaces/lib/tabBarIcon";
import { RowTag } from "./RowTag";
import { tabRowDetail } from "./lib/rowDetail";
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

export function TabItem({
  entry,
  ambiguous,
  onRun,
}: {
  entry: TabEntry;
  ambiguous: boolean;
  onRun: () => void;
}) {
  const detail = tabRowDetail(entry, ambiguous);
  return (
    <CommandItem
      value={`tab:${entry.tabId}`}
      onSelect={onRun}
      className={cn("text-[12.5px]", entry.hibernated && "opacity-60")}
    >
      <RowTag kind="Tab" />
      <span className="shrink-0 text-muted-foreground">
        <TabBarIcon tab={entry.tab} agentSession={entry.agentSession} running={entry.running} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{entry.title || KIND_LABEL[entry.kind]}</span>
        {detail ? (
          <span className="flex min-w-0 items-center gap-1.5 truncate text-[10.5px] font-normal text-muted-foreground">
            {detail.location ? <span className="truncate">{detail.location}</span> : null}
            {detail.location && detail.branch ? <span className="opacity-50">·</span> : null}
            {detail.branch ? <span className="truncate">{detail.branch}</span> : null}
          </span>
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
      {entry.note !== null ? (
        <span role="img" aria-label="Has a note" className="shrink-0">
          <HugeiconsIcon
            icon={StickyNote03Icon}
            size={12}
            strokeWidth={1.75}
            className="text-muted-foreground"
          />
        </span>
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
      <span className="ml-auto max-w-40 shrink-0 truncate text-[11px] font-normal text-muted-foreground">
        {entry.workspaceTitle}
      </span>
    </CommandItem>
  );
}
