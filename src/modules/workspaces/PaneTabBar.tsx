import { useDraggable, useDroppable, useDndMonitor } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { FlashOverlay } from "@/components/FlashOverlay";
import { tabIcon, tabTitle } from "./lib/tabTitle";
import { type Tab, isAutofocusTab } from "./lib/types";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type React from "react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { subscribeToRunningCommands, getRunningCommandsSnapshot } from "./lib/terminalEphemeralStore";
import { subscribe as subscribeOscTitles, getSnapshot as getOscTitlesSnapshot } from "@/modules/terminal/lib/oscTitleStore";
import { subscribeLockFlash, getLockFlashSnapshot } from "./lib/lockFlashStore";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { getShortcutLabel } from "@/modules/shortcuts/shortcuts";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useTabRenameStore } from "./lib/tabRenameStore";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, ArrowReloadHorizontalIcon, BrowserIcon, Cancel01Icon, CancelCircleIcon, CancelSquareIcon, ComputerTerminal01Icon, CrosshairIcon, LayoutBottomIcon, LayoutRightIcon, LinkSquare02Icon, LockKeyIcon, PencilEdit01Icon, SquareUnlock02Icon } from "@hugeicons/core-free-icons";
import type { GitStatusSnapshot } from "@/lib/native";
import type { GitColorScheme } from "@/modules/settings/store";
import { buildGitStatusMap, lookupGitStatus, type GitStatusCode } from "@/modules/explorer/lib/gitStatusUtils";
import { gitStatusHexColor } from "@/modules/explorer/lib/gitStatusColor";
import { tabFilePath } from "./lib/tabPath";

type Props = {
  tabs: Tab[];
  activeTabId: string | null;
  paneFocused: boolean;
  workspaceId: string;
  isWorkspaceActive: boolean;
  onActivate: (panelId: string) => void;
  onClose: (panelId: string) => void;
  onNewTerminal: () => void;
  onCloseOtherPanels: (panelId: string) => void;
  onCloseAllPanels: () => void;
  onSplitTerminalRight: () => void;
  onSplitTerminalDown: () => void;
  onNewBrowser: () => void;
  onSplitBrowserRight: () => void;
  onSplitBrowserDown: () => void;
  onDetachAgent: (panelId: string) => void;
  onRenamePanel?: (panelId: string, title: string | undefined) => void;
  onUpdatePanel?: (panelId: string, updater: (p: Tab) => Tab) => void;
  onRenameFile?: (panelId: string, newName: string) => void;
  onFocusOnExplorer?: (filePath: string) => void;
  gitStatus?: GitStatusSnapshot | null;
  gitColorScheme?: GitColorScheme;
};

function DraggableTab({
  tab,
  activeTabId,
  paneFocused,
  workspaceId,
  isWorkspaceActive,
  insertionBefore,
  insertionAfter,
  tabsCount,
  onActivate,
  onClose,
  onCloseOtherPanels,
  onCloseAllPanels,
  onNewTerminal,
  onSplitTerminalRight,
  onSplitTerminalDown,
  onNewBrowser,
  onSplitBrowserRight,
  onSplitBrowserDown,
  onDetachAgent,
  shortcutLabels,
  onRenamePanel,
  onUpdatePanel,
  onFocusOnExplorer,
  gitStatusMap,
  gitStatus,
  gitColorScheme,
}: {
  tab: Tab;
  activeTabId: string | null;
  paneFocused: boolean;
  workspaceId: string;
  isWorkspaceActive: boolean;
  insertionBefore: boolean;
  insertionAfter: boolean;
  tabsCount: number;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onCloseOtherPanels: (panelId: string) => void;
  onCloseAllPanels: () => void;
  onNewTerminal: () => void;
  onSplitTerminalRight: () => void;
  onSplitTerminalDown: () => void;
  onNewBrowser: () => void;
  onSplitBrowserRight: () => void;
  onSplitBrowserDown: () => void;
  onDetachAgent: (panelId: string) => void;
  shortcutLabels: Record<string, string | null>;
  onRenamePanel?: (panelId: string, title: string | undefined) => void;
  onUpdatePanel?: (panelId: string, updater: (p: Tab) => Tab) => void;
  onFocusOnExplorer?: (filePath: string) => void;
  gitStatusMap?: Map<string, GitStatusCode> | null;
  gitStatus?: GitStatusSnapshot | null;
  gitColorScheme?: GitColorScheme;
}) {
  const { attributes, listeners, setNodeRef, isDragging: isThisDragging } = useDraggable({ id: tab.id });
  const wrappedListeners = useMemo(() => ({
    ...listeners,
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      // Scroll tab into view before dnd-kit captures the element rect.
      e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
      listeners?.onPointerDown?.(e as React.PointerEvent);
    },
  }), [listeners]);
  const { setNodeRef: setBeforeRef } = useDroppable({ id: `tab-insert:${tab.id}:before`, disabled: !isWorkspaceActive });
  const { setNodeRef: setAfterRef } = useDroppable({ id: `tab-insert:${tab.id}:after`, disabled: !isWorkspaceActive });
  const active = tab.id === activeTabId;
  // Every tab can be locked, no exception.
  const isLocked = tab.locked ?? false;
  const focusFilePath = tabFilePath(tab);
  const focusTarget =
    focusFilePath ?? (tab.kind === "terminal" ? (tab.cwd ?? null) : null);
  const runningCommandMap = useSyncExternalStore(subscribeToRunningCommands, getRunningCommandsSnapshot);
  const runningCommand = tab.kind === "terminal" ? (runningCommandMap.get(tab.id) ?? null) : null;
  const oscTitleMap = useSyncExternalStore(subscribeOscTitles, getOscTitlesSnapshot);
  const oscTitle = tab.kind === "terminal" ? oscTitleMap.get(tab.id) : undefined;
  const title = tabTitle(tab, runningCommand, oscTitle);
  const tabBarStyle = usePreferencesStore((s) => s.tabBarStyle);
  const connected = tabBarStyle === "connected";
  const editorAutoSave = usePreferencesStore((s) => s.editorAutoSave);
  const agentSession = useAgentStore((s) => s.sessions[tab.id]);
  const hasAgent = agentSession !== undefined;
  const isRestoreError = agentSession?.restoreError ?? false;

  const tabColor = useMemo(() => {
    if (tab.kind !== "editor" || !gitStatusMap || !gitStatus) return null;
    const code = lookupGitStatus(gitStatusMap, gitStatus.repoRoot, tab.path);
    return code ? gitStatusHexColor(code, gitColorScheme ?? "vscode") : null;
  }, [tab, gitStatusMap, gitStatus, gitColorScheme]);

  const agentTitle = (() => {
    if (!hasAgent || tab.kind !== "terminal") return title;
    if (tab.title) return tab.title;
    if (oscTitle) return oscTitle;
    const agentName = agentSession!.agent;
    const cwd = tab.cwd ?? "";
    const dirname = cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd;
    return `${agentName} · ${dirname || title}`;
  })();

  // Descriptions (ai-title, user rename): left-align, CSS ellipsis truncates on the right.
  // Paths (cwd segments): truncate from the left so the deepest directory stays visible.
  const isDescription = !!(tab.title || oscTitle);
  const displayTitle = isDescription
    ? agentTitle
    : agentTitle.length > 28
      ? '...' + agentTitle.slice(-27)
      : agentTitle;

  const isRenaming = useTabRenameStore((s) => s.renamingPanelId === tab.id);
  const anyRenaming = useTabRenameStore((s) => s.renamingPanelId !== null);
  const clearRename = useTabRenameStore((s) => s.clearRename);
  const startRename = useTabRenameStore((s) => s.startRename);
  const inputRef = useRef<HTMLInputElement>(null);
  const handledRef = useRef(false);
  const lockFlashSnap = useSyncExternalStore(subscribeLockFlash, getLockFlashSnapshot);
  const lockFlashToken =
    lockFlashSnap.panelId === tab.id ? lockFlashSnap.seq : 0;

  useEffect(() => {
    if (isRenaming) handledRef.current = false;
  }, [isRenaming]);

  function handleSave() {
    if (handledRef.current) return;
    handledRef.current = true;
    const value = inputRef.current?.value.trim() ?? "";
    onRenamePanel?.(tab.id, value || undefined);
    clearRename();
  }

  function handleCancel() {
    if (handledRef.current) return;
    handledRef.current = true;
    clearRename();
  }

  const nativeTooltip = (() => {
    const cwd = tab.kind === "terminal" ? tab.cwd : undefined;
    const parts: string[] = [];
    if (cwd) parts.push(cwd);
    if (agentSession) {
      const model = agentSession.meta?.model ?? agentSession.agent;
      const sessionId = agentSession.meta?.sessionId;
      const agentPart = [model, sessionId].filter(Boolean).join(" ");
      if (agentPart) parts.push(agentPart);
    }
    return parts.join(" - ") || undefined;
  })();

  const tabDiv = (
    <div
      ref={setNodeRef}
      {...attributes}
      data-panel-id={tab.id}
      title={nativeTooltip}
      onClick={() => onActivate(tab.id)}
      onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
      onAuxClick={(e) => { if (e.button === 1) { e.stopPropagation(); onClose(tab.id); } }}
      onContextMenu={(e) => { if (anyRenaming) e.preventDefault(); }}
      {...wrappedListeners}
      className={cn(
        "group relative flex max-w-[320px] shrink-0 select-none touch-none items-center gap-1 px-1.5 text-[11px] transition-colors",
        isThisDragging ? "cursor-grabbing" : "cursor-default",
        connected
          ? [
              "self-stretch border-r border-border/30",
              active
                ? "bg-background text-foreground"
                : "border-b border-border/40 bg-muted/35 text-muted-foreground hover:bg-muted/55 hover:text-foreground",
            ]
          : [
              "h-5 rounded",
              active
                ? "bg-card text-foreground"
                : "bg-muted/35 text-muted-foreground hover:bg-muted/55 hover:text-foreground",
            ],
        isThisDragging && "opacity-40",
      )}
    >
      {/* Droppable half-zones - coordinates-based, no pointer events needed */}
      <div ref={setBeforeRef} className="pointer-events-none absolute inset-y-0 left-0 w-1/2" />
      <div ref={setAfterRef} className="pointer-events-none absolute inset-y-0 right-0 w-1/2" />

      {insertionBefore && (
        <div className="pointer-events-none absolute inset-y-1 left-0 z-20 w-0.5 rounded-full bg-tab-focus-indicator" />
      )}
      {insertionAfter && (
        <div className="pointer-events-none absolute inset-y-1 right-0 z-20 w-0.5 rounded-full bg-tab-focus-indicator" />
      )}

      {active && paneFocused && (
        <div
          className={cn("absolute inset-x-0 top-0 bg-tab-focus-indicator", connected ? "h-[1.5px]" : "h-0.5 rounded-t")}
        />
      )}
      <span className={cn("shrink-0", hasAgent ? "opacity-100" : "opacity-70")}>
        {hasAgent
          ? isRestoreError
            ? <span className="text-amber-500" title={`Session restore failed: ${agentSession!.restoreErrorReason ?? "unknown error"}`}>
                <HugeiconsIcon icon={Alert02Icon} size={12} strokeWidth={1.5} />
              </span>
            : <AgentIcon agent={agentSession!.agent} size={12} />
          : tab.kind === "browser" && tab.floating
            ? <HugeiconsIcon icon={LinkSquare02Icon} size={12} strokeWidth={1.75} className="opacity-60" />
            : tabIcon(tab, workspaceId)}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap",
          !isDescription && tab.kind === "terminal" && !!runningCommand && "text-center",
          isRestoreError && "text-destructive/70",
          tab.kind === "editor" && tab.preview && "italic",
        )}
        style={tabColor && !isRestoreError ? { color: tabColor } : undefined}
      >
        {displayTitle}
      </span>
      {tab.kind === "editor" && tab.dirty && !editorAutoSave && (
        <span className="shrink-0 text-[8px] text-primary">●</span>
      )}
      {hasAgent && (
        isRestoreError ? (
          <span className="ml-0.5 inline-block size-[6px] shrink-0 rounded-full bg-destructive" />
        ) : agentSession?.status === "working" ? (
          <span className="ml-0.5 size-[8px] shrink-0 animate-spin rounded-full border border-transparent border-t-foreground/70" />
        ) : agentSession?.status === "waiting" ? (
          <span className="ml-0.5 inline-block size-[6px] shrink-0 rounded-full bg-amber-400" />
        ) : null
      )}
      {isAutofocusTab(tab) && tab.autofocus && (
        <span
          className="ml-0.5 shrink-0 text-muted-foreground"
          title="Autofocus: this tab drives the sidebar"
        >
          <HugeiconsIcon icon={CrosshairIcon} size={13} strokeWidth={2} />
        </span>
      )}
      {isLocked ? (
        <button
          type="button"
          className="relative ml-0.5 flex size-[16px] shrink-0 items-center justify-center rounded text-foreground transition-colors hover:bg-muted"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onUpdatePanel?.(tab.id, (p) => ({ ...p, locked: false }));
          }}
          title="Unlock tab"
        >
          <FlashOverlay token={lockFlashToken} />
          <HugeiconsIcon icon={LockKeyIcon} size={13} strokeWidth={2} />
        </button>
      ) : (
        <button
          type="button"
          className="ml-0.5 flex size-[16px] shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100 hover:bg-muted"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose(tab.id);
          }}
          title="Close tab"
        >
          <span className="text-[13px] leading-none">×</span>
        </button>
      )}
    </div>
  );

  return (
    <Popover
      open={isRenaming}
      onOpenChange={(open) => { if (!open) handleSave(); }}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <PopoverAnchor asChild>
            {tabDiv}
          </PopoverAnchor>
        </ContextMenuTrigger>
        <ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
            {onRenamePanel && (
              <>
                <ContextMenuItem onSelect={() => startRename(tab.id)}>
                  <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={2} />
                  Rename Tab
                  {shortcutLabels["tab.rename"] && (
                    <ContextMenuShortcut>{shortcutLabels["tab.rename"]}</ContextMenuShortcut>
                  )}
                </ContextMenuItem>
                {tab.title && (
                  <ContextMenuItem onSelect={() => onRenamePanel(tab.id, undefined)}>
                    <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={14} strokeWidth={2} />
                    Reset Tab Name
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator />
              </>
            )}
            {((onFocusOnExplorer && focusTarget) || isAutofocusTab(tab)) && (
              <>
                {onFocusOnExplorer && focusTarget && (
                  <ContextMenuItem
                    disabled={isAutofocusTab(tab) && (tab.autofocus ?? false)}
                    onSelect={() => onFocusOnExplorer(focusTarget)}
                  >
                    <HugeiconsIcon icon={CrosshairIcon} size={14} strokeWidth={2} />
                    Focus on Sidebar
                    {shortcutLabels["tab.focusOnExplorer"] && (
                      <ContextMenuShortcut>
                        {shortcutLabels["tab.focusOnExplorer"]}
                      </ContextMenuShortcut>
                    )}
                  </ContextMenuItem>
                )}
                {isAutofocusTab(tab) && (
                  <ContextMenuItem
                    onSelect={() =>
                      onUpdatePanel?.(tab.id, (p) =>
                        isAutofocusTab(p)
                          ? { ...p, autofocus: !p.autofocus }
                          : p,
                      )
                    }
                  >
                    <HugeiconsIcon
                      icon={CrosshairIcon}
                      size={14}
                      strokeWidth={2}
                      className={tab.autofocus ? "text-primary" : undefined}
                    />
                    Autofocus Sidebar
                    {shortcutLabels["tab.toggleAutofocus"] && (
                      <ContextMenuShortcut>
                        {shortcutLabels["tab.toggleAutofocus"]}
                      </ContextMenuShortcut>
                    )}
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator />
              </>
            )}
            <ContextMenuItem
              onSelect={() => onUpdatePanel?.(tab.id, (p) => {
                const newLocked = !isLocked;
                return { ...p, locked: newLocked, ...(newLocked && p.kind === "editor" ? { preview: false } : {}) };
              })}
            >
              <HugeiconsIcon icon={isLocked ? SquareUnlock02Icon : LockKeyIcon} size={14} strokeWidth={2} />
              {isLocked ? "Unlock Tab" : "Lock Tab"}
              {shortcutLabels["tab.lock"] && (
                <ContextMenuShortcut>{shortcutLabels["tab.lock"]}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
            <ContextMenuItem disabled={isLocked} onSelect={() => onClose(tab.id)}>
              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
              Close Tab
              {!isLocked && shortcutLabels["tab.close"] && (
                <ContextMenuShortcut>{shortcutLabels["tab.close"]}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
            <ContextMenuItem
              disabled={tabsCount <= 1}
              onSelect={() => onCloseOtherPanels(tab.id)}
            >
              <HugeiconsIcon icon={CancelCircleIcon} size={14} strokeWidth={2} />
              Close Other Tabs
            </ContextMenuItem>
            <ContextMenuItem disabled={isLocked} onSelect={onCloseAllPanels}>
              <HugeiconsIcon icon={CancelSquareIcon} size={14} strokeWidth={2} />
              Close All Tabs
            </ContextMenuItem>
            {hasAgent && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => onDetachAgent(tab.id)}>
                  <HugeiconsIcon icon={LinkSquare02Icon} size={14} strokeWidth={2} />
                  Detach Claude
                </ContextMenuItem>
              </>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onNewTerminal}>
              <HugeiconsIcon icon={ComputerTerminal01Icon} size={14} strokeWidth={2} />
              New Terminal Tab
              {shortcutLabels["tab.new"] && (
                <ContextMenuShortcut>{shortcutLabels["tab.new"]}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
            <ContextMenuItem onSelect={onSplitTerminalRight}>
              <HugeiconsIcon icon={LayoutRightIcon} size={14} strokeWidth={2} />
              New Terminal Split Right
              {shortcutLabels["pane.splitRight"] && (
                <ContextMenuShortcut>{shortcutLabels["pane.splitRight"]}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
            <ContextMenuItem onSelect={onSplitTerminalDown}>
              <HugeiconsIcon icon={LayoutBottomIcon} size={14} strokeWidth={2} />
              New Terminal Split Down
              {shortcutLabels["pane.splitDown"] && (
                <ContextMenuShortcut>{shortcutLabels["pane.splitDown"]}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onNewBrowser}>
              <HugeiconsIcon icon={BrowserIcon} size={14} strokeWidth={2} />
              New Browser Tab
              {shortcutLabels["tab.newBrowser"] && (
                <ContextMenuShortcut>{shortcutLabels["tab.newBrowser"]}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
            <ContextMenuItem onSelect={onSplitBrowserRight}>
              <HugeiconsIcon icon={LayoutRightIcon} size={14} strokeWidth={2} />
              New Browser Split Right
            </ContextMenuItem>
            <ContextMenuItem onSelect={onSplitBrowserDown}>
              <HugeiconsIcon icon={LayoutBottomIcon} size={14} strokeWidth={2} />
              New Browser Split Down
            </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="flex w-52 flex-col gap-1 rounded-lg p-2"
        onEscapeKeyDown={(e) => { e.preventDefault(); handleCancel(); }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <span className="text-[12px] text-muted-foreground">Rename tab</span>
        <input
          ref={inputRef}
          autoFocus
          onFocus={(e) => { e.stopPropagation(); e.currentTarget.select(); }}
          onBlur={handleSave}
          defaultValue={tab.title ?? ""}
          placeholder={title}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); handleSave(); }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-full rounded border border-input bg-transparent px-1.5 py-1 text-[12px] text-foreground outline-none focus:border-ring placeholder:text-muted-foreground/60"
        />
      </PopoverContent>
    </Popover>
  );
}

export function PaneTabBar({ tabs, activeTabId, paneFocused, workspaceId, isWorkspaceActive, onActivate, onClose, onNewTerminal, onCloseOtherPanels, onCloseAllPanels, onSplitTerminalRight, onSplitTerminalDown, onNewBrowser, onSplitBrowserRight, onSplitBrowserDown, onDetachAgent, onRenamePanel, onUpdatePanel, onFocusOnExplorer, gitStatus, gitColorScheme }: Props) {
  const gitStatusMap = useMemo(() => gitStatus ? buildGitStatusMap(gitStatus) : null, [gitStatus]);
  const tabBarStyle = usePreferencesStore((s) => s.tabBarStyle);
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const shortcutLabels: Record<string, string | null> = {
    "tab.close":       getShortcutLabel("tab.close",       userShortcuts),
    "tab.new":         getShortcutLabel("tab.new",         userShortcuts),
    "pane.splitRight": getShortcutLabel("pane.splitRight", userShortcuts),
    "pane.splitDown":  getShortcutLabel("pane.splitDown",  userShortcuts),
    "tab.newBrowser":  getShortcutLabel("tab.newBrowser",  userShortcuts),
    "tab.rename":      getShortcutLabel("tab.rename",      userShortcuts),
    "tab.lock":        getShortcutLabel("tab.lock",        userShortcuts),
    "tab.focusOnExplorer": getShortcutLabel("tab.focusOnExplorer", userShortcuts),
    "tab.toggleAutofocus": getShortcutLabel("tab.toggleAutofocus", userShortcuts),
  };
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeTabIdRef = useRef(activeTabId);
  const userScrolledRef = useRef(false);
  const mouseLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouseInsideRef = useRef(true);
  const renamingPanelId = useTabRenameStore((s) => s.renamingPanelId);
  const isRenamingRef = useRef(false);
  useEffect(() => {
    isRenamingRef.current = renamingPanelId !== null;
  }, [renamingPanelId]);

  useEffect(() => { activeTabIdRef.current = activeTabId; });

  const scrollPanelIntoView = (panelId: string, behavior: ScrollBehavior = 'smooth') => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const tab = container.querySelector<HTMLElement>(`[data-panel-id="${panelId}"]`);
    if (!tab) return;
    const cr = container.getBoundingClientRect();
    const tr = tab.getBoundingClientRect();
    if (tr.left < cr.left) {
      container.scrollBy({ left: -(cr.left - tr.left + 4), behavior });
    } else if (tr.right > cr.right) {
      container.scrollBy({ left: tr.right - cr.right + 4, behavior });
    }
  };

  const scrollActiveIntoView = (behavior: ScrollBehavior = 'auto') => {
    const id = activeTabIdRef.current;
    if (!id) return;
    scrollPanelIntoView(id, behavior);
  };

  // Scroll active tab into view when it changes (unless user is browsing with wheel)
  useEffect(() => {
    if (userScrolledRef.current) return;
    scrollActiveIntoView('auto');
  }, [activeTabId]);

  // Wheel scroll: translate vertical delta to horizontal; snap-back managed by focus/mouse-leave logic
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (isRenamingRef.current) return;
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      container.scrollLeft += delta;
      userScrolledRef.current = true;
      // Edge case: scroll via trackpad while pointer was already outside
      if (!mouseInsideRef.current && !mouseLeaveTimerRef.current) {
        mouseLeaveTimerRef.current = setTimeout(() => {
          mouseLeaveTimerRef.current = null;
          userScrolledRef.current = false;
          scrollActiveIntoView('smooth');
        }, 5000);
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      if (mouseLeaveTimerRef.current) clearTimeout(mouseLeaveTimerRef.current);
    };
  }, []);

  // Keep active tab visible when the container is resized (pane resize, split, etc.)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => scrollActiveIntoView('auto'));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Snap back when the tab list changes (tab opened or closed)
  useEffect(() => {
    userScrolledRef.current = false;
    if (mouseLeaveTimerRef.current) {
      clearTimeout(mouseLeaveTimerRef.current);
      mouseLeaveTimerRef.current = null;
    }
    scrollActiveIntoView('auto');
  }, [tabs.length]);

  useDndMonitor({
    onDragStart() {},
    onDragOver(event) {
      const overId = event.over?.id ? String(event.over.id) : null;
      if (!overId?.startsWith("tab-insert:")) {
        setInsertionIndex(null);
        return;
      }
      const parts = overId.split(":");
      const refPanelId = parts[1];
      const side = parts[2];
      if (!refPanelId || !side) { setInsertionIndex(null); return; }
      const idx = tabs.findIndex((p) => p.id === refPanelId);
      if (idx === -1) { setInsertionIndex(null); return; }
      const insertionIdx = side === "before" ? idx : idx + 1;
      setInsertionIndex(insertionIdx);
    },
    onDragEnd() { setInsertionIndex(null); },
    onDragCancel() { setInsertionIndex(null); },
  });

  // react-resizable-panels registers a document-level capture pointerdown listener
  // that calls preventDefault() when the pointer is within ~5px of a resize handle.
  // In WebKit/Tauri, preventDefault() on pointerdown suppresses the click event.
  // Tabs at the top of a bottom pane become intermittently unclickable.
  // onPointerUp is not suppressed by that preventDefault(), so we use it here as
  // a fallback. onClick on each tab still works for all other cases.
  const pointerStartRef = useRef<{ id: number; x: number; y: number } | null>(null);

  return (
    <div
      ref={scrollContainerRef}
      className={cn(
        "flex h-8 shrink-0 items-center overflow-x-auto bg-card/60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        tabBarStyle === "connected"
          ? "gap-0 border-t border-border/60"
          : "gap-0.5 border-b border-border/60 px-1",
      )}
      onMouseEnter={() => {
        mouseInsideRef.current = true;
        if (mouseLeaveTimerRef.current) {
          clearTimeout(mouseLeaveTimerRef.current);
          mouseLeaveTimerRef.current = null;
        }
      }}
      onMouseLeave={() => {
        mouseInsideRef.current = false;
        if (!userScrolledRef.current) return;
        if (mouseLeaveTimerRef.current) clearTimeout(mouseLeaveTimerRef.current);
        mouseLeaveTimerRef.current = setTimeout(() => {
          mouseLeaveTimerRef.current = null;
          userScrolledRef.current = false;
          scrollActiveIntoView('smooth');
        }, 5000);
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        pointerStartRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const start = pointerStartRef.current;
        if (!start || start.id !== e.pointerId) return;
        pointerStartRef.current = null;
        if ((e.target as HTMLElement).closest("button")) return;
        const tabEl = (e.target as HTMLElement).closest("[data-panel-id]");
        if (!tabEl) return;
        const panelId = tabEl.getAttribute("data-panel-id");
        if (!panelId) return;
        const dx = Math.abs(e.clientX - start.x);
        const dy = Math.abs(e.clientY - start.y);
        if (dx < 6 && dy < 6) onActivate(panelId);
      }}
    >
      {tabs.map((p, i) => (
        <DraggableTab
          key={p.id}
          tab={p}
          activeTabId={activeTabId}
          paneFocused={paneFocused}
          workspaceId={workspaceId}
          isWorkspaceActive={isWorkspaceActive}
          insertionBefore={insertionIndex === 0 && i === 0}
          insertionAfter={insertionIndex !== null && insertionIndex > 0 && i === insertionIndex - 1}
          tabsCount={tabs.length}
          onActivate={onActivate}
          onClose={onClose}
          onCloseOtherPanels={onCloseOtherPanels}
          onCloseAllPanels={onCloseAllPanels}
          onNewTerminal={onNewTerminal}
          onSplitTerminalRight={onSplitTerminalRight}
          onSplitTerminalDown={onSplitTerminalDown}
          onNewBrowser={onNewBrowser}
          onSplitBrowserRight={onSplitBrowserRight}
          onSplitBrowserDown={onSplitBrowserDown}
          onDetachAgent={onDetachAgent}
          shortcutLabels={shortcutLabels}
          onRenamePanel={onRenamePanel}
          onUpdatePanel={onUpdatePanel}
          onFocusOnExplorer={onFocusOnExplorer}
          gitStatusMap={gitStatusMap}
          gitStatus={gitStatus}
          gitColorScheme={gitColorScheme}
        />
      ))}
      <div
        className={cn(
          "flex flex-1 items-center self-stretch",
          tabBarStyle === "connected" && "border-b border-border/40",
        )}
      >
        <button
          type="button"
          onClick={onNewTerminal}
          className="ml-1 shrink-0 px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          title="New terminal in this pane"
        >
          +
        </button>
      </div>
    </div>
  );
}
