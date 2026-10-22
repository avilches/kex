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
import { SleepingIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { WorkspaceMark } from "@/modules/workspaces/WorkspaceMark";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  filterFolderGroups,
  folderRowNote,
  type FolderGroup,
  type FolderRow,
} from "./lib/folderEntries";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All groups for the open state; the component applies the search. */
  groups: readonly FolderGroup[];
  onPick: (row: FolderRow) => void;
};

export function FolderPalette({ open, onOpenChange, groups, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Fresh palette on every open: no query from the previous ask.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const filtered = useMemo(
    () => filterFolderGroups(groups, query),
    [groups, query],
  );
  const flat = useMemo(() => filtered.flatMap((g) => g.rows), [filtered]);

  useEffect(() => {
    if (!flat.some((r) => r.key === selectedKey)) {
      setSelectedKey(flat[0]?.key ?? "");
    }
  }, [flat, selectedKey]);

  // The new first row is selected on every keystroke, but a list scrolled down
  // for the previous query stays where it was and hides it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the top whenever the typed text changes or the palette reopens
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[data-slot=scroll-area-viewport]")
      ?.scrollTo({ top: 0 });
  }, [query, open]);

  const empty = flat.length === 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New terminal folder"
      description="Choose the folder for the new terminal."
      modal={false}
      onFocusOutside={(event) => event.preventDefault()}
      className="w-[min(720px,calc(100vw-32px))] sm:max-w-[min(720px,calc(100vw-32px))]"
    >
      <Command
        shouldFilter={false}
        loop
        value={selectedKey}
        onValueChange={setSelectedKey}
      >
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
                  heading={<GroupHeading group={g} />}
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
                        <HighlightText text={row.path} indices={row.indices} />
                      </span>
                      <span className="ml-auto max-w-56 shrink-0 truncate text-[11px] font-normal text-muted-foreground">
                        {folderRowNote(row)}
                      </span>
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

function GroupHeading({ group }: { group: FolderGroup }) {
  return (
    <span className="flex items-center gap-2">
      <WorkspaceMark
        id={group.workspaceId}
        color={group.workspaceColor}
        icon={group.workspaceIcon ?? undefined}
        size={14}
      />
      <span className="min-w-0 truncate text-foreground">
        {group.workspaceTitle}
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
      {group.active ? (
        <span className="ml-auto shrink-0 font-normal">Current workspace</span>
      ) : null}
    </span>
  );
}
