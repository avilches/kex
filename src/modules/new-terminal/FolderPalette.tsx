import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HighlightText } from "@/modules/command-palette/HighlightText";
import { PALETTE_WIDTH_CLASS, usePaletteWidth } from "@/modules/command-palette/PaletteWidth";
import { WorkspaceMark } from "@/modules/workspaces/WorkspaceMark";
import { Home01Icon, SleepingIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  filterFolderGroups,
  type FolderGroup,
  type FolderRow,
} from "./lib/folderEntries";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All groups for the open state; the component applies the search. */
  groups: readonly FolderGroup[];
  onPick: (row: FolderRow) => void;
  /** Tab on a row whose repository has worktrees that are not listed yet. */
  onExpand: (row: FolderRow) => void;
};

export function FolderPalette({ open, onOpenChange, groups, onPick, onExpand }: Props) {
  const [query, setQuery] = useState("");
  const { contentStyle, handles } = usePaletteWidth();
  const listRef = useRef<HTMLDivElement>(null);

  // Fresh palette on every open: no query from the previous ask.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const filtered = useMemo(
    () => filterFolderGroups(groups, query),
    [groups, query],
  );
  const empty = filtered.length === 0;

  // The new first row is selected on every keystroke, but a list scrolled down
  // for the previous query stays where it was and hides it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the top whenever the typed text changes or the palette reopens
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[data-slot=scroll-area-viewport]")
      ?.scrollTo({ top: 0 });
  }, [query, open]);

  // The row under the cursor is read from cmdk's own selection, which this palette never controls.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const key = listRef.current?.querySelector<HTMLElement>(
      '[cmdk-item][aria-selected="true"]',
    )?.dataset.folderRow;
    const row = key ? groups.flatMap((g) => g.rows).find((r) => r.key === key) : undefined;
    if (row?.repoKey && row.hiddenWorktrees > 0) onExpand(row);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New terminal folder"
      description="Choose the folder for the new terminal."
      modal={false}
      onFocusOutside={(event) => event.preventDefault()}
      className={PALETTE_WIDTH_CLASS}
      contentStyle={contentStyle}
    >
      {handles}
      <Command shouldFilter={false} loop onKeyDown={onKeyDown}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="New terminal in..."
          autoFocus
        />
        <ScrollArea
          ref={listRef}
          className="max-h-[420px] [&_[data-slot=scroll-area-viewport]>div]:block!"
        >
          <CommandList className="max-h-none overflow-visible pr-3">
            {empty ? (
              <CommandGroup heading="Folders">
                <CommandItem
                  value="no-match"
                  disabled
                  className="text-[12.5px] text-muted-foreground"
                >
                  <span>No folder matches the search</span>
                </CommandItem>
              </CommandGroup>
            ) : (
              filtered.map((g) => (
                <CommandGroup
                  key={g.workspaceId}
                  heading={<GroupHeading group={g} titleIndices={g.titleIndices} />}
                >
                  {g.rows.map((row) => (
                    <CommandItem
                      key={row.key}
                      value={row.key}
                      data-folder-row={row.key}
                      onSelect={() => onPick(row)}
                      className="pl-7 text-[12.5px]"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <HighlightText text={row.display} indices={row.indices} />
                        {row.branch ? (
                          <span className="font-normal text-muted-foreground">
                            {" \u00b7 "}
                            <HighlightText text={row.branch} indices={row.branchIndices} />
                          </span>
                        ) : null}
                      </span>
                      {row.hiddenWorktrees > 0 ? (
                        <span className="ml-auto shrink-0 text-[11px] font-normal text-muted-foreground">
                          <span className="font-medium">TAB</span>
                          {`: show ${row.hiddenWorktrees} ${row.hiddenWorktrees === 1 ? "worktree" : "worktrees"}`}
                        </span>
                      ) : row.label ? (
                        <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] font-normal text-muted-foreground">
                          {row.label === "Home" ? (
                            <HugeiconsIcon icon={Home01Icon} size={12} strokeWidth={2} />
                          ) : null}
                          <HighlightText text={row.label} indices={row.labelIndices} />
                        </span>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            )}
          </CommandList>
        </ScrollArea>
      </Command>
    </CommandDialog>
  );
}

function GroupHeading({
  group,
  titleIndices,
}: {
  group: FolderGroup;
  titleIndices: number[] | undefined;
}) {
  return (
    <span className="flex items-center gap-2">
      <WorkspaceMark
        id={group.workspaceId}
        color={group.workspaceColor}
        icon={group.workspaceIcon ?? undefined}
        size={14}
      />
      <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
        <HighlightText text={group.workspaceTitle} indices={titleIndices} />
      </span>
      {group.hibernated ? (
        <span
          role="img"
          aria-label="Workspace is hibernated"
          className="shrink-0"
        >
          <HugeiconsIcon icon={SleepingIcon} size={12} strokeWidth={1.75} />
        </span>
      ) : null}
    </span>
  );
}
