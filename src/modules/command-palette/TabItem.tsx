import { CommandItem } from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  File02Icon,
  FileEditIcon,
  Globe02Icon,
  SleepingIcon,
  SourceCodeIcon,
  StickyNote03Icon,
  TerminalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TabEntry } from "./lib/tabEntries";

const KIND_ICON: Record<TabEntry["kind"], typeof TerminalIcon> = {
  terminal: TerminalIcon,
  editor: FileEditIcon,
  markdown: File02Icon,
  browser: Globe02Icon,
  "git-diff": SourceCodeIcon,
  "git-history": SourceCodeIcon,
  "git-commit-file": SourceCodeIcon,
};

const KIND_LABEL: Record<TabEntry["kind"], string> = {
  terminal: "Terminal",
  editor: "Editor",
  markdown: "Markdown",
  browser: "Browser",
  "git-diff": "Git diff",
  "git-history": "Git history",
  "git-commit-file": "Git commit file",
};

function shortCwd(cwd: string): string {
  return cwd.split(/[\\/]/).filter(Boolean).slice(-2).join("/");
}

export function TabItem({
  entry,
  ambiguous,
  onRun,
}: {
  entry: TabEntry;
  ambiguous: boolean;
  onRun: () => void;
}) {
  return (
    <CommandItem
      value={`tab:${entry.tabId}`}
      onSelect={onRun}
      className={cn("text-[12.5px]", entry.hibernated && "opacity-60")}
    >
      <HugeiconsIcon
        icon={KIND_ICON[entry.kind]}
        size={14}
        strokeWidth={1.75}
        className="shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 flex-1 truncate">
        {entry.title || KIND_LABEL[entry.kind]}
        {ambiguous && entry.cwd ? (
          <span className="ml-2 text-[11px] font-normal text-muted-foreground">
            {shortCwd(entry.cwd)}
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
