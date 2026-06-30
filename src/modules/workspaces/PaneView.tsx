import { useDroppable, useDndMonitor } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { EmptyPaneWelcome, type WelcomeActions } from "./EmptyPaneWelcome";
import { PaneTabBar } from "./PaneTabBar";
import { TabContent } from "./TabContent";
import type { TabCallbacks } from "./TabContent";
import type { PaneNode } from "./lib/types";
import type { GitStatusSnapshot } from "@/lib/native";
import type { GitColorScheme } from "@/modules/settings/store";
import { isBulkClosable } from "./lib/tabClose";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useTheme } from "@/modules/theme";
import { detachAgentSession } from "@/modules/agents/lib/agentSessionRestore";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { useWorkspaceDndInsert } from "./WorkspaceDndProvider";
import { useTabFlash } from "./lib/tabFlashStore";
import { FlashOverlay } from "@/components/FlashOverlay";

type Props = {
  pane: PaneNode;
  workspaceId: string;
  workspaceCwd?: string;
  focused: boolean;
  isWorkspaceActive: boolean;
  onActivateTab: (workspaceId: string, tabId: string) => void;
  onCloseTab: (workspaceId: string, tabId: string) => void;
  onCloseManyTabs: (workspaceId: string, tabIds: string[]) => void;
  onFocusPane: (workspaceId: string, paneId: string) => void;
  onNewTerminal: (workspaceId: string, paneId: string) => void;
  onSplitTerminalRight: (workspaceId: string, paneId: string) => void;
  onSplitTerminalDown: (workspaceId: string, paneId: string) => void;
  onNewBrowser: (workspaceId: string, paneId: string) => void;
  onSplitBrowserRight: (workspaceId: string, paneId: string) => void;
  onSplitBrowserDown: (workspaceId: string, paneId: string) => void;
  callbacks: TabCallbacks;
  gitStatus?: GitStatusSnapshot | null;
  gitColorScheme?: GitColorScheme;
  onFloatBrowserTab?: (tabId: string) => void;
  onDockBrowserTab?: (tabId: string) => void;
  onFocusFloatBrowserTab?: (tabId: string) => void;
  onNavigateFloatBrowserTab?: (tabId: string, url: string) => void;
  welcomeActions?: WelcomeActions;
};

function DropZone({
  id,
  hitClassName,
  visualClassName,
  forceOver,
}: {
  id: string;
  hitClassName: string;
  visualClassName: string;
  forceOver?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const active = isOver || (forceOver ?? false);
  return (
    <>
      <div
        ref={setNodeRef}
        className={cn("absolute cursor-grabbing", hitClassName)}
      />
      {active && (
        <div
          className={cn(
            "pointer-events-none absolute bg-primary/25 ring-2 ring-inset ring-primary/60",
            visualClassName,
          )}
        />
      )}
    </>
  );
}

// Reads tabInsertPaneId from context so PaneView (memoized) is not re-rendered
// on every dragover — only this sub-component is.
function PaneDropOverlay({ paneId, tooNarrow, tooShort }: {
  paneId: string;
  tooNarrow: boolean;
  tooShort: boolean;
}) {
  const tabInsertPaneId = useWorkspaceDndInsert();
  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      {tooNarrow && tooShort ? (
        <DropZone
          id={`zone:${paneId}:center`}
          hitClassName="pointer-events-auto inset-0"
          visualClassName="inset-0 rounded-md"
          forceOver={tabInsertPaneId === paneId}
        />
      ) : (
        <>
          {!tooShort && (
            <>
              <DropZone
                id={`zone:${paneId}:top`}
                hitClassName="pointer-events-auto left-0 right-0 top-0 h-1/4"
                visualClassName="left-0 right-0 top-0 h-1/2 rounded-t-md"
              />
              <DropZone
                id={`zone:${paneId}:bottom`}
                hitClassName="pointer-events-auto bottom-0 left-0 right-0 h-1/4"
                visualClassName="bottom-0 left-0 right-0 h-1/2 rounded-b-md"
              />
            </>
          )}
          {!tooNarrow && (
            <>
              <DropZone
                id={`zone:${paneId}:left`}
                hitClassName={cn(
                  "pointer-events-auto left-0 w-1/4",
                  tooShort ? "inset-y-0" : "bottom-1/4 top-1/4",
                )}
                visualClassName="bottom-0 left-0 top-0 w-1/2 rounded-l-md"
              />
              <DropZone
                id={`zone:${paneId}:right`}
                hitClassName={cn(
                  "pointer-events-auto right-0 w-1/4",
                  tooShort ? "inset-y-0" : "bottom-1/4 top-1/4",
                )}
                visualClassName="bottom-0 right-0 top-0 w-1/2 rounded-r-md"
              />
            </>
          )}
          <DropZone
            id={`zone:${paneId}:center`}
            hitClassName={cn(
              "pointer-events-auto",
              tooNarrow
                ? "inset-y-1/4 left-0 right-0"
                : tooShort
                  ? "inset-x-1/4 top-0 bottom-0"
                  : "bottom-1/4 left-1/4 right-1/4 top-1/4",
            )}
            visualClassName="inset-0 rounded-md"
            forceOver={tabInsertPaneId === paneId}
          />
        </>
      )}
    </div>
  );
}

// Subscribes to the tab-flash store in isolation so the memoized PaneView is not
// re-rendered on every flash. Outlines the whole pane (border only) when the
// flashed tab is the one this pane is showing.
function PaneFlashBorder({ tabId }: { tabId: string | null }) {
  const token = useTabFlash(tabId ?? "");
  return <FlashOverlay token={token} variant="ring" className="z-50" />;
}

export const PaneView = memo(function PaneView({
  pane,
  workspaceId,
  workspaceCwd: _workspaceCwd,
  focused,
  isWorkspaceActive,
  onActivateTab,
  onCloseTab,
  onCloseManyTabs,
  onFocusPane,
  onNewTerminal,
  onSplitTerminalRight,
  onSplitTerminalDown,
  onNewBrowser,
  onSplitBrowserRight,
  onSplitBrowserDown,
  callbacks,
  gitStatus,
  gitColorScheme,
  onFloatBrowserTab,
  onDockBrowserTab,
  onFocusFloatBrowserTab,
  onNavigateFloatBrowserTab,
  welcomeActions,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [paneSize, setPaneSize] = useState({ w: Infinity, h: Infinity });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setPaneSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const splitLimit = usePreferencesStore((s) => s.paneSplitLimit);
  const tooNarrow = paneSize.w < splitLimit.width;
  const tooShort = paneSize.h < splitLimit.height;

  const activeTab = pane.tabs.find((p) => p.id === pane.activeTabId);


  useDndMonitor({
    onDragStart: (event) => {
      setIsDragging(true);
      setDraggedTabId(String(event.active.id));
    },
    onDragEnd: () => { setIsDragging(false); setDraggedTabId(null); },
    onDragCancel: () => { setIsDragging(false); setDraggedTabId(null); },
  });

  const isDraggingOwnOnlyTab =
    draggedTabId !== null &&
    pane.tabs.length === 1 &&
    pane.tabs[0].id === draggedTabId;

  const { resolvedTheme, resolvedMode } = useTheme();
  const dimOpacity = focused || !activeTab
    ? 0
    : (resolvedTheme.variants[resolvedMode]?.inactivePaneDim?.[activeTab.kind] ?? 0);

  const handleFocus = useCallback(() => {
    if (!focused) onFocusPane(workspaceId, pane.id);
  }, [focused, workspaceId, pane.id, onFocusPane]);

  const handleActivate = useCallback((tabId: string) => onActivateTab(workspaceId, tabId), [onActivateTab, workspaceId]);
  const handleClose = useCallback((tabId: string) => onCloseTab(workspaceId, tabId), [onCloseTab, workspaceId]);
  const handleNewTerminal = useCallback(() => onNewTerminal(workspaceId, pane.id), [onNewTerminal, workspaceId, pane.id]);
  const handleCloseOtherTabs = useCallback((tabId: string) => {
    const ids = pane.tabs
      .filter((p) => p.id !== tabId && isBulkClosable(p))
      .map((p) => p.id);
    onCloseManyTabs(workspaceId, ids);
  }, [pane.tabs, onCloseManyTabs, workspaceId]);
  const handleCloseAllTabs = useCallback(() => {
    const ids = pane.tabs.filter(isBulkClosable).map((p) => p.id);
    onCloseManyTabs(workspaceId, ids);
  }, [pane.tabs, onCloseManyTabs, workspaceId]);
  const handleSplitTerminalRight = useCallback(() => onSplitTerminalRight(workspaceId, pane.id), [onSplitTerminalRight, workspaceId, pane.id]);
  const handleSplitTerminalDown = useCallback(() => onSplitTerminalDown(workspaceId, pane.id), [onSplitTerminalDown, workspaceId, pane.id]);
  const handleNewBrowser = useCallback(() => onNewBrowser(workspaceId, pane.id), [onNewBrowser, workspaceId, pane.id]);
  const handleSplitBrowserRight = useCallback(() => onSplitBrowserRight(workspaceId, pane.id), [onSplitBrowserRight, workspaceId, pane.id]);
  const handleSplitBrowserDown = useCallback(() => onSplitBrowserDown(workspaceId, pane.id), [onSplitBrowserDown, workspaceId, pane.id]);
  const handleDetachAgent = useCallback((tabId: string) => {
    useAgentStore.getState().finish(tabId);
    void detachAgentSession(tabId);
  }, []);

  return (
    <div
      ref={containerRef}
      data-pane-id={pane.id}
      className="relative flex h-full flex-col overflow-hidden"
      onMouseDownCapture={handleFocus}
      onFocus={handleFocus}
    >
      <PaneFlashBorder tabId={pane.activeTabId} />
      <div className="relative shrink-0">
        <PaneTabBar
          tabs={pane.tabs}
          activeTabId={pane.activeTabId}
          paneFocused={focused}
          workspaceId={workspaceId}
          isWorkspaceActive={isWorkspaceActive}
          onActivate={handleActivate}
          onClose={handleClose}
          onNewTerminal={handleNewTerminal}
          onCloseOtherTabs={handleCloseOtherTabs}
          onCloseAllTabs={handleCloseAllTabs}
          onSplitTerminalRight={handleSplitTerminalRight}
          onSplitTerminalDown={handleSplitTerminalDown}
          onNewBrowser={handleNewBrowser}
          onSplitBrowserRight={handleSplitBrowserRight}
          onSplitBrowserDown={handleSplitBrowserDown}
          onDetachAgent={handleDetachAgent}
          onRenameTab={callbacks.onRenameTab}
          onUpdateTab={callbacks.onUpdateTab}
          onRenameFile={callbacks.onRenameFile}
          onFocusOnExplorer={callbacks.onFocusOnExplorer}
          gitStatus={gitStatus}
          gitColorScheme={gitColorScheme}
        />
        {dimOpacity > 0 && (
          <div
            className="pointer-events-none absolute inset-0 bg-black"
            style={{ opacity: dimOpacity }}
          />
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        {pane.tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "absolute inset-0",
              tab.id !== pane.activeTabId && "invisible pointer-events-none",
            )}
          >
            <TabContent
              tab={tab}
              visible={tab.id === pane.activeTabId && isWorkspaceActive}
              focused={focused && tab.id === pane.activeTabId}
              callbacks={callbacks}
              onFloatBrowserTab={onFloatBrowserTab}
              onDockBrowserTab={onDockBrowserTab}
              onFocusFloatBrowserTab={onFocusFloatBrowserTab}
              onNavigateFloatBrowserTab={onNavigateFloatBrowserTab}
            />
          </div>
        ))}
        {pane.tabs.length === 0 &&
          (welcomeActions ? (
            <EmptyPaneWelcome actions={welcomeActions} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Empty pane - click + to add a terminal
            </div>
          ))}

        {dimOpacity > 0 && (
          <div
            className="pointer-events-none absolute inset-0 z-10 bg-black"
            style={{ opacity: dimOpacity }}
          />
        )}

        {/* drop overlay — only register/show for the active workspace */}
        {isDragging && isWorkspaceActive && !isDraggingOwnOnlyTab && (
          <PaneDropOverlay paneId={pane.id} tooNarrow={tooNarrow} tooShort={tooShort} />
        )}
      </div>
    </div>
  );
});
