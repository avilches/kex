import { cn } from "@/lib/utils";
import { refreshTerminalLeaf } from "@/modules/terminal";
import { useEffect } from "react";
import { allPanes } from "./lib/splitNode";
import type { Workspace } from "./lib/types";
import { SplitNodeView } from "./SplitNodeView";
import type { PanelCallbacks } from "./PanelContent";
import { useWorkspaceDnd } from "./WorkspaceDndProvider";
import type { GitStatusSnapshot } from "@/lib/native";
import type { GitColorScheme } from "@/modules/settings/store";
import type { WelcomeActions } from "./EmptyPaneWelcome";

type Props = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  expandedPaneId?: string | null;
  onActivatePanel: (workspaceId: string, panelId: string) => void;
  onClosePanel: (workspaceId: string, panelId: string) => void;
  onCloseManyPanels: (workspaceId: string, panelIds: string[]) => void;
  onFocusPane: (workspaceId: string, paneId: string) => void;
  onNewTerminal: (workspaceId: string, paneId: string) => void;
  onDividerChange?: (workspaceId: string, splitId: string, position: number) => void;
  onSplitTerminalRight: (workspaceId: string, paneId: string) => void;
  onSplitTerminalDown: (workspaceId: string, paneId: string) => void;
  onNewBrowser: (workspaceId: string, paneId: string) => void;
  onSplitBrowserRight: (workspaceId: string, paneId: string) => void;
  onSplitBrowserDown: (workspaceId: string, paneId: string) => void;
  callbacks: PanelCallbacks;
  gitStatus?: GitStatusSnapshot | null;
  gitColorScheme?: GitColorScheme;
  onFloatBrowserPanel?: (panelId: string) => void;
  onDockBrowserPanel?: (panelId: string) => void;
  onFocusFloatBrowserPanel?: (panelId: string) => void;
  onNavigateFloatBrowserPanel?: (panelId: string, url: string) => void;
  welcomeActions?: WelcomeActions;
};

export function WorkspaceView({
  workspaces,
  activeWorkspaceId,
  expandedPaneId,
  ...rest
}: Props) {
  const { draggingItem } = useWorkspaceDnd();

  // After workspace switch the CSS visibility:hidden is removed. The WebGL
  // canvas doesn't repaint on its own after that — force a refresh once the
  // DOM change has been painted.
  useEffect(() => {
    const ws = workspaces.find((w) => w.id === activeWorkspaceId);
    if (!ws) return;
    const raf = requestAnimationFrame(() => {
      for (const pane of allPanes(ws.paneTree)) {
        if (pane.activePanelId) refreshTerminalLeaf(pane.activePanelId);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [activeWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cn("relative h-full w-full", draggingItem && "[&_*]:!cursor-grabbing cursor-grabbing")}>
      {workspaces.map((ws) => (
        <div
          key={ws.id}
          className={cn(
            "absolute inset-0",
            ws.id !== activeWorkspaceId && "opacity-0 invisible",
          )}
        >
          <SplitNodeView
            node={ws.paneTree}
            workspaceId={ws.id}
            workspaceCwd={ws.cwd}
            activePaneId={ws.activePaneId}
            isWorkspaceActive={ws.id === activeWorkspaceId}
            expandedPaneId={expandedPaneId}
            onActivatePanel={rest.onActivatePanel}
            onClosePanel={rest.onClosePanel}
            onCloseManyPanels={rest.onCloseManyPanels}
            onFocusPane={rest.onFocusPane}
            onNewTerminal={rest.onNewTerminal}
            onDividerChange={rest.onDividerChange}
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
      ))}
    </div>
  );
}
