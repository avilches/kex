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
import { isTabNoteOpen, removeTabNote, toggleTabNote } from "@/modules/workspaces/lib/tabNote";
import { flushTabNote } from "@/modules/workspaces/lib/tabNoteStore";
import { toggleTabLock } from "@/modules/workspaces/lib/tabLock";
import { isAutofocusTab, type Tab } from "@/modules/workspaces/lib/types";
import {
  Add01Icon,
  AlertCircleIcon,
  ArrowTurnBackwardIcon,
  CommandIcon,
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
import { COMMAND_GROUPS } from "./commands";
import { displayOrder, successorOf } from "./lib/closeSuccessor";
import { initialKey } from "./lib/initialKey";
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
  highlightedWorkspaceOf,
  otherTabRowKeys,
  runnableTabItem,
  type RowMenuItemId,
  tabEntryCopyPath,
  tabEntryRelativePath,
  tabFocusTarget,
  tabItemKeepsPalette,
  tabMenuItems,
  workspaceIdOfRow,
  workspaceMenuItems,
  workspaceRowKeys,
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
  initialMode?: "commands" | "content" | "history";
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
  onMoveTabToWorkspace: (
    subject: MoveSubject,
    target: string | "new",
  ) => void;
  onUpdateTab: (tabId: string, updater: (tab: Tab) => Tab) => void;
  onSaveTab: (tabId: string) => void;
  /** Unlike the shortcut, it must not focus the tab: the palette keeps the focus. */
  onToggleTabHibernate: (tabId: string) => unknown;
  /** The review dialog takes the focus, and the palette claims it back when it goes. */
  hibernateDialogOpen: boolean;
  onRevealInExplorer: (path: string) => void;
  onCloseOtherTabs: (tabId: string) => unknown;
  onGoToTab: (tabId: string) => void;
  onTerminalTargetChange: (target: TerminalTarget | null) => void;
  onOpenTerminalAt: (target: TerminalTarget) => void;
  // biome-ignore lint/suspicious/noConfusingVoidType: callers may return nothing or a promise
  onCloseTab: (entry: TabEntry) => void | Promise<unknown>;
  /** Resolves once the workspace is closed (true) or the close was cancelled or refused (false). */
  onCloseWorkspace: (workspaceId: string) => Promise<boolean>;
  onRenameWorkspace: (workspaceId: string) => void;
  onHibernateWorkspace: (workspaceId: string) => void;
  onCloseAllTabs: (workspaceId: string) => void;
  onOpenWorkspaceSettings: (workspaceId: string) => void;
};

/** The tab "Move tab to workspace" moves: the highlighted row's, or the active one's for the command. */
export type MoveSubject = { tabId: string; workspaceId: string };

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

const SELECTION_KEYS = new Set(["ArrowUp", "ArrowDown", "Home", "End"]);

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
  onMoveTabToWorkspace,
  onUpdateTab,
  onSaveTab,
  onToggleTabHibernate,
  hibernateDialogOpen,
  onRevealInExplorer,
  onCloseOtherTabs,
  onGoToTab,
  onTerminalTargetChange,
  onOpenTerminalAt,
  onCloseTab,
  onCloseWorkspace,
  onRenameWorkspace,
  onHibernateWorkspace,
  onCloseAllTabs,
  onOpenWorkspaceSettings,
}: Props) {
  const [query, setQuery] = useState("");
  const barModel = useActionsBarModel({ workspace: open ? actionsWorkspace : null });
  const actionItems = useMemo(() => paletteActions(barModel), [barModel]);
  const { contentStyle, handles } = usePaletteWidth();
  const focusHandlers = useRestoreFocusOnEscape(restoreFocus);
  const [pickedValue, setValue] = useState("");
  const [page, setPage] = useState<"root" | "themes" | "workspaces">("root");
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const autofocusMode = usePreferencesStore((s) => s.autofocusMode);
  const [moveSubject, setMoveSubject] = useState<MoveSubject | null>(null);
  const [moveFromRow, setMoveFromRow] = useState(false);
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

  const actionsOnly = parsed.mode === "actions";
  const inCommands = !inThemes && (parsed.mode === "commands" || actionsOnly);
  const merged = useMemo(
    () =>
      inCommands
        ? mergeRows({
            commands: actionsOnly ? [] : commandItems,
            actions: actionItems,
            tabs: actionsOnly ? [] : tabEntries,
            workspaces: actionsOnly ? [] : workspaceEntries,
            closed: actionsOnly ? [] : closedEntries,
            term: parsed.term,
            activeTabId,
            activeWorkspaceId,
            learned,
            mru,
          })
        : [],
    [
      inCommands,
      actionsOnly,
      commandItems,
      actionItems,
      tabEntries,
      workspaceEntries,
      closedEntries,
      parsed.term,
      activeTabId,
      activeWorkspaceId,
      learned,
      mru,
    ],
  );
  // Until a row is picked the previous tab is the highlighted one. Passing it as the controlled
  // value from the first render keeps cmdk from selecting the first row (the current tab) first.
  const value =
    pickedValue ||
    (open && inCommands && !inSubpage ? initialKey(merged, parsed.term.length > 0) : "");
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
  const highlightedWorkspace = useMemo(
    () => (open && inCommands ? highlightedWorkspaceOf(value, merged) : null),
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
      (e) => e.workspaceId !== (moveSubject?.workspaceId ?? activeWorkspaceId),
    );
    const q = workspaceFilter.toLowerCase();
    if (!q) return others;
    return others
      .map((e) => ({ e, s: fuzzyBest(q, [e.title]) }))
      .filter((x) => x.s !== null)
      .sort((a, b) => (b.s ?? 0) - (a.s ?? 0))
      .map((x) => x.e);
  }, [inWorkspaces, workspaceFilter, workspaceEntries, activeWorkspaceId, moveSubject]);

  // The frame that puts the selection back after a close; anything that moves the selection
  // or resets the palette in the meantime cancels it so it never steals the selection.
  const settleFrame = useRef<number | null>(null);
  const cancelSettle = useCallback(() => {
    if (settleFrame.current === null) return;
    window.cancelAnimationFrame(settleFrame.current);
    settleFrame.current = null;
  }, []);
  useEffect(() => cancelSettle, [cancelSettle]);

  const resetPalette = useCallback(() => {
    cancelSettle();
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
    setMoveSubject(null);
    previewThemeId(null);
  }, [previewThemeId, parsed.mode, query, value, cancelSettle]);

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
      setQuery(initialMode === "content" ? "#" : initialMode === "history" ? ">" : "");
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

  const enterWorkspaces = useCallback((subject: MoveSubject | null, fromRow = false) => {
    setMoveSubject(subject);
    setMoveFromRow(fromRow);
    setPage("workspaces");
    setQuery("");
    setValue("");
  }, []);

  // Back to the row whose menu started the move; the command has no row to go back to.
  const exitWorkspaces = useCallback(() => {
    setPage("root");
    setQuery("");
    setValue(moveSubject && moveFromRow ? tabRowKey(moveSubject.tabId) : "");
    setMoveSubject(null);
  }, [moveSubject, moveFromRow]);

  const runCommand = useCallback(
    (item: PaletteItem) => {
      const choice = commandChoice(item);
      if (choice.action === "none") return;
      if (choice.learn) recordChoice(parsed.term, commandRowKey(item.id));
      if (choice.action === "themes") return enterThemes();
      if (choice.action === "workspaces") {
        return enterWorkspaces(
          activeTabId ? { tabId: activeTabId, workspaceId: activeWorkspaceId } : null,
        );
      }
      if (choice.action === "content") return setQuery("#");
      if (choice.action === "history") return setQuery(">");
      recordUse(item.id);
      runAfterClose(item.run);
    },
    [enterThemes, enterWorkspaces, runAfterClose, parsed.term, activeTabId, activeWorkspaceId],
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
  // The rows that will disappear and the one to select once they have. Set before closing, applied
  // only when they really leave the list, dropped when the close was cancelled or refused.
  const pendingClose = useRef<{
    gone: ReadonlySet<string>;
    next: string | null;
    scrollTop: number;
  } | null>(null);
  const listViewport = useCallback(
    () =>
      listRef.current?.querySelector<HTMLElement>(
        '[data-slot="scroll-area-viewport"]',
      ) ?? null,
    [],
  );
  const mergedRef = useRef(merged);
  mergedRef.current = merged;
  const valueRef = useRef(value);
  valueRef.current = value;
  const typingRef = useRef(false);
  typingRef.current = parsed.term.length > 0;
  const closeRows = useCallback(
    (gone: ReadonlySet<string>, from: string, run: () => unknown, failure: string) => {
      if (pendingClose.current || gone.size === 0) return;
      const pending = {
        gone,
        next: successorOf(
          displayOrder(mergedRef.current, typingRef.current, COMMAND_GROUPS),
          gone,
          from,
        ),
        scrollTop: listViewport()?.scrollTop ?? 0,
      };
      pendingClose.current = pending;
      void Promise.resolve()
        .then(run)
        .catch((e) => console.error(failure, e))
        .finally(() => {
          refocusInput();
          window.setTimeout(() => {
            if (pendingClose.current === pending) pendingClose.current = null;
          }, 300);
        });
    },
    [refocusInput, listViewport],
  );
  const closeTabFromRow = useCallback(
    (entry: TabEntry) => {
      const key = tabRowKey(entry.tabId);
      closeRows(new Set([key]), key, () => onCloseTab(entry), "Closing the tab failed");
    },
    [onCloseTab, closeRows],
  );
  const closeWorkspaceFromRow = useCallback(
    (workspaceId: string, from: string) => {
      closeRowMenu();
      closeRows(
        workspaceRowKeys(mergedRef.current, workspaceId),
        from,
        () => onCloseWorkspace(workspaceId),
        "Closing the workspace failed",
      );
    },
    [onCloseWorkspace, closeRows, closeRowMenu],
  );
  useEffect(() => {
    const pending = pendingClose.current;
    if (!pending || merged.some((r) => pending.gone.has(r.key))) return;
    pendingClose.current = null;
    const next = pending.next;
    const target =
      next && merged.some((r) => r.key === next) ? next : (merged[0]?.key ?? "");
    // cmdk reselects the first row when the selected item unmounts, after this effect, and scrolls
    // to it: the frame after, put the successor back and the scroll where it was.
    const restore = () => {
      const viewport = listViewport();
      if (viewport) viewport.scrollTop = pending.scrollTop;
    };
    setValue(target);
    cancelSettle();
    settleFrame.current = window.requestAnimationFrame(() => {
      settleFrame.current = null;
      setValue(target);
      restore();
    });
  }, [merged, listViewport, cancelSettle]);
  const runTabAction = useCallback(
    (id: RowMenuItemId, entry: TabEntry) => {
      if (!tabItemKeepsPalette(id)) closeRowMenu();
      const tabId = entry.tabId;
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
        closeTabFromRow(entry);
      } else if (id === "closeWorkspace") {
        closeWorkspaceFromRow(entry.workspaceId, tabRowKey(entry.tabId));
      } else if (id === "copyRelative") {
        const rel = tabEntryRelativePath(entry);
        if (rel?.ok) runAfterClose(() => void copyToClipboard(rel.text, "Copied relative path"));
      } else if (id === "tabId") {
        runAfterClose(() => void copyToClipboard(tabId, "Copied tab ID"));
      } else if (id === "closeOthers") {
        closeRows(
          otherTabRowKeys(tabEntries, entry),
          tabRowKey(tabId),
          () => onCloseOtherTabs(tabId),
          "Closing the other tabs failed",
        );
      } else if (id === "lock") {
        onUpdateTab(tabId, toggleTabLock);
      } else if (id === "autofocus") {
        onUpdateTab(tabId, (p) => (isAutofocusTab(p) ? { ...p, autofocus: !p.autofocus } : p));
      } else if (id === "save") {
        onSaveTab(tabId);
      } else if (id === "hibernateTab") {
        void Promise.resolve(onToggleTabHibernate(tabId))
          .catch((e) => console.error("Hibernating the tab failed", e))
          .finally(refocusInput);
      } else if (id === "removeNote") {
        flushTabNote(tabId);
        onUpdateTab(tabId, removeTabNote);
      } else if (id === "note") {
        flushTabNote(tabId);
        onUpdateTab(tabId, toggleTabNote);
        // A note shows on the current tab only. The tab is activated so the note can be seen, but
        // the note is not asked to take the focus: the cursor is still the palette's.
        if (!isTabNoteOpen(entry.tab) && tabId !== activeTabId) {
          onGoToTab(tabId);
          refocusInput();
        }
      } else if (id === "focusSidebar") {
        const target = tabFocusTarget(entry);
        if (target) {
          runAfterClose(() => {
            // The sidebar is the active workspace's.
            if (entry.workspaceId !== activeWorkspaceId) onGoToTab(tabId);
            window.setTimeout(() => onRevealInExplorer(target), 50);
          });
        }
      } else if (id === "moveWorkspace") {
        enterWorkspaces({ tabId, workspaceId: entry.workspaceId }, true);
      }
    },
    [
      closeRowMenu,
      parsed.term,
      runAfterClose,
      onSelectTab,
      merged,
      onOpenTerminalAt,
      closeTabFromRow,
      closeWorkspaceFromRow,
      closeRows,
      tabEntries,
      onCloseOtherTabs,
      onUpdateTab,
      onSaveTab,
      onToggleTabHibernate,
      refocusInput,
      onGoToTab,
      onRevealInExplorer,
      activeWorkspaceId,
      enterWorkspaces,
    ],
  );

  const runWorkspaceAction = useCallback(
    (id: RowMenuItemId, entry: WorkspaceEntry) => {
      closeRowMenu();
      if (id === "go") {
        runAfterClose(() => onSelectWorkspace(entry));
      } else if (id === "terminal") {
        const target = terminalTargetOf(`ws:${entry.workspaceId}`, merged);
        if (target) onOpenTerminalAt(target);
      } else if (id === "rename") {
        runAfterClose(() => onRenameWorkspace(entry.workspaceId));
      } else if (id === "hibernate") {
        runAfterClose(() => onHibernateWorkspace(entry.workspaceId));
      } else if (id === "closeTabs") {
        runAfterClose(() => onCloseAllTabs(entry.workspaceId));
      } else if (id === "settings") {
        runAfterClose(() => onOpenWorkspaceSettings(entry.workspaceId));
      } else if (id === "closeWorkspace") {
        closeWorkspaceFromRow(entry.workspaceId, workspaceRowKey(entry.workspaceId));
      }
    },
    [
      closeRowMenu,
      runAfterClose,
      onSelectWorkspace,
      merged,
      onOpenTerminalAt,
      onRenameWorkspace,
      onHibernateWorkspace,
      onCloseAllTabs,
      onOpenWorkspaceSettings,
      closeWorkspaceFromRow,
    ],
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

  const openWorkspaceMenu = useCallback(
    (
      entry: WorkspaceEntry,
      row: Element | null | undefined,
      pointer?: { clientX: number; clientY: number },
    ) => {
      const box = boxRef.current;
      if (!box || !row) return;
      openRowMenu(
        `ws:${entry.workspaceId}`,
        workspaceMenuItems(entry),
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
        tabMenuItems(entry, { autofocusMode }),
        anchorOf(box, row as HTMLElement, pointer),
      );
    },
    [openRowMenu, autofocusMode],
  );

  // A flipped toggle (lock, hibernate, note) changes the open menu in place.
  const { setItems: setMenuItems } = rowMenu;
  const menuTab = rowMenu.menu ? highlightedTabOf(rowMenu.menu.rowKey, merged) : null;
  useEffect(() => {
    if (menuTab) setMenuItems(tabMenuItems(menuTab, { autofocusMode }));
  }, [menuTab, autofocusMode, setMenuItems]);

  // Takes the focus back from the hibernate review dialog once it is gone.
  const hibernateDialogWasOpen = useRef(false);
  useEffect(() => {
    if (hibernateDialogWasOpen.current && !hibernateDialogOpen && open) refocusInput();
    hibernateDialogWasOpen.current = hibernateDialogOpen;
  }, [hibernateDialogOpen, open, refocusInput]);

  const latestShortcut = useRef({ highlightedTab, runTabAction, closeWorkspaceFromRow, autofocusMode });
  latestShortcut.current = { highlightedTab, runTabAction, closeWorkspaceFromRow, autofocusMode };
  // The tab shortcuts (`paletteShortcuts.ts`) run their menu item on the highlighted tab, Cmd+Shift+W
  // closes its workspace; Cmd+T keeps opening the terminal beside it. A highlighted row that is not
  // a tab, or an item the menu does not offer there, takes the key without effect.
  useEffect(() => {
    if (!open) return;
    return registerPaletteControl((action, _digit, item) => {
      if (action === "newTab") return false;
      // Between a close and the frame that restores the selection the highlighted row is cmdk's
      // own pick, not the user's: acting on it would hit the wrong tab.
      if (settleFrame.current !== null) return true;
      const {
        highlightedTab: entry,
        runTabAction: run,
        closeWorkspaceFromRow: closeWs,
        autofocusMode: mode,
      } = latestShortcut.current;
      if (action === "closeWorkspace") {
        const workspaceId = workspaceIdOfRow(valueRef.current, mergedRef.current);
        if (workspaceId) closeWs(workspaceId, valueRef.current);
        return true;
      }
      if (action === "tabItem" && item && entry && runnableTabItem(entry, { autofocusMode: mode }, item)) {
        run(item, entry);
      }
      return true;
    });
  }, [open]);

  useEffect(() => {
    if (!open) {
      closeRowMenu();
      cancelSettle();
    }
  }, [open, closeRowMenu, cancelSettle]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: typing closes the menu
  useEffect(() => {
    closeRowMenu();
    cancelSettle();
  }, [query, closeRowMenu, cancelSettle]);

  const moveTo = useCallback(
    (subject: MoveSubject, target: string | "new") =>
      runAfterClose(() => onMoveTabToWorkspace(subject, target)),
    [runAfterClose, onMoveTabToWorkspace],
  );

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
      if (SELECTION_KEYS.has(e.key)) cancelSettle();
      if (rowMenu.menu) {
        const key = rowMenu.menu.rowKey;
        const entry = highlightedTabOf(key, merged);
        const closed = highlightedClosedOf(key, merged);
        const action = highlightedActionOf(key, merged);
        const workspace = highlightedWorkspaceOf(key, merged);
        const run = (item: { id: RowMenuItemId }) => {
          if (workspace) runWorkspaceAction(item.id, workspace);
          else if (entry) runTabAction(item.id, entry);
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
        else if (highlightedWorkspace) openWorkspaceMenu(highlightedWorkspace, row);
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
      cancelSettle,
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
      runWorkspaceAction,
      highlightedWorkspace,
      openWorkspaceMenu,
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
          : actionsOnly
            ? "Search actions..."
            : "Type a command, tab or workspace, > history, # files, / actions";

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
                  onSelect={() => moveSubject && moveTo(moveSubject, "new")}
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
                      moveSubject && moveTo(moveSubject, entry.workspaceId)
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
                  </CommandItem>
                ))}
                {workspaceTargets.length === 0 ? (
                  <StatusItem label="No other workspaces" />
                ) : null}
              </CommandGroup>
            ) : parsed.mode === "commands" || actionsOnly ? (
              merged.length === 0 ? (
                <EmptyHint actionsOnly={actionsOnly} />
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
                  onContextMenuWorkspace={(entry, e) => {
                    e.preventDefault();
                    setValue(`ws:${entry.workspaceId}`);
                    openWorkspaceMenu(entry, e.currentTarget, e);
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
              const workspace = highlightedWorkspaceOf(key, merged);
              if (workspace) runWorkspaceAction(id, workspace);
              else if (entry) runTabAction(id, entry);
              else if (closed) runClosedAction(id, closed);
              else if (action) runActionRow(id, action);
            }}
            onActive={(active) => rowMenu.setActive(active)}
          />
        ) : null}
        </div>
        <div className="flex min-w-0 items-center gap-3 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className="flex shrink-0 items-center gap-1.5">
            <kbd className="rounded bg-foreground/15 px-1.5 py-0.5 font-mono text-[10.5px] text-foreground">
              {"\u21b5"}
            </kbd>
            {footerEnterHint}
          </span>
          {terminalTarget ? (
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <kbd className="shrink-0 rounded bg-foreground/15 px-1.5 py-0.5 font-mono text-[10.5px] text-foreground">
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
          {highlightedTab || highlightedClosed || highlightedAction || highlightedWorkspace ? (
            <span className="flex shrink-0 items-center gap-1.5">
              <kbd className="rounded bg-foreground/15 px-1.5 py-0.5 font-mono text-[10.5px] text-foreground">
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

function EmptyHint({ actionsOnly }: { actionsOnly: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
      <HugeiconsIcon icon={CommandIcon} size={18} strokeWidth={1.5} />
      <span>
        {actionsOnly
          ? "No actions found."
          : "No commands found. Type ? to see search modes."}
      </span>
    </div>
  );
}
