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
import { mergeRows } from "./lib/mergeRows";
import { MODE_HINTS, parseQuery } from "./lib/mode";
import { mruSnapshot, recordUse } from "./lib/mru";
import { commandRowKey } from "./lib/rankCommands";
import type { TabEntry, WorkspaceEntry } from "./lib/tabEntries";
import { tabRowKey, workspaceRowKey } from "./lib/tabRank";
import { type TerminalTarget, terminalTargetOf } from "./lib/terminalTarget";
import { enterHintOf } from "./lib/enterHint";
import { MergedList } from "./MergedList";
import { PALETTE_WIDTH_CLASS, usePaletteWidth } from "./PaletteWidth";
import type { PaletteItem } from "./types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "commands" | "content";
  commandItems: PaletteItem[];
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
};

const THEME_PREVIEW_DELAY_MS = 140;

// cmdk overrides the rendered input's id attribute, so helpers that focus or
// select the palette input query it by its cmdk marker instead of by id.
function paletteInputElement(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('[cmdk-input=""]');
}

let lastContentQuery = "";
let lastContentValue = "";
let lastContentScrollTop = 0;

export function CommandPalette({
  open,
  onOpenChange,
  initialMode,
  commandItems,
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
}: Props) {
  const [query, setQuery] = useState("");
  const { contentStyle, handles } = usePaletteWidth();
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
      if (!inSubpage) return;
      if (e.key === "Backspace" && query.length === 0) {
        e.preventDefault();
        e.stopPropagation();
        if (inThemes) exitThemes();
        else exitWorkspaces();
      }
    },
    [inSubpage, inThemes, query, exitThemes, exitWorkspaces],
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
          value={query}
          onValueChange={setQuery}
          placeholder={placeholder}
          autoFocus
        />
        <ScrollArea
          ref={listRef}
          className="max-h-[420px] [&_[data-slot=scroll-area-viewport]>div]:block!"
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
        <div className="flex min-w-0 items-center gap-3 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className="flex shrink-0 items-center gap-1.5">
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px]">
              {"\u21b5"}
            </kbd>
            {footerEnterHint}
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <kbd className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px]">
              {getShortcutLabel("tab.new", userShortcuts) ?? "New tab"}
            </kbd>
            <span className="shrink-0">
              {terminalTarget ? "Open terminal" : "New terminal"}
            </span>
            {terminalTarget ? (
              <span className="min-w-0 truncate font-mono text-[10.5px]">
                {terminalTarget.cwd}
              </span>
            ) : null}
          </span>
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
