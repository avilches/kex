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
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { HighlightText } from "@/modules/command-palette/HighlightText";
import { registerPaletteControl } from "@/modules/command-palette/lib/paletteControl";
import { ActionIcon } from "@/modules/actions/ActionIcon";
import { splitActionName } from "@/modules/actions/lib/actionName";
import type { Action } from "@/modules/actions/lib/types";
import type { RunOverlay } from "@/modules/actions/lib/useActionRunner";
import { useFolderRowActions } from "@/modules/actions/lib/useNewTabActions";
import { useActionMenuApi } from "@/modules/actions/RowActionsMenu";
import {
  folderMenuItems,
  type RowMenuItem,
  worktreesLabel,
} from "@/modules/command-palette/lib/rowMenu";
import {
  anchorOf,
  keepInputFocus,
  digitLabel,
  RowMenu,
  useRowMenu,
} from "@/modules/command-palette/RowMenu";
import { copyToClipboard } from "@/modules/explorer/lib/contextActions";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { getShortcutLabel, type ShortcutId } from "@/modules/shortcuts";
import { PALETTE_WIDTH_CLASS, usePaletteWidth } from "@/modules/command-palette/PaletteWidth";
import { useRestoreFocusOnEscape } from "@/modules/command-palette/useRestoreFocusOnEscape";
import type { Workspace } from "@/modules/workspaces/lib/types";
import { WorkspaceMark } from "@/modules/workspaces/WorkspaceMark";
import {
  ComputerTerminal01Icon,
  GitBranchIcon,
  Home01Icon,
  PinIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Fragment,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  filterFolderGroups,
  type FolderGroup,
  type FolderRow,
  type FolderRowLabel,
  type FolderRowMatched,
  type FolderSlot,
  type RepoHint,
} from "./lib/folderEntries";

const SLOT_SHORTCUT = {
  root: "palette.folderRoot",
  main: "palette.folderMain",
  home: "palette.folderHome",
} as const satisfies Record<FolderSlot, ShortcutId>;

const SLOT_LABEL: Record<FolderSlot, FolderRowLabel> = {
  root: "Workspace Root",
  main: "Main checkout",
  home: "Home",
};

const SLOT_ACTION = {
  folderRoot: "root",
  folderMain: "main",
  folderHome: "home",
} as const satisfies Record<string, FolderSlot>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Gives the focus back to the active tab when the palette is closed with Escape. */
  restoreFocus: () => void;
  /** All groups for the open state; the component applies the search. */
  groups: readonly FolderGroup[];
  onPick: (row: FolderRow) => void;
  /** Cmd+K on a row of a repository: add its worktrees that are not listed, or take the added ones away. */
  onToggleWorktrees: (row: FolderRow) => void;
  /** The workspace a row belongs to: its Actions are the ones its menu offers, run there. */
  workspaceOf: (workspaceId: string) => Workspace | undefined;
};

export function FolderPalette({
  open,
  onOpenChange,
  restoreFocus,
  groups,
  onPick,
  onToggleWorktrees,
  workspaceOf,
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

  // The new first row is selected on every keystroke, but a list scrolled down
  // for the previous query stays where it was and hides it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the top whenever the typed text changes or the palette reopens
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[data-slot=scroll-area-viewport]")
      ?.scrollTo({ top: 0 });
  }, [query, open]);

  // The menu and Cmd+K act on the row cmdk has selected, which this palette never controls (a
  // controlled selection made the scroll lag a row); the hints below read it with useCommandState.
  const selectedRowEl = () =>
    listRef.current?.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"]') ?? null;
  const rowOf = useCallback(
    (key: string | undefined) =>
      key ? groups.flatMap((g) => g.rows).find((r) => r.key === key) : undefined,
    [groups],
  );

  const rowMenu = useRowMenu();
  const { close: closeRowMenu, open: openRowMenu } = rowMenu;
  const runAction = useActionMenuApi()?.run;
  const rowActions = useFolderRowActions();
  const menuActions = useRef<{ byId: Map<string, Action>; overlay: RunOverlay | null }>({
    byId: new Map(),
    overlay: null,
  });
  const boxRef = useRef<HTMLDivElement>(null);

  const toggleWorktrees = useCallback(
    (row: FolderRow | undefined) => {
      if (row?.repoKey && row.repoHint) onToggleWorktrees(row);
    },
    [onToggleWorktrees],
  );
  const copyPath = useCallback(
    (row: FolderRow | undefined) => {
      if (!row) return;
      onOpenChange(false);
      void copyToClipboard(row.path, "Copied absolute path");
    },
    [onOpenChange],
  );

  const openMenuOn = (
    row: FolderRow | undefined,
    el: HTMLElement | null,
    pointer?: { clientX: number; clientY: number },
  ) => {
    const box = boxRef.current;
    if (!row || !box || !el) return;
    const { groups: found, overlay } = rowActions(workspaceOf(row.workspaceId), row.path, row.branch);
    const scoped = [
      ...found.workspace.map((entry) => ({ entry, scope: "workspace" as const })),
      ...found.global.map((entry) => ({ entry, scope: "global" as const })),
    ];
    const entries = scoped.map((s) => s.entry);
    menuActions.current = { byId: new Map(entries.map((e) => [e.action.id, e.action])), overlay };
    openRowMenu(
      row.key,
      folderMenuItems({
        path: row.path,
        worktrees: row.repoKey && row.repoHint ? row.repoHint : null,
        actions: scoped.map(({ entry: e, scope }) => ({
          id: e.action.id,
          label: splitActionName(e.action.name).main,
          title: e.title,
          scope,
        })),
      }),
      anchorOf(box, el, pointer),
    );
  };

  const runMenuItem = (id: string, row: FolderRow | undefined, item?: RowMenuItem) => {
    closeRowMenu();
    if (!row) return;
    if (id === "pick") onPick(row);
    else if (id === "worktrees") toggleWorktrees(row);
    else if (id === "copy") copyPath(row);
    else if (id === "action") {
      const action = item?.actionId ? menuActions.current.byId.get(item.actionId) : undefined;
      if (!action || !runAction) return;
      onOpenChange(false);
      runAction(action, menuActions.current.overlay ?? undefined);
    }
  };

  // Cmd+digit runs the Nth Action of the open row menu; with no menu open, 1-3 pick the fixed folders.
  const runDigit = (digit: number) => {
    const menu = rowMenu.menu;
    const item = menu?.items.find((i) => i.digit === digit);
    if (menu && item) runMenuItem(item.id, rowOf(menu.rowKey), item);
  };

  const menuOpen = rowMenu.menu !== null;
  const latest = useRef({ toggleWorktrees, copyPath, rowOf, groups, onPick, runDigit, menuOpen });
  latest.current = { toggleWorktrees, copyPath, rowOf, groups, onPick, runDigit, menuOpen };
  // The global shortcut listener runs first: Cmd+T, Cmd+K and Cmd+Shift+C reach the palette from there.
  useEffect(() => {
    if (!open) return;
    return registerPaletteControl((action, digit, item) => {
      if (action === "closeWorkspace" || action === "newTab") return true;
      // Over a folder row only copying the path means something; the other tab shortcuts are taken without effect.
      if (action === "tabItem" && item !== "copy") return true;
      const byDigit = action === "menuAction" || (latest.current.menuOpen && action in SLOT_ACTION);
      if (byDigit) {
        if (digit) latest.current.runDigit(digit);
        return true;
      }
      const { toggleWorktrees: toggle, copyPath: copy, rowOf: find } = latest.current;
      if (action in SLOT_ACTION) {
        const slot = SLOT_ACTION[action as keyof typeof SLOT_ACTION];
        const fixed = latest.current.groups.flatMap((g) => g.rows).find((r) => r.slots.includes(slot));
        if (fixed) latest.current.onPick(fixed);
        return true;
      }
      if (action === "folderCurrent") {
        const current = latest.current.groups.flatMap((g) => g.rows).find((r) => r.labels.includes("Current tab"));
        if (current) latest.current.onPick(current);
        return true;
      }
      const row = find(selectedRowEl()?.dataset.folderRow);
      if (action === "worktrees") toggle(row);
      else copy(row);
      return true;
    });
  }, [open]);

  useEffect(() => {
    if (!open) closeRowMenu();
  }, [open, closeRowMenu]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: typing closes the menu
  useEffect(() => {
    closeRowMenu();
  }, [query, closeRowMenu]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (rowMenu.menu) {
      const row = rowOf(rowMenu.menu.rowKey);
      if (rowMenu.handleKey(e, (item) => runMenuItem(item.id, row, item))) return;
    }
    if (e.key !== "Tab" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const el = selectedRowEl();
    openMenuOn(rowOf(el?.dataset.folderRow), el);
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
        <KeepHeadingsVisible listRef={listRef} />
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="New terminal in..."
          autoFocus
        />
        <div
          ref={boxRef}
          className={cn("relative", rowMenu.menu && "min-h-[150px]")}
          onMouseDown={keepInputFocus}
          onPointerDownCapture={(e) => {
            if (rowMenu.menu && !(e.target as HTMLElement).closest("[data-row-menu]")) {
              closeRowMenu();
            }
          }}
        >
        <ScrollArea
          ref={listRef}
          className="[&_[data-slot=scroll-area-viewport]]:max-h-[420px] [&_[data-slot=scroll-area-viewport]>div]:block!"
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
                        <RepoHeading row={row} />
                      ) : null}
                      <CommandItem
                        value={row.key}
                        data-folder-row={row.key}
                        onSelect={() => onPick(row)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          openMenuOn(row, e.currentTarget, e);
                        }}
                        className={cn("text-[12.5px]", row.nested ? "pl-12" : "pl-7")}
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
        {rowMenu.menu ? (
          <RowMenu
            menu={rowMenu.menu}
            onRun={(id, item) => runMenuItem(id, rowOf(rowMenu.menu?.rowKey), item)}
            onActive={rowMenu.setActive}
            iconFor={(item) => {
              const action = item.actionId ? menuActions.current.byId.get(item.actionId) : undefined;
              return action ? <ActionIcon action={action} size={14} /> : null;
            }}
          />
        ) : null}
        </div>
        <FolderFooter
          groups={groups}
          agentCount={rowMenu.menu?.items.filter((i) => i.digit).length ?? 0}
        />
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

// cmdk brings the group heading into view when the selected row is the first child of its group,
// but a repository heading sits before the first row, so that rule never fires here: going to the
// top of the list (Home, or wrapping from the last row) would leave the workspace heading hidden.
function KeepHeadingsVisible({ listRef }: { listRef: RefObject<HTMLElement | null> }) {
  const value = useCommandState((state) => state.value);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the selection moves
  useEffect(() => {
    const items = listRef.current?.querySelectorAll<HTMLElement>("[cmdk-item]") ?? [];
    const item = [...items].find((el) => el.dataset.folderRow === value);
    const siblings = [...(item?.parentElement?.children ?? [])];
    if (!item) return;
    const before = siblings.slice(0, siblings.indexOf(item));
    const previous = before[before.length - 1];
    if (previous?.hasAttribute("data-repo-heading")) {
      previous.scrollIntoView?.({ block: "nearest" });
    }
    if (before.every((el) => el.hasAttribute("data-repo-heading"))) {
      item
        .closest("[cmdk-group]")
        ?.querySelector("[cmdk-group-heading]")
        ?.scrollIntoView?.({ block: "nearest" });
    }
  }, [value]);
  return null;
}

// The right end of a row: the Tab hint while the row has the focus, otherwise its label.
function RowTail({ row }: { row: FolderRowMatched }) {
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const focused = useCommandState((state) => state.value) === row.key;
  // The worktrees hint takes the place of the labels while the row has the focus, but a fixed row keeps its keys beside it.
  if (focused && row.repoHint) {
    return (
      <span className="ml-auto flex shrink-0 items-center gap-2">
        <HintChip hint={row.repoHint} />
        {row.labels.includes("Current tab") ? <CurrentKey userShortcuts={userShortcuts} /> : null}
        {row.slots.map((slot) => (
          <SlotKey key={slot} slot={slot} userShortcuts={userShortcuts} />
        ))}
      </span>
    );
  }
  if (row.labels.length === 0) return null;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] font-normal text-muted-foreground">
      {row.labels.map((label, i) => {
        const slot = SLOT_OF_LABEL[label];
        return (
          <span key={label} className="flex items-center gap-1.5">
            <span className="flex items-center gap-1">
              {slot === "home" ? (
                <HugeiconsIcon icon={Home01Icon} size={12} strokeWidth={2} />
              ) : slot === "root" ? (
                <HugeiconsIcon icon={PinIcon} size={12} strokeWidth={2} />
              ) : null}
              <span>
                <HighlightText text={label} indices={row.labelIndices?.[i]} />
              </span>
            </span>
            {slot && row.slots.includes(slot) ? (
              <SlotKey slot={slot} userShortcuts={userShortcuts} />
            ) : null}
            {label === "Current tab" ? <CurrentKey userShortcuts={userShortcuts} /> : null}
          </span>
        );
      })}
    </span>
  );
}

const SLOT_OF_LABEL: Partial<Record<FolderRowLabel, FolderSlot>> = {
  "Workspace Root": "root",
  "Main checkout": "main",
  Home: "home",
};

// The current tab's folder is picked with the new-tab shortcut, which the palette takes over while open.
function CurrentKey({ userShortcuts }: { userShortcuts: Parameters<typeof getShortcutLabel>[1] }) {
  const label = getShortcutLabel("palette.folderCurrent", userShortcuts);
  if (!label) return null;
  return (
    <kbd className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[10.5px] leading-none text-foreground">
      {label}
    </kbd>
  );
}

function SlotKey({
  slot,
  userShortcuts,
}: {
  slot: FolderSlot;
  userShortcuts: Parameters<typeof getShortcutLabel>[1];
}) {
  const label = getShortcutLabel(SLOT_SHORTCUT[slot], userShortcuts);
  if (!label) return null;
  return (
    <kbd className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[10.5px] leading-none text-foreground">
      {label}
    </kbd>
  );
}

// Aligned with the workspace heading above it, the count right after the name; it never changes while worktrees are shown or hidden.
function RepoHeading({ row }: { row: FolderRowMatched }) {
  return (
    <div
      aria-hidden
      data-repo-heading=""
      className="flex items-center gap-2 pt-2 pr-3 pb-0.5 pl-3 text-[11px] font-medium text-muted-foreground"
    >
      <HugeiconsIcon icon={GitBranchIcon} size={12} strokeWidth={1.75} className="shrink-0" />
      <span className="min-w-0 truncate">
        <HighlightText text={row.repoName ?? ""} indices={row.repoNameIndices} />
      </span>
      {row.worktreesLoading ? (
        <span role="status" aria-label="Loading worktrees" className="shrink-0">
          <Spinner size={11} />
        </span>
      ) : row.worktreeCount > 0 ? (
        <span className="shrink-0 font-normal">
          {`${row.worktreeCount} ${row.worktreeCount === 1 ? "worktree" : "worktrees"}`}
        </span>
      ) : null}
    </div>
  );
}

function HintChip({ hint, className }: { hint: RepoHint; className?: string }) {
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 text-[11px] leading-none font-normal text-muted-foreground ${className ?? ""}`}
    >
      <kbd className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[10.5px] leading-none text-foreground">
        {getShortcutLabel("palette.worktrees", userShortcuts) ?? "Worktrees"}
      </kbd>
      {worktreesLabel(hint).toLowerCase()}
    </span>
  );
}

// What each key does on the highlighted row.
function FolderFooter({
  groups,
  agentCount,
}: {
  groups: readonly FolderGroup[];
  /** Agents the open row menu runs with Cmd+digit; they take the keys of the fixed folders. */
  agentCount: number;
}) {
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const value = useCommandState((state) => state.value);
  const all = groups.flatMap((g) => g.rows);
  const row = value ? all.find((r) => r.key === value) : undefined;
  if (!row) return null;
  const kbd = "shrink-0 rounded bg-foreground/15 px-1.5 py-0.5 font-mono text-[10.5px] text-foreground";
  return (
    <div className="flex min-w-0 items-center gap-3 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <kbd className={kbd}>{"\u21b5"}</kbd>
        <span className="shrink-0">Open in Terminal</span>
        <span className="min-w-0 truncate font-mono text-[10.5px]">{row.display}</span>
      </span>
      {row.repoKey && row.repoHint ? (
        <span className="flex shrink-0 items-center gap-1.5">
          <kbd className={kbd}>{getShortcutLabel("palette.worktrees", userShortcuts) ?? "Worktrees"}</kbd>
          {worktreesLabel(row.repoHint)}
        </span>
      ) : null}
      {agentCount > 0 ? (
        <span className="flex shrink-0 items-center gap-1.5">
          <kbd className={kbd}>
            {agentCount === 1
              ? digitLabel(userShortcuts, 1)
              : `${digitLabel(userShortcuts, 1)}\u2013${agentCount}`}
          </kbd>
          Run agent
        </span>
      ) : null}
      {agentCount === 0 && all.some((r) => r.labels.includes("Current tab")) ? (
        <span className="flex shrink-0 items-center gap-1.5">
          <kbd className={kbd}>{getShortcutLabel("palette.folderCurrent", userShortcuts)}</kbd>
          Current tab
        </span>
      ) : null}
      {(agentCount > 0 ? [] : (["root", "main", "home"] as const)).map((slot) => {
        const fixed = all.find((r) => r.slots.includes(slot));
        if (!fixed) return null;
        return (
          <span key={slot} className="flex shrink-0 items-center gap-1.5">
            <kbd className={kbd}>{getShortcutLabel(SLOT_SHORTCUT[slot], userShortcuts)}</kbd>
            {SLOT_LABEL[slot]}
          </span>
        );
      })}
      <span className="flex shrink-0 items-center gap-1.5">
        <kbd className={kbd}>Tab</kbd>
        Menu
      </span>
    </div>
  );
}
