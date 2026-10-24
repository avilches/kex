import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { pathBasename } from "@/lib/pathUtils";
import { cn } from "@/lib/utils";
import { type BarItem, paletteActions } from "@/modules/actions/lib/actionsBar";
import { useActionsBarModel } from "@/modules/actions/lib/useActionsBar";
import { copyToClipboard } from "@/modules/explorer/lib/contextActions";
import { fileIconUrl } from "@/modules/explorer/lib/iconResolver";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { getShortcutLabel } from "@/modules/shortcuts";
import { listBuiltinThemes, useTheme } from "@/modules/theme";
import { WorkspaceMark } from "@/modules/workspaces/WorkspaceMark";
import {
  Add01Icon,
  AlertCircleIcon,
  ArrowTurnBackwardIcon,
  CommandIcon,
  SleepingIcon,
  TerminalIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCommandHistory } from "./hooks/useCommandHistory";
import {
  CONTENT_SEARCH_MIN_QUERY,
  useContentSearch,
} from "./hooks/useContentSearch";
import type { ClosedTabEntry } from "./lib/closedEntries";
import { commandChoice } from "./lib/commandChoice";
import { fuzzyBest } from "./lib/fuzzy";
import { learnedSnapshot, recordChoice } from "./lib/learned";
import { actionRowKey, mergeRows } from "./lib/mergeRows";
import { MODE_HINTS, parseQuery } from "./lib/mode";
import { mruSnapshot, recordUse } from "./lib/mru";
import { commandRowKey } from "./lib/rankCommands";
import type { TabEntry, WorkspaceEntry } from "./lib/tabEntries";
import { tabRowKey, workspaceRowKey } from "./lib/tabRank";
import { type TerminalTarget, terminalTargetOf } from "./lib/terminalTarget";
import { enterHintOf } from "./lib/enterHint";
import { registerPaletteControl } from "./lib/paletteControl";
import {
  actionMenuItems,
  closedMenuItems,
  highlightedActionOf,
  highlightedClosedOf,
  highlightedTabOf,
  type RowMenuItemId,
  tabEntryCopyPath,
  tabMenuItems,
} from "./lib/rowMenu";
import { anchorOf, keepInputFocus, RowMenu, useRowMenu } from "./RowMenu";
import { MergedList } from "./MergedList";
import { PALETTE_WIDTH_CLASS, usePaletteWidth } from "./PaletteWidth";
import { useRestoreFocusOnEscape } from "./useRestoreFocusOnEscape";
import type { PaletteItem } from "./types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Gives the focus back to the active tab when the palette is closed with Escape. */
  restoreFocus: () => void;
  initialMode?: "commands" | "content";
  commandItems: PaletteItem[];
  /** The active workspace while the palette is open (null otherwise): the Actions it lists are the Header's. */
  actionsWorkspace: Parameters<typeof useActionsBarModel>[0]["workspace"];
  onRunAction: (item: BarItem) => void;
  onStopAction: (item: BarItem) => void;
  onEditAction: (item: BarItem) => void;
  workspaceRoot: string | null;
  onOpenContentHit: (path: string, line: number) => void;
  insertCommand: ((cmd: string) => void) | null;
  activeTabId: string | null;
  activeWorkspaceId: string;
  tabEntries: TabEntry[];
  workspaceEntries: WorkspaceEntry[];
  closedEntries: ClosedTabEntry[];
  onSelectTab: (entry: TabEntry) => void;
  onSelectWorkspace: (entry: WorkspaceEntry) => void;
  onRunClosed: (entry: ClosedTabEntry) => void;
  onMoveActiveTabToWorkspace: (target: string | "new") => void;
  onTerminalTargetChange: (target: TerminalTarget | null) => void;
  onOpenTerminalAt: (target: TerminalTarget) => void;
  onCloseTab: (entry: TabEntry) => void | Promise<unknown>;
};

const THEME_PREVIEW_DELAY_MS = 140;

// cmdk overrides the rendered input's id attribute, so helpers that focus or select the palette
// input query it by its cmdk marker instead of by id. The folder palette's input carries the same
// marker and is still in the page while it closes, so this palette's own attribute is part of the query.
const PALETTE_INPUT_SELECTOR = '[cmdk-input=""][data-palette="command"]';

function paletteInputElement(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(PALETTE_INPUT_SELECTOR);
}

let lastContentQuery = "";
let lastContentValue = "";
let lastContentScrollTop = 0;

export function CommandPalette({
  open,
  onOpenChange,
  restoreFocus,
  initialMode,
  commandItems,
  actionsWorkspace,
  onRunAction,
  onStopAction,
  onEditAction,
  workspaceRoot,
  onOpenContentHit,
  insertCommand,
  activeTabId,
  activeWorkspaceId,
  tabEntries,
  workspaceEntries,
  closedEntries,
  onSelectTab,
  onSelectWorkspace,
  onRunClosed,
  onMoveActiveTabToWorkspace,
  onTerminalTargetChange,
  onOpenTerminalAt,
  onCloseTab,
}: Props) {
  const [query, setQuery] = useState("");
  const barModel = useActionsBarModel({ workspace: open ? actionsWorkspace : null });
  const actionItems = useMemo(() => paletteActions(barModel), [barModel]);
  const { contentStyle, handles } = usePaletteWidth();
  const focusHandlers = useRestoreFocusOnEscape(restoreFocus);
  const [value, setValue] = useState("");
  const [page, setPage] = useState<"root" | "themes" | "workspaces">("root");
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const { themeId, customThemes, setThemeId, previewThemeId } = useTheme();

  const parsed = parseQuery(query);
  const inThemes = page === "themes";
  const inWorkspaces = page === "workspaces";
  const inSubpage = inThemes || inWorkspaces;
  const themeFilter = inThemes ? query.trim() : "";
  const workspaceFilter = inWorkspaces ? query.trim() : "";

  const content = useContentSearch(
    workspaceRoot,
    parsed.term,
    open && !inSubpage && parsed.mode === "content",
  );
  const history = useCommandHistory(
    parsed.term,
    open && !inSubpage && parsed.mode === "history",
  );

  const mru = useMemo(() => (open ? mruSnapshot() : {}), [open]);
  const learned = useMemo(() => (open ? learnedSnapshot() : {}), [open]);

  const inCommands = !inThemes && parsed.mode === "commands";
  const merged = useMemo(
    () =>
      inCommands
        ? mergeRows({
            commands: commandItems,
            actions: actionItems,
            tabs: tabEntries,
            workspaces: workspaceEntries,
            closed: closedEntries,
            term: parsed.term,
            activeTabId,
            learned,
            mru,
          })
        : [],
    [
      inCommands,
      commandItems,
      actionItems,
      tabEntries,
      workspaceEntries,
      closedEntries,
      parsed.term,
      activeTabId,
      learned,
      mru,
    ],
  );
  const terminalTarget = useMemo(
    () => (open && inCommands ? terminalTargetOf(value, merged) : null),
    [open, inCommands, value, merged],
  );
  const footerEnterHint = inCommands ? enterHintOf(value, merged) : "Select";
  const highlightedClosed = useMemo(
    () => (open && inCommands ? highlightedClosedOf(value, merged) : null),
    [open, inCommands, value, merged],
  );
  const highlightedAction = useMemo(
    () => (open && inCommands ? highlightedActionOf(value, merged) : null),
    [open, inCommands, value, merged],
  );
  const highlightedTab = useMemo(
    () => (open && inCommands ? highlightedTabOf(value, merged) : null),
    [open, inCommands, value, merged],
  );
  const rowMenu = useRowMenu();
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    onTerminalTargetChange(terminalTarget);
    return () => onTerminalTargetChange(null);
  }, [terminalTarget, onTerminalTargetChange]);

  // The new first row is selected on every keystroke, but a list scrolled down for the
  // previous query stays where it was and hides it.
  const listRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the top whenever the typed text changes
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')
      ?.scrollTo({ top: 0 });
  }, [query]);

  const themes = useMemo(() => {
    if (!inThemes) return [];
    const all = [...listBuiltinThemes(), ...customThemes];
    const q = themeFilter.toLowerCase();
    if (!q) return all;
    return all
      .map((t) => ({ t, s: fuzzyBest(q, [t.name, t.id]) }))
      .filter((x) => x.s !== null)
      .sort((a, b) => (b.s ?? 0) - (a.s ?? 0))
      .map((x) => x.t);
  }, [inThemes, themeFilter, customThemes]);

  const workspaceTargets = useMemo(() => {
    if (!inWorkspaces) return [];
    const others = workspaceEntries.filter(
      (e) => e.workspaceId !== activeWorkspaceId,
    );
    const q = workspaceFilter.toLowerCase();
    if (!q) return others;
    return others
      .map((e) => ({ e, s: fuzzyBest(q, [e.title]) }))
      .filter((x) => x.s !== null)
      .sort((a, b) => (b.s ?? 0) - (a.s ?? 0))
      .map((x) => x.e);
  }, [inWorkspaces, workspaceFilter, workspaceEntries, activeWorkspaceId]);

  const resetPalette = useCallback(() => {
    if (parsed.mode === "content") {
      lastContentQuery = query;
      lastContentValue = value;
      lastContentScrollTop =
        listRef.current?.querySelector<HTMLElement>(
          '[data-slot="scroll-area-viewport"]',
        )?.scrollTop ?? 0;
    }
    setQuery("");
    setValue("");
    setPage("root");
    previewThemeId(null);
  }, [previewThemeId, parsed.mode, query, value]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetPalette();
      onOpenChange(next);
    },
    [onOpenChange, resetPalette],
  );

  const contentRestoredRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    let restored = false;
    if (initialMode === "content" && lastContentQuery.startsWith("#")) {
      setQuery(lastContentQuery);
      setValue(lastContentValue);
      restored = true;
    } else {
      setQuery(initialMode === "content" ? "#" : "");
      setPage("root");
    }
    contentRestoredRef.current = restored;
    const handle = window.setTimeout(() => {
      paletteInputElement()?.focus();
      if (!restored) return;
      // The restored query is selected only once it reached the DOM: the
      // re-render carrying it may still be queued behind this timer, and
      // assigning the value afterwards would wipe an earlier selection.
      // The selection covers the search term but not the leading # sigil,
      // so typing replaces just the term.
      requestAnimationFrame(() => {
        const input = paletteInputElement();
        if (input && input.value === lastContentQuery && input.value.length > 1) {
          input.setSelectionRange(1, input.value.length);
        }
      });
    }, 0);
    return () => window.clearTimeout(handle);
  }, [open, initialMode]);

  // Applies the captured scroll offset once the restored query produced its
  // results again, so the visible slice matches the previous session.
  useEffect(() => {
    if (!open || !contentRestoredRef.current) return;
    if (content.loading || content.results.length === 0) return;
    const viewport = listRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    viewport?.scrollTo({ top: lastContentScrollTop });
  }, [open, content.loading, content.results.length]);

  useEffect(() => {
    if (!open) return;
    if (!inThemes || !value.startsWith("theme:")) return;
    const id = value.slice("theme:".length);
    if (id === "back") return;
    const handle = window.setTimeout(
      () => previewThemeId(id),
      THEME_PREVIEW_DELAY_MS,
    );
    return () => window.clearTimeout(handle);
  }, [open, value, inThemes, previewThemeId]);

  const runAfterClose = useCallback(
    (fn: () => void) => {
      // A handler that skips text inputs would otherwise see the palette input still focused.
      (document.activeElement as HTMLElement | null)?.blur?.();
      handleOpenChange(false);
      window.setTimeout(fn, 0);
    },
    [handleOpenChange],
  );

  const enterThemes = useCallback(() => {
    setPage("themes");
    setQuery("");
    setValue("");
  }, []);

  const exitThemes = useCallback(() => {
    previewThemeId(null);
    setPage("root");
    setQuery("");
    setValue("");
  }, [previewThemeId]);

  const enterWorkspaces = useCallback(() => {
    setPage("workspaces");
    setQuery("");
    setValue("");
  }, []);

  const exitWorkspaces = useCallback(() => {
    setPage("root");
    setQuery("");
    setValue("");
  }, []);

  const runCommand = useCallback(
    (item: PaletteItem) => {
      const choice = commandChoice(item);
      if (choice.action === "none") return;
      if (choice.learn) recordChoice(parsed.term, commandRowKey(item.id));
      if (choice.action === "themes") return enterThemes();
      if (choice.action === "workspaces") return enterWorkspaces();
      if (choice.action === "content") return setQuery("#");
      if (choice.action === "history") return setQuery(">");
      recordUse(item.id);
      runAfterClose(item.run);
    },
    [enterThemes, enterWorkspaces, runAfterClose, parsed.term],
  );

  const openContent = useCallback(
    (path: string, line: number) => {
      onOpenContentHit(path, line);
      window.setTimeout(() => {
        paletteInputElement()?.focus();
      }, 0);
    },
    [onOpenContentHit],
  );

  const runHistory = useCallback(
    (cmd: string) => {
      if (!insertCommand) return;
      runAfterClose(() => insertCommand(cmd));
    },
    [insertCommand, runAfterClose],
  );

  const { close: closeRowMenu, open: openRowMenu } = rowMenu;
  // The close-confirmation dialog returns the focus to the page when it unmounts, after the close
  // promise has settled, so the palette claims it again once that has happened.
  const refocusInput = useCallback(() => {
    for (const delay of [0, 250]) {
      window.setTimeout(() => {
        const input = paletteInputElement();
        if (input && document.activeElement !== input) input.focus();
      }, delay);
    }
  }, []);
  const runTabAction = useCallback(
    (id: RowMenuItemId, entry: TabEntry) => {
      closeRowMenu();
      if (id === "go") {
        recordChoice(parsed.term, tabRowKey(entry.tabId));
        runAfterClose(() => onSelectTab(entry));
      } else if (id === "terminal") {
        const target = terminalTargetOf(`tab:${entry.tabId}`, merged);
        if (target) onOpenTerminalAt(target);
      } else if (id === "copy") {
        const path = tabEntryCopyPath(entry);
        if (path) runAfterClose(() => void copyToClipboard(path, "Copied absolute path"));
      } else if (id === "close") {
        void Promise.resolve(onCloseTab(entry)).then(refocusInput);
      }
    },
    [closeRowMenu, parsed.term, runAfterClose, onSelectTab, merged, onOpenTerminalAt, onCloseTab],
  );

  const runClosedAction = useCallback(
    (id: RowMenuItemId, entry: ClosedTabEntry) => {
      closeRowMenu();
      if (id === "go") {
        runAfterClose(() => onRunClosed(entry));
      } else if (id === "copy" && entry.path) {
        const path = entry.path;
        runAfterClose(() => void copyToClipboard(path, "Copied absolute path"));
      }
    },
    [closeRowMenu, runAfterClose, onRunClosed],
  );

  const openClosedMenu = useCallback(
    (
      entry: ClosedTabEntry,
      row: Element | null | undefined,
      pointer?: { clientX: number; clientY: number },
    ) => {
      const box = boxRef.current;
      if (!box || !row) return;
      openRowMenu(
        entry.key,
        closedMenuItems(entry),
        anchorOf(box, row as HTMLElement, pointer),
      );
    },
    [openRowMenu],
  );

  const runActionRow = useCallback(
    (id: RowMenuItemId, item: BarItem) => {
      closeRowMenu();
      if (id === "run") {
        recordChoice(parsed.term, actionRowKey(item.id));
        runAfterClose(() => onRunAction(item));
      } else if (id === "stop") {
        runAfterClose(() => onStopAction(item));
      } else if (id === "edit") {
        runAfterClose(() => onEditAction(item));
      }
    },
    [closeRowMenu, parsed.term, runAfterClose, onRunAction, onStopAction, onEditAction],
  );

  const openActionMenu = useCallback(
    (
      item: BarItem,
      row: Element | null | undefined,
      pointer?: { clientX: number; clientY: number },
    ) => {
      const box = boxRef.current;
      if (!box || !row) return;
      openRowMenu(
        actionRowKey(item.id),
        actionMenuItems(item),
        anchorOf(box, row as HTMLElement, pointer),
      );
    },
    [openRowMenu],
  );

  const openTabMenu = useCallback(
    (
      entry: TabEntry,
      row: Element | null | undefined,
      pointer?: { clientX: number; clientY: number },
    ) => {
      const box = boxRef.current;
      if (!box || !row) return;
      openRowMenu(
        `tab:${entry.tabId}`,
        tabMenuItems(entry),
        anchorOf(box, row as HTMLElement, pointer),
      );
    },
    [openRowMenu],
  );

  const latestShortcut = useRef({ highlightedTab, runTabAction });
  latestShortcut.current = { highlightedTab, runTabAction };
  // Cmd+W and Cmd+Shift+C act on the highlighted tab; Cmd+T keeps opening the terminal beside it.
  useEffect(() => {
    if (!open) return;
    return registerPaletteControl((action) => {
      if (action === "newTab") return false;
      const { highlightedTab: entry, runTabAction: run } = latestShortcut.current;
      if (entry) run(action === "closeTab" ? "close" : "copy", entry);
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

  const commitTheme = useCallback(
    (id: string) => {
      setThemeId(id);
      handleOpenChange(false);
    },
    [setThemeId, handleOpenChange],
  );

  // Radix listens for Escape on document capture, before React handlers, so the
  // subpage has to intercept it earlier to go back instead of closing the palette.
  useEffect(() => {
    if (!open || !inSubpage) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (inThemes) exitThemes();
      else exitWorkspaces();
    };
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  }, [open, inSubpage, inThemes, exitThemes, exitWorkspaces]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (rowMenu.menu) {
        const key = rowMenu.menu.rowKey;
        const entry = highlightedTabOf(key, merged);
        const closed = highlightedClosedOf(key, merged);
        const action = highlightedActionOf(key, merged);
        const run = (item: { id: RowMenuItemId }) => {
          if (entry) runTabAction(item.id, entry);
          else if (closed) runClosedAction(item.id, closed);
          else if (action) runActionRow(item.id, action);
        };
        if (rowMenu.handleKey(e, run)) return;
      }
      if (e.key === "Tab" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
        if (inSubpage || !inCommands) return;
        e.preventDefault();
        const row = boxRef.current?.querySelector('[cmdk-item][aria-selected="true"]');
        if (highlightedTab) openTabMenu(highlightedTab, row);
        else if (highlightedClosed) openClosedMenu(highlightedClosed, row);
        else if (highlightedAction) openActionMenu(highlightedAction, row);
        return;
      }
      if (!inSubpage) return;
      if (e.key === "Backspace" && query.length === 0) {
        e.preventDefault();
        e.stopPropagation();
        if (inThemes) exitThemes();
        else exitWorkspaces();
      }
    },
    [
      inSubpage,
      inThemes,
      inCommands,
      query,
      exitThemes,
      exitWorkspaces,
      rowMenu,
      merged,
      runTabAction,
      runClosedAction,
      highlightedTab,
      highlightedClosed,
      highlightedAction,
      openTabMenu,
      openClosedMenu,
      openActionMenu,
      runActionRow,
    ],
  );

  const placeholder = inThemes
    ? "Search themes..."
    : inWorkspaces
      ? "Search workspaces..."
      : parsed.mode === "content"
        ? "Find text in files..."
        : parsed.mode === "history"
          ? "Search command history..."
          : "Type a command, tab or workspace, > for history, # to find in files";

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Command Palette"
      description="Run a command, switch theme, or search your workspace."
      modal={false}
      onFocusOutside={(event) => event.preventDefault()}
      {...focusHandlers}
      className={PALETTE_WIDTH_CLASS}
      contentStyle={contentStyle}
    >
      {handles}
      <Command
        shouldFilter={false}
        loop
        value={value}
        onValueChange={setValue}
        onKeyDown={onKeyDown}
      >
        <CommandInput
          id="kex-command-palette-input"
          data-palette="command"
          value={query}
          onValueChange={setQuery}
          placeholder={placeholder}
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
            {inThemes ? (
              <CommandGroup heading="Themes">
                <CommandItem
                  value="theme:back"
                  onSelect={exitThemes}
                  className="text-[12.5px]"
                >
                  <HugeiconsIcon
                    icon={ArrowTurnBackwardIcon}
                    size={14}
                    strokeWidth={1.75}
                  />
                  <span>Back</span>
                </CommandItem>
                {themes.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={`theme:${t.id}`}
                    onSelect={() => commitTheme(t.id)}
                    className="text-[12.5px]"
                  >
                    <span className="truncate">{t.name}</span>
                    {t.id === themeId ? (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        size={14}
                        strokeWidth={2}
                        className="ml-auto text-muted-foreground"
                      />
                    ) : null}
                  </CommandItem>
                ))}
                {themes.length === 0 ? <StatusItem label="No themes" /> : null}
              </CommandGroup>
            ) : inWorkspaces ? (
              <CommandGroup heading="Move tab to workspace">
                <CommandItem
                  value="move-workspace:back"
                  onSelect={exitWorkspaces}
                  className="text-[12.5px]"
                >
                  <HugeiconsIcon
                    icon={ArrowTurnBackwardIcon}
                    size={14}
                    strokeWidth={1.75}
                  />
                  <span>Back</span>
                </CommandItem>
                <CommandItem
                  value="move-workspace:new"
                  onSelect={() =>
                    runAfterClose(() => onMoveActiveTabToWorkspace("new"))
                  }
                  className="text-[12.5px]"
                >
                  <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
                  <span>New workspace</span>
                </CommandItem>
                {workspaceTargets.map((entry) => (
                  <CommandItem
                    key={entry.workspaceId}
                    value={`move-workspace:${entry.workspaceId}`}
                    onSelect={() =>
                      runAfterClose(() =>
                        onMoveActiveTabToWorkspace(entry.workspaceId),
                      )
                    }
                    className="text-[12.5px]"
                  >
                    <WorkspaceMark
                      id={entry.workspaceId}
                      color={entry.color}
                      icon={entry.icon ?? undefined}
                      size={14}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {entry.title}
                    </span>
                    {entry.hibernated ? (
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
                  </CommandItem>
                ))}
                {workspaceTargets.length === 0 ? (
                  <StatusItem label="No other workspaces" />
                ) : null}
              </CommandGroup>
            ) : parsed.mode === "commands" ? (
              merged.length === 0 ? (
                <EmptyHint />
              ) : (
                <MergedList
                  rows={merged}
                  typing={parsed.term.length > 0}
                  term={parsed.term}
                  userShortcuts={userShortcuts}
                  onRunCommand={runCommand}
                  onRunTab={(entry) => {
                    recordChoice(parsed.term, tabRowKey(entry.tabId));
                    runAfterClose(() => onSelectTab(entry));
                  }}
                  onRunWorkspace={(entry) => {
                    recordChoice(
                      parsed.term,
                      workspaceRowKey(entry.workspaceId),
                    );
                    runAfterClose(() => onSelectWorkspace(entry));
                  }}
                  onRunClosed={(entry) =>
                    runAfterClose(() => onRunClosed(entry))
                  }
                  onRunAction={(item) => runActionRow("run", item)}
                  onContextMenuAction={(item, e) => {
                    e.preventDefault();
                    setValue(actionRowKey(item.id));
                    openActionMenu(item, e.currentTarget, e);
                  }}
                  onContextMenuClosed={(entry, e) => {
                    e.preventDefault();
                    setValue(entry.key);
                    openClosedMenu(entry, e.currentTarget, e);
                  }}
                  onContextMenuTab={(entry, e) => {
                    e.preventDefault();
                    setValue(`tab:${entry.tabId}`);
                    openTabMenu(entry, e.currentTarget, e);
                  }}
                />
              )
            ) : parsed.mode === "content" ? (
              <CommandGroup heading="Contents">
                {!workspaceRoot ? (
                  <StatusItem label="No workspace root" />
                ) : parsed.term.length < CONTENT_SEARCH_MIN_QUERY ? (
                  <StatusItem label="Type at least 2 characters" />
                ) : (
                  <AsyncBody
                    loading={content.loading}
                    error={content.error}
                    empty={content.results.length === 0}
                    emptyLabel="No matches"
                    onRetry={content.retry}
                  >
                    {content.results.map((hit) => (
                      <CommandItem
                        key={`${hit.path}:${hit.line}`}
                        value={`content:${hit.path}:${hit.line}`}
                        onSelect={() => openContent(hit.path, hit.line)}
                        className="text-[12.5px]"
                      >
                        <img
                          src={fileIconUrl(pathBasename(hit.rel))}
                          alt=""
                          className="size-4 shrink-0"
                        />
                        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">
                          {hit.text.trim()}
                        </span>
                        <span className="ml-auto max-w-64 shrink-0 truncate text-[11px] font-normal text-muted-foreground">
                          {hit.rel}:{hit.line}
                        </span>
                      </CommandItem>
                    ))}
                  </AsyncBody>
                )}
              </CommandGroup>
            ) : parsed.mode === "history" ? (
              <CommandGroup heading="Command history">
                {!insertCommand ? (
                  <StatusItem label="Open a terminal to run history" />
                ) : (
                  <AsyncBody
                    loading={history.loading}
                    error={history.error}
                    empty={history.results.length === 0}
                    emptyLabel="No history"
                    onRetry={history.retry}
                  >
                    {history.results.map((cmd) => (
                      <CommandItem
                        key={`hist:${cmd}`}
                        value={`hist:${cmd}`}
                        onSelect={() => runHistory(cmd)}
                        className="text-[12.5px]"
                      >
                        <HugeiconsIcon
                          icon={TerminalIcon}
                          size={14}
                          strokeWidth={1.75}
                          className="text-muted-foreground"
                        />
                        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">
                          {cmd}
                        </span>
                      </CommandItem>
                    ))}
                  </AsyncBody>
                )}
              </CommandGroup>
            ) : (
              <CommandGroup heading="Search modes">
                {MODE_HINTS.map((hint) => (
                  <CommandItem
                    key={hint.sigil}
                    value={`hint:${hint.sigil}`}
                    onSelect={() => setQuery(hint.sigil)}
                    className="text-[12.5px]"
                  >
                    <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                      {hint.sigil}
                    </kbd>
                    <span>{hint.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </ScrollArea>
        {rowMenu.menu ? (
          <RowMenu
            menu={rowMenu.menu}
            onRun={(id) => {
              const key = rowMenu.menu?.rowKey ?? "";
              const entry = highlightedTabOf(key, merged);
              const closed = highlightedClosedOf(key, merged);
              const action = highlightedActionOf(key, merged);
              if (entry) runTabAction(id, entry);
              else if (closed) runClosedAction(id, closed);
              else if (action) runActionRow(id, action);
            }}
            onActive={(active) => rowMenu.setActive(active)}
          />
        ) : null}
        </div>
        <div className="flex min-w-0 items-center gap-3 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className="flex shrink-0 items-center gap-1.5">
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px]">
              {"\u21b5"}
            </kbd>
            {footerEnterHint}
          </span>
          {terminalTarget ? (
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <kbd className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px]">
                {getShortcutLabel("tab.new", userShortcuts) ?? "New tab"}
              </kbd>
              <span className="shrink-0">Open terminal</span>
              <span className="min-w-0 truncate font-mono text-[10.5px]">
                {terminalTarget.cwd}
              </span>
            </span>
          ) : (
            <span className="flex-1" />
          )}
          {highlightedTab || highlightedClosed || highlightedAction ? (
            <span className="flex shrink-0 items-center gap-1.5">
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px]">
                Tab
              </kbd>
              Menu
            </span>
          ) : null}
        </div>
      </Command>
    </CommandDialog>
  );
}

function AsyncBody({
  loading,
  error,
  empty,
  emptyLabel,
  onRetry,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyLabel: string;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (error) {
    return (
      <>
        <StatusItem label="Search failed" tone="error" />
        <CommandItem value="retry" onSelect={onRetry} className="text-[12.5px]">
          <span>Retry</span>
        </CommandItem>
      </>
    );
  }
  if (empty && loading) return <StatusItem label="Searching..." />;
  if (empty) return <StatusItem label={emptyLabel} />;
  return <>{children}</>;
}

function StatusItem({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "muted" | "error";
}) {
  return (
    <CommandItem
      value={`status:${label}`}
      disabled
      className="text-[12.5px] font-normal"
    >
      {tone === "error" ? (
        <HugeiconsIcon
          icon={AlertCircleIcon}
          size={14}
          strokeWidth={1.75}
          className="text-destructive"
        />
      ) : null}
      <span
        className={
          tone === "error" ? "text-destructive" : "text-muted-foreground"
        }
      >
        {label}
      </span>
    </CommandItem>
  );
}

function EmptyHint() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
      <HugeiconsIcon icon={CommandIcon} size={18} strokeWidth={1.5} />
      <span>No commands found. Type ? to see search modes.</span>
    </div>
  );
}
