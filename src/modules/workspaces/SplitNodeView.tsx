import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { memo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { PaneView } from "./PaneView";
import type { TabCallbacks } from "./TabContent";
import type { SplitNode } from "./lib/types";
import type { GitStatusSnapshot } from "@/lib/native";
import type { GitColorScheme } from "@/modules/settings/store";
import type { WelcomeActions } from "./EmptyPaneWelcome";

type Props = {
  node: SplitNode;
  workspaceId: string;
  workspaceCwd?: string;
  activePaneId: string;
  isWorkspaceActive: boolean;
  expandedPaneId?: string | null;
  onActivateTab: (workspaceId: string, tabId: string) => void;
  onCloseTab: (workspaceId: string, tabId: string) => void;
  onCloseManyTabs: (workspaceId: string, tabIds: string[]) => void;
  onFocusPane: (workspaceId: string, paneId: string) => void;
  onNewTerminal: (workspaceId: string, paneId: string) => void;
  onDividerChange?: (
    workspaceId: string,
    splitId: string,
    position: number,
  ) => void;
  onSplitTerminalRight: (workspaceId: string, paneId: string) => void;
  onSplitTerminalDown: (workspaceId: string, paneId: string) => void;
  onNewBrowser: (workspaceId: string, paneId: string) => void;
  onSplitBrowserRight: (workspaceId: string, paneId: string) => void;
  onSplitBrowserDown: (workspaceId: string, paneId: string) => void;
  callbacks: TabCallbacks;
  gitStatus?: GitStatusSnapshot | null;
  gitColorScheme?: GitColorScheme;
  onFloatBrowserPanel?: (tabId: string) => void;
  onDockBrowserPanel?: (tabId: string) => void;
  onFocusFloatBrowserPanel?: (tabId: string) => void;
  onNavigateFloatBrowserPanel?: (tabId: string, url: string) => void;
  welcomeActions?: WelcomeActions;
};

export const SplitNodeView = memo(function SplitNodeView({ node, activePaneId, expandedPaneId, ...rest }: Props) {
  const splitId = node.kind === "split" ? node.id : null;

  const handleLayoutChanged = useCallback(
    (layout: Record<string, number>) => {
      if (node.kind !== "split") return;
      const firstSize = layout[`split-${node.id}-first`];
      if (firstSize !== undefined) {
        rest.onDividerChange?.(rest.workspaceId, node.id, firstSize / 100);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [splitId, rest.workspaceId, rest.onDividerChange],
  );

  if (node.kind === "pane") {
    const isExpanded = expandedPaneId === node.id;
    const isHidden = expandedPaneId != null && !isExpanded;
    return (
      <div
        className={cn(
          "h-full w-full transition-opacity duration-250",
          isExpanded && "absolute inset-0 z-10 animate-in fade-in-0 zoom-in-95 duration-250",
          isHidden && "opacity-0 pointer-events-none",
        )}
      >
        <PaneView
          pane={node}
          workspaceId={rest.workspaceId}
          workspaceCwd={rest.workspaceCwd}
          focused={node.id === activePaneId}
          isWorkspaceActive={rest.isWorkspaceActive}
          onActivateTab={rest.onActivateTab}
          onCloseTab={rest.onCloseTab}
          onCloseManyTabs={rest.onCloseManyTabs}
          onFocusPane={rest.onFocusPane}
          onNewTerminal={rest.onNewTerminal}
          onSplitTerminalRight={rest.onSplitTerminalRight}
          onSplitTerminalDown={rest.onSplitTerminalDown}
          onNewBrowser={rest.onNewBrowser}
          onSplitBrowserRight={rest.onSplitBrowserRight}
          onSplitBrowserDown={rest.onSplitBrowserDown}
          callbacks={rest.callbacks}
          gitStatus={rest.gitStatus}
          gitColorScheme={rest.gitColorScheme}
          onFloatBrowserPanel={rest.onFloatBrowserPanel}
          onDockBrowserPanel={rest.onDockBrowserPanel}
          onFocusFloatBrowserPanel={rest.onFocusFloatBrowserPanel}
          onNavigateFloatBrowserPanel={rest.onNavigateFloatBrowserPanel}
          welcomeActions={rest.welcomeActions}
        />
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      orientation={node.orientation === "horizontal" ? "horizontal" : "vertical"}
      className="h-full w-full"
      onLayoutChanged={handleLayoutChanged}
    >
      <ResizablePanel
        id={`split-${node.id}-first`}
        defaultSize={`${node.dividerPosition * 100}%`}
        minSize="10%"
      >
        <SplitNodeView node={node.first} activePaneId={activePaneId} expandedPaneId={expandedPaneId} {...rest} />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel
        id={`split-${node.id}-second`}
        defaultSize={`${(1 - node.dividerPosition) * 100}%`}
        minSize="10%"
      >
        <SplitNodeView
          node={node.second}
          activePaneId={activePaneId}
          expandedPaneId={expandedPaneId}
          {...rest}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
});
