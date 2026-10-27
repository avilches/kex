import { FlashOverlay } from "@/components/FlashOverlay";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { PopoverAnchor } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type { GitStatusSnapshot } from "@/lib/native";
import { cn } from "@/lib/utils";
import {
  buildGitStatusMap,
  type GitStatusCode,
} from "@/modules/explorer/lib/gitStatusUtils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { GitColorScheme } from "@/modules/settings/store";
import { usePendingRestore } from "@/modules/terminal/lib/pendingRestore";
import { useRestoreBusy } from "@/modules/terminal/lib/restoreBusy";
import { useTheme } from "@/modules/theme/ThemeProvider";
import { useDndMonitor, useDraggable, useDroppable } from "@dnd-kit/core";
import {
  CrosshairIcon,
  LockKeyIcon,
  SleepingIcon,
  StickyNote03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type React from "react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { isHibernatedTab } from "./lib/hibernate";
import { getLockFlashSnapshot, subscribeLockFlash } from "./lib/lockFlashStore";
import { tabFolder } from "./lib/tabPath";
import { TabBarIcon } from "./lib/tabBarIcon";
import { tabTopLineColor } from "./lib/tabColor";
import { tabGitColor } from "./lib/tabGitColor";
import { isTabNoteOpen, toggleTabNote } from "./lib/tabNote";
import { useTabRenameStore } from "./lib/tabRenameStore";
import { tabStatusIndicator } from "./lib/tabStatusIndicator";
import {
  getRunningCommand,
  subscribeToRunningCommands,
} from "./lib/terminalEphemeralStore";
import { isAutofocusTab, type Tab } from "./lib/types";
import { useAgentTabTitle } from "./lib/useAgentTabTitle";
import { useTabTooltip } from "./lib/useTabTooltip";
import { useWorkspaceColor } from "./lib/workspaceColorContext";
import { NewTabMenuButton } from "./NewTabMenuButton";
import { TabContextMenuItems } from "./TabContextMenuItems";
import { TabRenamePopover } from "./TabRenamePopover";

type Props = {
  tabs: Tab[];
  activeTabId: string | null;
  paneFocused: boolean;
  workspaceId: string;
  isWorkspaceActive: boolean;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onNewTerminal: () => void;
  onCloseOtherTabs: (tabId: string) => void;
  onSplitTerminalRight: () => void;
  onSplitTerminalDown: () => void;
  onNewBrowser: () => void;
  onSplitBrowserRight: () => void;
  onSplitBrowserDown: () => void;
  onRenameTab?: (tabId: string, title: string | undefined) => void;
  onUpdateTab?: (tabId: string, updater: (p: Tab) => Tab) => void;
  onNoteHover?: (tabId: string, hovering: boolean) => void;
  onWake?: (tabId: string) => void;
  gitStatus?: GitStatusSnapshot | null;
  gitColorScheme?: GitColorScheme;
};

function TabNoteButton({
  open,
  onToggle,
  onHover,
}: {
  open: boolean;
  onToggle: () => void;
  onHover?: (hovering: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-label="Tab note"
      aria-pressed={open}
      title={open ? "Hide note" : "Show note"}
      className={cn(
        "ml-0.5 shrink-0 transition-colors",
        open ? "text-foreground" : "text-muted-foreground",
      )}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerEnter={() => onHover?.(true)}
      onPointerLeave={() => onHover?.(false)}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <HugeiconsIcon icon={StickyNote03Icon} size={13} strokeWidth={2} />
    </button>
  );
}

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
  onCloseOtherTabs,
  onRenameTab,
  onUpdateTab,
  onNoteHover,
  onWake,
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
  onCloseOtherTabs: (tabId: string) => void;
  onRenameTab?: (tabId: string, title: string | undefined) => void;
  onUpdateTab?: (tabId: string, updater: (p: Tab) => Tab) => void;
  onNoteHover?: (tabId: string, hovering: boolean) => void;
  onWake?: (tabId: string) => void;
  gitStatusMap?: Map<string, GitStatusCode> | null;
  gitStatus?: GitStatusSnapshot | null;
  gitColorScheme?: GitColorScheme;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging: isThisDragging,
  } = useDraggable({ id: tab.id });
  const wrappedListeners = useMemo(
    () => ({
      ...listeners,
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        // Scroll tab into view before dnd-kit captures the element rect.
        e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
        listeners?.onPointerDown?.(e as React.PointerEvent);
      },
    }),
    [listeners],
  );
  const { setNodeRef: setBeforeRef } = useDroppable({
    id: `tab-insert:${tab.id}:before`,
    disabled: !isWorkspaceActive,
  });
  const { setNodeRef: setAfterRef } = useDroppable({
    id: `tab-insert:${tab.id}:after`,
    disabled: !isWorkspaceActive,
  });
  const active = tab.id === activeTabId;
  const sleeping = isHibernatedTab(tab);
  // Every tab can be locked, no exception.
  const isLocked = tab.locked ?? false;
  const runningCommand = useSyncExternalStore(subscribeToRunningCommands, () =>
    tab.kind === "terminal" ? getRunningCommand(tab.id) : null,
  );
  const autofocusMode = usePreferencesStore((s) => s.autofocusMode);
  const tabBarStyle = usePreferencesStore((s) => s.tabBarStyle);
  const connected = tabBarStyle === "connected";
  const agentTabTitle = useAgentTabTitle(tab);
  const agentSession = agentTabTitle?.agentSession;
  const hasAgent = agentTabTitle?.hasAgent ?? false;
  const isRestoreError = agentSession?.restoreError ?? false;

  const workspaceColor = useWorkspaceColor();
  const topLine = tabTopLineColor(tab.color, workspaceColor);
  const { resolvedMode } = useTheme();
  const tabColor = useMemo(
    () =>
      tabGitColor(tab, gitStatusMap, gitStatus, gitColorScheme, resolvedMode),
    [tab, gitStatusMap, gitStatus, gitColorScheme, resolvedMode],
  );

  // Descriptions (ai-title, user rename): left-align, CSS ellipsis truncates on the right.
  // Paths (cwd segments): truncate from the left so the deepest directory stays visible.
  const agentTitle = agentTabTitle?.displayTitle ?? "";
  const isDescription = agentTabTitle?.isDescription ?? false;
  const displayTitle = isDescription
    ? agentTitle
    : agentTitle.length > 28
      ? `...${agentTitle.slice(-27)}`
      : agentTitle;

  const anyRenaming = useTabRenameStore((s) => s.renamingTabId !== null);
  const lockFlashSnap = useSyncExternalStore(
    subscribeLockFlash,
    getLockFlashSnapshot,
  );
  const lockFlashToken = lockFlashSnap.tabId === tab.id ? lockFlashSnap.seq : 0;

  const tooltip = useTabTooltip(tab, agentSession);

  const restoreBusy = useRestoreBusy(tab.id);
  const restorePending = usePendingRestore(tab.id) !== null;
  const indicatorKind = tabStatusIndicator({
    restoreBusy,
    restorePending,
    hasAgent,
    isRestoreError,
    interrupted: agentSession?.interrupted,
    status: agentSession?.status,
  });
  const statusIndicator =
    indicatorKind === "restoring" ? (
      <Spinner size={13} />
    ) : indicatorKind === "restore-failed" || indicatorKind === "interrupted" ? (
      <span className="inline-block size-[6px] rounded-full bg-destructive" />
    ) : indicatorKind === "working" ? (
      <Spinner size={11} />
    ) : indicatorKind === "attention" ? (
      <span className="inline-block size-[6px] rounded-full bg-amber-400" />
    ) : null;

  const tabDiv = (
    <div
      ref={setNodeRef}
      {...attributes}
      data-tab-id={tab.id}
      title={tooltip.title}
      onPointerEnter={tooltip.onPointerEnter}
      onClick={() => onActivate(tab.id)}
      onDoubleClick={sleeping ? () => onWake?.(tab.id) : undefined}
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
        // This div is draggable (dnd-kit's useDraggable sets tabIndex=0), so
        // a left-click would natively steal DOM focus onto it. That fires
        // after PaneView's onMouseDownCapture already placed focus on the
        // leaf's terminal/scratchpad, undoing it. Focus is owned by the
        // session, not the tab strip.
        else if (e.button === 0) e.preventDefault();
      }}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.stopPropagation();
          onClose(tab.id);
        }
      }}
      onContextMenu={(e) => {
        if (anyRenaming) e.preventDefault();
      }}
      {...wrappedListeners}
      className={cn(
        "group relative flex max-w-[320px] shrink-0 select-none touch-none items-center gap-1 px-1.5 text-[12px] transition-colors",
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
        sleeping && !isThisDragging && "opacity-40",
      )}
    >
      {/* Droppable half-zones - coordinates-based, no pointer events needed */}
      <div
        ref={setBeforeRef}
        className="pointer-events-none absolute inset-y-0 left-0 w-1/2"
      />
      <div
        ref={setAfterRef}
        className="pointer-events-none absolute inset-y-0 right-0 w-1/2"
      />

      {insertionBefore && (
        <div className="pointer-events-none absolute inset-y-1 left-0 z-20 w-0.5 rounded-full bg-tab-focus-indicator" />
      )}
      {insertionAfter && (
        <div className="pointer-events-none absolute inset-y-1 right-0 z-20 w-0.5 rounded-full bg-tab-focus-indicator" />
      )}

      {tab.color && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-1/2 z-10 h-3 w-0.5 -translate-y-1/2 rounded-full"
          style={{ backgroundColor: tab.color }}
        />
      )}
      {active && paneFocused && (
        <div
          className={cn(
            "absolute inset-x-0 top-0",
            topLine === null && "bg-tab-focus-indicator",
            connected ? "h-[1.5px]" : "h-0.5 rounded-t",
          )}
          style={topLine !== null ? { backgroundColor: topLine } : undefined}
        />
      )}
      <span
        className={cn(
          "shrink-0",
          hasAgent && !tab.icon ? "opacity-100" : "opacity-70",
        )}
      >
        <TabBarIcon
          tab={tab}
          agentSession={agentSession}
          running={!!runningCommand}
        />
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap",
          !isDescription &&
            tab.kind === "terminal" &&
            !!runningCommand &&
            "text-center",
          isRestoreError && "text-destructive/70",
          (tab.kind === "editor" ||
            tab.kind === "markdown" ||
            tab.kind === "git-diff" ||
            tab.kind === "git-commit-file") &&
            tab.preview &&
            "italic",
        )}
        style={tabColor && !isRestoreError ? { color: tabColor } : undefined}
      >
        {displayTitle}
      </span>
      {(tab.kind === "editor" || tab.kind === "markdown") && tab.dirty && (
        <span className="shrink-0 text-[9px] text-primary">●</span>
      )}
      {tab.note !== undefined && (
        <TabNoteButton
          open={isTabNoteOpen(tab)}
          onToggle={() => {
            if (!isTabNoteOpen(tab)) onActivate(tab.id);
            onUpdateTab?.(tab.id, toggleTabNote);
          }}
          onHover={(hovering) => onNoteHover?.(tab.id, hovering)}
        />
      )}
      {isLocked && statusIndicator && (
        <span className="ml-0.5 flex shrink-0 items-center">
          {statusIndicator}
        </span>
      )}
      {isAutofocusTab(tab) && tab.autofocus && autofocusMode === "manual" && (
        <span
          className="ml-0.5 shrink-0 text-muted-foreground"
          title="Autofocus: this tab drives the sidebar"
        >
          <HugeiconsIcon icon={CrosshairIcon} size={13} strokeWidth={2} />
        </span>
      )}
      {isLocked ? (
        <>
        {sleeping && (
          <span className="ml-0.5 shrink-0 text-muted-foreground" title="Hibernated: double click to restore">
            <HugeiconsIcon icon={SleepingIcon} size={12} strokeWidth={1.75} />
          </span>
        )}
        <button
          type="button"
          className="relative ml-0.5 flex size-[16px] shrink-0 items-center justify-center rounded text-foreground transition-colors hover:bg-muted"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onUpdateTab?.(tab.id, (p) => ({ ...p, locked: false }));
          }}
          title="Unlock tab"
          aria-label="Unlock tab"
        >
          <FlashOverlay token={lockFlashToken} />
          <HugeiconsIcon icon={LockKeyIcon} size={13} strokeWidth={2} />
        </button>
        </>
      ) : (
        <span className="relative ml-0.5 flex size-[16px] shrink-0 items-center justify-center">
          {sleeping && (
            <span
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground transition-opacity group-hover:opacity-0"
              title="Hibernated: double click to restore"
            >
              <HugeiconsIcon icon={SleepingIcon} size={12} strokeWidth={1.75} />
            </span>
          )}
          {statusIndicator && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity group-hover:opacity-0">
              {statusIndicator}
            </span>
          )}
          <button
            type="button"
            className="flex size-[16px] items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100 hover:bg-muted"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.id);
            }}
            title="Close tab"
            aria-label="Close tab"
          >
            <span className="text-[14px] leading-none">×</span>
          </button>
        </span>
      )}
    </div>
  );

  return (
    <TabRenamePopover
      tabId={tab.id}
      tab={tab}
      origin="pane"
      title={tab.title}
      placeholder={agentTitle}
      onRenameTab={onRenameTab}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <PopoverAnchor asChild>{tabDiv}</PopoverAnchor>
        </ContextMenuTrigger>
        <ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
          <TabContextMenuItems
            tab={tab}
            workspaceId={workspaceId}
            paneTabCount={tabsCount}
            renameOrigin="pane"
            onActivate={onActivate}
            onClose={onClose}
            onCloseOtherTabs={onCloseOtherTabs}
            onRenameTab={onRenameTab}
            onUpdateTab={onUpdateTab}
          />
        </ContextMenuContent>
      </ContextMenu>
    </TabRenamePopover>
  );
}

export function PaneTabBar({
  tabs,
  activeTabId,
  paneFocused,
  workspaceId,
  isWorkspaceActive,
  onActivate,
  onClose,
  onNewTerminal,
  onCloseOtherTabs,
  onSplitTerminalRight,
  onSplitTerminalDown,
  onNewBrowser,
  onSplitBrowserRight,
  onSplitBrowserDown,
  onRenameTab,
  onUpdateTab,
  onNoteHover,
  onWake,
  gitStatus,
  gitColorScheme,
}: Props) {
  const gitStatusMap = useMemo(
    () => (gitStatus ? buildGitStatusMap(gitStatus) : null),
    [gitStatus],
  );
  const tabBarStyle = usePreferencesStore((s) => s.tabBarStyle);
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeTabIdRef = useRef(activeTabId);
  const userScrolledRef = useRef(false);
  const mouseLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouseInsideRef = useRef(true);
  const renamingTabId = useTabRenameStore((s) => s.renamingTabId);
  const isRenamingRef = useRef(false);
  useEffect(() => {
    isRenamingRef.current = renamingTabId !== null;
  }, [renamingTabId]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  });

  const scrollTabIntoView = (
    tabId: string,
    behavior: ScrollBehavior = "smooth",
  ) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const tab = container.querySelector<HTMLElement>(
      `[data-tab-id="${tabId}"]`,
    );
    if (!tab) return;
    const cr = container.getBoundingClientRect();
    const tr = tab.getBoundingClientRect();
    if (tr.left < cr.left) {
      container.scrollBy({ left: -(cr.left - tr.left + 4), behavior });
    } else if (tr.right > cr.right) {
      container.scrollBy({ left: tr.right - cr.right + 4, behavior });
    }
  };

  const scrollActiveIntoView = (behavior: ScrollBehavior = "auto") => {
    const id = activeTabIdRef.current;
    if (!id) return;
    scrollTabIntoView(id, behavior);
  };

  // Scroll active tab into view when it changes (unless user is browsing with wheel)
  useEffect(() => {
    if (userScrolledRef.current) return;
    scrollActiveIntoView("auto");
  }, [activeTabId]);

  // Wheel scroll: translate vertical delta to horizontal; snap-back managed by focus/mouse-leave logic
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (isRenamingRef.current) return;
      const delta =
        Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      container.scrollLeft += delta;
      userScrolledRef.current = true;
      // Edge case: scroll via trackpad while pointer was already outside
      if (!mouseInsideRef.current && !mouseLeaveTimerRef.current) {
        mouseLeaveTimerRef.current = setTimeout(() => {
          mouseLeaveTimerRef.current = null;
          userScrolledRef.current = false;
          scrollActiveIntoView("smooth");
        }, 5000);
      }
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
      if (mouseLeaveTimerRef.current) clearTimeout(mouseLeaveTimerRef.current);
    };
  }, []);

  // Keep active tab visible when the container is resized (pane resize, split, etc.)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => scrollActiveIntoView("auto"));
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
    scrollActiveIntoView("auto");
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
      const refTabId = parts[1];
      const side = parts[2];
      if (!refTabId || !side) {
        setInsertionIndex(null);
        return;
      }
      const idx = tabs.findIndex((p) => p.id === refTabId);
      if (idx === -1) {
        setInsertionIndex(null);
        return;
      }
      const insertionIdx = side === "before" ? idx : idx + 1;
      setInsertionIndex(insertionIdx);
    },
    onDragEnd() {
      setInsertionIndex(null);
    },
    onDragCancel() {
      setInsertionIndex(null);
    },
  });

  // react-resizable-panels registers a document-level capture pointerdown listener
  // that calls preventDefault() when the pointer is within ~5px of a resize handle.
  // In WebKit/Tauri, preventDefault() on pointerdown suppresses the click event.
  // Tabs at the top of a bottom pane become intermittently unclickable.
  // onPointerUp is not suppressed by that preventDefault(), so we use it here as
  // a fallback. onClick on each tab still works for all other cases.
  const pointerStartRef = useRef<{ id: number; x: number; y: number } | null>(
    null,
  );

  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center bg-card/60",
        tabBarStyle === "connected"
          ? "border-t border-border/60"
          : "border-b border-border/60 px-1",
      )}
    >
      <div
        ref={scrollContainerRef}
        className={cn(
          "flex min-w-0 flex-1 items-center self-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          tabBarStyle === "connected" ? "gap-0" : "gap-0.5",
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
          if (mouseLeaveTimerRef.current)
            clearTimeout(mouseLeaveTimerRef.current);
          mouseLeaveTimerRef.current = setTimeout(() => {
            mouseLeaveTimerRef.current = null;
            userScrolledRef.current = false;
            scrollActiveIntoView("smooth");
          }, 5000);
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          pointerStartRef.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
          };
        }}
        onPointerUp={(e) => {
          const start = pointerStartRef.current;
          if (!start || start.id !== e.pointerId) return;
          pointerStartRef.current = null;
          if ((e.target as HTMLElement).closest("button")) return;
          const tabEl = (e.target as HTMLElement).closest("[data-tab-id]");
          if (!tabEl) return;
          const tabId = tabEl.getAttribute("data-tab-id");
          if (!tabId) return;
          const dx = Math.abs(e.clientX - start.x);
          const dy = Math.abs(e.clientY - start.y);
          if (dx < 6 && dy < 6) onActivate(tabId);
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
            insertionAfter={
              insertionIndex !== null &&
              insertionIndex > 0 &&
              i === insertionIndex - 1
            }
            tabsCount={tabs.length}
            onActivate={onActivate}
            onClose={onClose}
            onCloseOtherTabs={onCloseOtherTabs}
            onRenameTab={onRenameTab}
            onUpdateTab={onUpdateTab}
            onNoteHover={onNoteHover}
            onWake={onWake}
            gitStatusMap={gitStatusMap}
            gitStatus={gitStatus}
            gitColorScheme={gitColorScheme}
          />
        ))}
        <div
          className={cn(
            "flex-1 self-stretch",
            tabBarStyle === "connected" && "border-b border-border/40",
          )}
        />
      </div>
      <div
        className={cn(
          "flex shrink-0 items-center self-stretch",
          tabBarStyle === "connected" && "border-b border-border/40",
        )}
      >
        <NewTabMenuButton
          folder={tabFolder(tabs.find((t) => t.id === activeTabId) ?? null)}
          onNewTerminal={onNewTerminal}
          onSplitTerminalRight={onSplitTerminalRight}
          onSplitTerminalDown={onSplitTerminalDown}
          onNewBrowser={onNewBrowser}
          onSplitBrowserRight={onSplitBrowserRight}
          onSplitBrowserDown={onSplitBrowserDown}
        />
      </div>
    </div>
  );
}
