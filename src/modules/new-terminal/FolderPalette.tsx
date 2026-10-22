import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { HighlightText } from "@/modules/command-palette/HighlightText";
import { SleepingIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  // Arrows are ours, not cmdk's: the selection can only land on a rendered row
  // (wrapping at the ends) and the row is scrolled into view below.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      e.stopPropagation();
      if (flat.length === 0) return;
      setSelectedKey((prev) => {
        const at = flat.findIndex((r) => r.key === prev);
        const next =
          (at + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length;
        return flat[next].key;
      });
    },
    [flat],
  );

  // scrollIntoView against the Radix ScrollArea is not reliable for rows far
  // from the viewport's current scroll (the cursor used to leave the visible
  // area at both ends), so the viewport is scrolled explicitly.
  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const viewport = root.querySelector<HTMLElement>(
      "[data-slot=scroll-area-viewport]",
    );
    const item = root.querySelector<HTMLElement>(
      `[data-folder-row="${selectedKey}"]`,
    );
    if (!viewport || !item) return;
    const top =
      item.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    if (top < 0) {
      viewport.scrollBy({ top });
    } else if (top + item.offsetHeight > viewport.clientHeight) {
      viewport.scrollBy({ top: top + item.offsetHeight - viewport.clientHeight });
    }
  }, [selectedKey, query, open]);

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
        value={selectedKey}
        onValueChange={setSelectedKey}
        onKeyDown={onKeyDown}
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
                  heading={
                    g.active
                      ? `${g.workspaceTitle} \u00b7 current workspace`
                      : g.workspaceTitle
                  }
                >
                  {g.rows.map((row) => (
                    <CommandItem
                      key={row.key}
                      value={row.key}
                      data-folder-row={row.key}
                      onSelect={() => onPick(row)}
                      className={cn(
                        "text-[12.5px]",
                        row.hibernated && "opacity-60",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <HighlightText text={row.path} indices={row.indices} />
                      </span>
                      {row.hibernated ? (
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
