import { useCommandState } from "cmdk";
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
import { useRestoreFocusOnEscape } from "@/modules/command-palette/useRestoreFocusOnEscape";
import { WorkspaceMark } from "@/modules/workspaces/WorkspaceMark";
import {
  ComputerTerminal01Icon,
  GitBranchIcon,
  Home01Icon,
  SleepingIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  filterFolderGroups,
  type FolderGroup,
  type FolderRow,
  type FolderRowMatched,
  type RepoHint,
} from "./lib/folderEntries";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Gives the focus back to the active tab when the palette is closed with Escape. */
  restoreFocus: () => void;
  /** All groups for the open state; the component applies the search. */
  groups: readonly FolderGroup[];
  onPick: (row: FolderRow) => void;
  /** Tab on a row of a repository: add its worktrees that are not listed, or take the added ones away. */
  onToggleWorktrees: (row: FolderRow) => void;
};

export function FolderPalette({
  open,
  onOpenChange,
  restoreFocus,
  groups,
  onPick,
  onToggleWorktrees,
}: Props) {
  const [query, setQuery] = useState("");
  const { contentStyle, handles } = usePaletteWidth();
  const focusHandlers = useRestoreFocusOnEscape(restoreFocus);
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
  const repoOfRow = useMemo(
    () => new Map(filtered.flatMap((g) => g.rows).map((r) => [r.key, r.repoKey] as const)),
    [filtered],
  );

  // The new first row is selected on every keystroke, but a list scrolled down
  // for the previous query stays where it was and hides it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the top whenever the typed text changes or the palette reopens
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[data-slot=scroll-area-viewport]")
      ?.scrollTo({ top: 0 });
  }, [query, open]);

  // Tab acts on the row cmdk has selected, which this palette never controls (a controlled
  // selection made the scroll lag a row); the hints below read it with useCommandState.
  const selectedRowKey = () =>
    listRef.current?.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"]')?.dataset
      .folderRow ?? "";

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const key = selectedRowKey();
    const row = key ? groups.flatMap((g) => g.rows).find((r) => r.key === key) : undefined;
    if (row?.repoKey && row.repoHint) onToggleWorktrees(row);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New terminal folder"
      description="Choose the folder for the new terminal."
      modal={false}
      onFocusOutside={(event) => event.preventDefault()}
      {...focusHandlers}
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
                  {g.rows.map((row, at) => (
                    <Fragment key={row.key}>
                      {startsRepo(g.rows, at) ? (
                        <RepoHeading row={row} repoOfRow={repoOfRow} />
                      ) : null}
                      <CommandItem
                        value={row.key}
                        data-folder-row={row.key}
                        onSelect={() => onPick(row)}
                        className="pl-7 text-[12.5px]"
                      >
                        <HugeiconsIcon
                          icon={ComputerTerminal01Icon}
                          size={13}
                          strokeWidth={2}
                          className="shrink-0 text-muted-foreground"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          <HighlightText text={row.display} indices={row.indices} />
                          {row.branch ? (
                            <span className="font-normal text-muted-foreground">
                              {" \u00b7 "}
                              <HighlightText text={row.branch} indices={row.branchIndices} />
                            </span>
                          ) : null}
                        </span>
                        <RowTail row={row} />
                      </CommandItem>
                    </Fragment>
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

// The first visible row of a repository's folders carries the heading, when the group has one.
function startsRepo(rows: readonly FolderRow[], at: number): boolean {
  const row = rows[at];
  if (row.pinned || !row.headed) return false;
  const before = rows[at - 1];
  return !(before && !before.pinned && before.repoKey === row.repoKey);
}

// The right end of a row: the Tab hint while the row has the focus, otherwise its label.
function RowTail({ row }: { row: FolderRowMatched }) {
  const focused = useCommandState((state) => state.value) === row.key;
  if (focused && row.repoHint) return <HintChip hint={row.repoHint} className="ml-auto" />;
  if (!row.label) return null;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] font-normal text-muted-foreground">
      {row.label === "Home" ? <HugeiconsIcon icon={Home01Icon} size={12} strokeWidth={2} /> : null}
      <HighlightText text={row.label} indices={row.labelIndices} />
    </span>
  );
}

// The heading carries the repository hint while the focus is on a row of another repository.
function RepoHeading({
  row,
  repoOfRow,
}: {
  row: FolderRowMatched;
  repoOfRow: ReadonlyMap<string, string | null>;
}) {
  const focusInside = repoOfRow.get(useCommandState((state) => state.value)) === row.repoKey;
  return (
    <div
      aria-hidden
      className="flex items-center gap-2 pt-2 pr-3 pb-0.5 pl-7 text-[11px] font-medium text-muted-foreground"
    >
      <HugeiconsIcon icon={GitBranchIcon} size={12} strokeWidth={1.75} className="shrink-0" />
      <span className="min-w-0 truncate">
        <HighlightText text={row.repoName ?? ""} indices={row.repoNameIndices} />
      </span>
      {row.repoHint && !focusInside ? <HintChip hint={row.repoHint} className="ml-auto" /> : null}
    </div>
  );
}

function HintChip({ hint, className }: { hint: RepoHint; className?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 text-[11px] font-normal text-muted-foreground ${className ?? ""}`}
    >
      <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px]">Tab</kbd>
      {hint.kind === "show"
        ? `show ${hint.count} ${hint.count === 1 ? "worktree" : "worktrees"}`
        : "hide worktrees"}
    </span>
  );
}
