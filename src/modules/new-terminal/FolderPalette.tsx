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
import { RowTag, type RowTagKind } from "@/modules/command-palette/RowTag";
import {
  SleepingIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";
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

function rowTagKind(row: FolderRow): RowTagKind {
  if (row.label === "Workspace root") return "Workspace";
  if (row.label === "Main checkout") return "Git";
  if (!row.kind) return "Terminal";
  if (row.kind === "terminal") return row.agent ? "Agent" : "Terminal";
  if (row.kind === "editor" || row.kind === "markdown") return "File";
  if (row.kind === "browser") return "Browser";
  return "Git";
}

export function FolderPalette({ open, onOpenChange, groups, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState("");

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
        <ScrollArea className="max-h-[420px] [&_[data-slot=scroll-area-viewport]>div]:block!">
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
                      onSelect={() => onPick(row)}
                      className={cn(
                        "text-[12.5px]",
                        row.hibernated && "opacity-60",
                      )}
                    >
                      <RowTag kind={rowTagKind(row)} />
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
