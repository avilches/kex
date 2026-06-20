import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { memo, useCallback } from "react";
import { PaneView } from "./PaneView";
import type { PanelCallbacks } from "./PanelContent";
import type { SplitNode } from "./lib/types";
import type { GitStatusSnapshot } from "@/lib/native";
import type { GitColorScheme } from "@/modules/settings/store";

type Props = {
  node: SplitNode;
  workspaceId: string;
  workspaceCwd?: string;
  activePaneId: string;
  isWorkspaceActive: boolean;
  onActivatePanel: (workspaceId: string, panelId: string) => void;
  onClosePanel: (workspaceId: string, panelId: string) => void;
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
  callbacks: PanelCallbacks;
  gitStatus?: GitStatusSnapshot | null;
  gitColorScheme?: GitColorScheme;
};

export const SplitNodeView = memo(function SplitNodeView({ node, activePaneId, ...rest }: Props) {
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
    return (
      <PaneView
        pane={node}
        workspaceId={rest.workspaceId}
        workspaceCwd={rest.workspaceCwd}
        focused={node.id === activePaneId}
        isWorkspaceActive={rest.isWorkspaceActive}
        onActivatePanel={rest.onActivatePanel}
        onClosePanel={rest.onClosePanel}
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
      />
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
        <SplitNodeView node={node.first} activePaneId={activePaneId} {...rest} />
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
          {...rest}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
});
