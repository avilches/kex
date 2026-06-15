import { cn } from "@/lib/utils";
import { refreshTerminalLeaf } from "@/modules/terminal";
import { useEffect } from "react";
import { allPanes } from "./lib/splitNode";
import type { Workspace } from "./lib/types";
import { SplitNodeView } from "./SplitNodeView";
import type { PanelCallbacks } from "./PanelContent";
import { useWorkspaceDnd } from "./WorkspaceDndProvider";

type Props = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  onActivatePanel: (workspaceId: string, panelId: string) => void;
  onClosePanel: (workspaceId: string, panelId: string) => void;
  onFocusPane: (workspaceId: string, paneId: string) => void;
  onNewTerminal: (workspaceId: string, paneId: string) => void;
  onDividerChange?: (workspaceId: string, splitId: string, position: number) => void;
  onSplitTerminalRight: (workspaceId: string, paneId: string) => void;
  onSplitTerminalDown: (workspaceId: string, paneId: string) => void;
  onNewBrowser: (workspaceId: string, paneId: string) => void;
  onSplitBrowserRight: (workspaceId: string, paneId: string) => void;
  onSplitBrowserDown: (workspaceId: string, paneId: string) => void;
  callbacks: PanelCallbacks;
};

export function WorkspaceView({
  workspaces,
  activeWorkspaceId,
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
            onActivatePanel={rest.onActivatePanel}
            onClosePanel={rest.onClosePanel}
            onFocusPane={rest.onFocusPane}
            onNewTerminal={rest.onNewTerminal}
            onDividerChange={rest.onDividerChange}
            onSplitTerminalRight={rest.onSplitTerminalRight}
            onSplitTerminalDown={rest.onSplitTerminalDown}
            onNewBrowser={rest.onNewBrowser}
            onSplitBrowserRight={rest.onSplitBrowserRight}
            onSplitBrowserDown={rest.onSplitBrowserDown}
            callbacks={rest.callbacks}
          />
        </div>
      ))}
    </div>
  );
}
