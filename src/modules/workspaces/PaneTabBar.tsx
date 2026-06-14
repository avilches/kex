import { useDraggable, useDroppable, useDndMonitor } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { panelIcon, panelTitle } from "./lib/panelTitle";
import type { Panel } from "./lib/types";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useEffect, useRef, useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { getShortcutLabel } from "@/modules/shortcuts/shortcuts";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useTabRenameStore } from "./lib/tabRenameStore";

type Props = {
  panels: Panel[];
  activePanelId: string | null;
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
  onRenamePanel?: (panelId: string, title: string | undefined) => void;
};

function DraggableTab({
  panel,
  activePanelId,
  paneFocused,
  workspaceId,
  isWorkspaceActive,
  insertionBefore,
  insertionAfter,
  panelsCount,
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
  shortcutLabels,
  onRenamePanel,
}: {
  panel: Panel;
  activePanelId: string | null;
  paneFocused: boolean;
  workspaceId: string;
  isWorkspaceActive: boolean;
  insertionBefore: boolean;
  insertionAfter: boolean;
  panelsCount: number;
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
  shortcutLabels: Record<string, string | null>;
  onRenamePanel?: (panelId: string, title: string | undefined) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging: isThisDragging } = useDraggable({ id: panel.id });
  const { setNodeRef: setBeforeRef } = useDroppable({ id: `tab-insert:${panel.id}:before`, disabled: !isWorkspaceActive });
  const { setNodeRef: setAfterRef } = useDroppable({ id: `tab-insert:${panel.id}:after`, disabled: !isWorkspaceActive });
  const active = panel.id === activePanelId;
  const title = panelTitle(panel);
  const tabBarStyle = usePreferencesStore((s) => s.tabBarStyle);
  const connected = tabBarStyle === "connected";

  const isRenaming = useTabRenameStore((s) => s.renamingPanelId === panel.id);
  const clearRename = useTabRenameStore((s) => s.clearRename);
  const startRename = useTabRenameStore((s) => s.startRename);
  const inputRef = useRef<HTMLInputElement>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    if (isRenaming) handledRef.current = false;
  }, [isRenaming]);

  function handleSave() {
    if (handledRef.current) return;
    handledRef.current = true;
    const value = inputRef.current?.value.trim() ?? "";
    onRenamePanel?.(panel.id, value || undefined);
    clearRename();
  }

  function handleCancel() {
    if (handledRef.current) return;
    handledRef.current = true;
    clearRename();
  }

  return (
    <Popover
      open={isRenaming}
      onOpenChange={(open) => { if (!open) handleSave(); }}
    >
      <PopoverAnchor asChild>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              ref={setNodeRef}
              {...attributes}
              data-panel-id={panel.id}
              onClick={() => onActivate(panel.id)}
              onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
              onAuxClick={(e) => { if (e.button === 1) { e.stopPropagation(); onClose(panel.id); } }}
              {...listeners}
              className={cn(
                "group relative flex min-w-[100px] max-w-[200px] shrink-0 select-none touch-none items-center gap-1 px-1.5 text-[11px] transition-colors",
                isThisDragging ? "cursor-grabbing" : "cursor-default",
                connected
                  ? [
                      "self-stretch border-r border-border/30",
                      active
                        ? "bg-background text-foreground"
                        : "border-b border-border/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    ]
                  : [
                      "h-5 rounded",
                      active
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
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
              <span className="shrink-0 opacity-70">{panelIcon(panel, workspaceId)}</span>
              <span
                className={cn(
                  "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap",
                  panel.kind === "terminal" && panel.runningCommand && "text-center",
                )}
                style={{ direction: panel.kind === "terminal" && !panel.runningCommand ? "rtl" : "ltr" }}
                title={
                  panel.kind === "terminal"
                    ? panel.runningCommand
                      ? `${title} · ${panel.cwd?.replace(/\/$/, "") ?? ""}`
                      : (panel.cwd?.replace(/\/$/, "") ?? "shell")
                    : title
                }
              >
                {title}
              </span>
              {panel.kind === "editor" && panel.dirty && (
                <span className="shrink-0 text-[8px] text-primary">●</span>
              )}
              <button
                type="button"
                className="ml-0.5 flex size-[16px] shrink-0 cursor-pointer items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100 hover:bg-muted"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(panel.id);
                }}
                title="Close panel"
              >
                <span className="text-[13px] leading-none">×</span>
              </button>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            {onRenamePanel && (
              <>
                <ContextMenuItem onSelect={() => startRename(panel.id)}>
                  Rename Tab
                  {shortcutLabels["tab.rename"] && (
                    <ContextMenuShortcut>{shortcutLabels["tab.rename"]}</ContextMenuShortcut>
                  )}
                </ContextMenuItem>
                {panel.title && (
                  <ContextMenuItem onSelect={() => onRenamePanel(panel.id, undefined)}>
                    Reset Tab Name
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator />
              </>
            )}
            <ContextMenuItem onSelect={() => onClose(panel.id)}>
              Close Tab
              {shortcutLabels["tab.close"] && (
                <ContextMenuShortcut>{shortcutLabels["tab.close"]}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
            <ContextMenuItem
              disabled={panelsCount <= 1}
              onSelect={() => onCloseOtherPanels(panel.id)}
            >
              Close Other Tabs
            </ContextMenuItem>
            <ContextMenuItem onSelect={onCloseAllPanels}>
              Close All Tabs
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onNewTerminal}>
              New Terminal Tab
              {shortcutLabels["tab.new"] && (
                <ContextMenuShortcut>{shortcutLabels["tab.new"]}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
            <ContextMenuItem onSelect={onSplitTerminalRight}>
              New Terminal Split Right
              {shortcutLabels["pane.splitRight"] && (
                <ContextMenuShortcut>{shortcutLabels["pane.splitRight"]}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
            <ContextMenuItem onSelect={onSplitTerminalDown}>
              New Terminal Split Down
              {shortcutLabels["pane.splitDown"] && (
                <ContextMenuShortcut>{shortcutLabels["pane.splitDown"]}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onNewBrowser}>
              New Browser Tab
              {shortcutLabels["tab.newPreview"] && (
                <ContextMenuShortcut>{shortcutLabels["tab.newPreview"]}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
            <ContextMenuItem onSelect={onSplitBrowserRight}>
              New Browser Split Right
            </ContextMenuItem>
            <ContextMenuItem onSelect={onSplitBrowserDown}>
              New Browser Split Down
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </PopoverAnchor>

      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="w-52 gap-0 rounded-lg p-1.5"
        onEscapeKeyDown={(e) => { e.preventDefault(); handleCancel(); }}
      >
        <input
          ref={inputRef}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          defaultValue={panel.title ?? ""}
          placeholder={title}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); handleSave(); }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground/60"
        />
      </PopoverContent>
    </Popover>
  );
}

export function PaneTabBar({ panels, activePanelId, paneFocused, workspaceId, isWorkspaceActive, onActivate, onClose, onNewTerminal, onCloseOtherPanels, onCloseAllPanels, onSplitTerminalRight, onSplitTerminalDown, onNewBrowser, onSplitBrowserRight, onSplitBrowserDown, onRenamePanel }: Props) {
  const tabBarStyle = usePreferencesStore((s) => s.tabBarStyle);
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const shortcutLabels: Record<string, string | null> = {
    "tab.close":       getShortcutLabel("tab.close",       userShortcuts),
    "tab.new":         getShortcutLabel("tab.new",         userShortcuts),
    "pane.splitRight": getShortcutLabel("pane.splitRight", userShortcuts),
    "pane.splitDown":  getShortcutLabel("pane.splitDown",  userShortcuts),
    "tab.newPreview":  getShortcutLabel("tab.newPreview",  userShortcuts),
    "tab.rename":      getShortcutLabel("tab.rename",      userShortcuts),
  };
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activePanelIdRef = useRef(activePanelId);
  const userScrolledRef = useRef(false);
  const mouseLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouseInsideRef = useRef(true);

  useEffect(() => { activePanelIdRef.current = activePanelId; });

  const scrollActiveIntoView = (behavior: ScrollBehavior = 'auto') => {
    const container = scrollContainerRef.current;
    const id = activePanelIdRef.current;
    if (!container || !id) return;
    const tab = container.querySelector<HTMLElement>(`[data-panel-id="${id}"]`);
    if (!tab) return;
    const cr = container.getBoundingClientRect();
    const tr = tab.getBoundingClientRect();
    if (tr.left < cr.left) {
      container.scrollBy({ left: -(cr.left - tr.left + 4), behavior });
    } else if (tr.right > cr.right) {
      container.scrollBy({ left: tr.right - cr.right + 4, behavior });
    }
  };

  // Scroll active tab into view when it changes (unless user is browsing with wheel)
  useEffect(() => {
    if (userScrolledRef.current) return;
    scrollActiveIntoView('auto');
  }, [activePanelId]);

  // Wheel scroll: translate vertical delta to horizontal; snap-back managed by focus/mouse-leave logic
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
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

  // Snap back when the panel list changes (tab opened or closed)
  useEffect(() => {
    userScrolledRef.current = false;
    if (mouseLeaveTimerRef.current) {
      clearTimeout(mouseLeaveTimerRef.current);
      mouseLeaveTimerRef.current = null;
    }
    scrollActiveIntoView('auto');
  }, [panels.length]);

  useDndMonitor({
    onDragStart() {
      const container = scrollContainerRef.current;
      if (container) container.scrollLeft = 0;
    },
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
      const idx = panels.findIndex((p) => p.id === refPanelId);
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
        "flex h-7 shrink-0 items-center overflow-x-auto bg-card/60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
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
      {panels.map((p, i) => (
        <DraggableTab
          key={p.id}
          panel={p}
          activePanelId={activePanelId}
          paneFocused={paneFocused}
          workspaceId={workspaceId}
          isWorkspaceActive={isWorkspaceActive}
          insertionBefore={insertionIndex === 0 && i === 0}
          insertionAfter={insertionIndex !== null && insertionIndex > 0 && i === insertionIndex - 1}
          panelsCount={panels.length}
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
          shortcutLabels={shortcutLabels}
          onRenamePanel={onRenamePanel}
        />
      ))}
      <button
        type="button"
        onClick={onNewTerminal}
        className="ml-1 shrink-0 px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        title="New terminal in this pane"
      >
        +
      </button>
    </div>
  );
}
