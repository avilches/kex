import { cn } from "@/lib/utils";
import type { Workspace } from "./lib/types";
import { SplitNodeView } from "./SplitNodeView";
import type { PanelCallbacks } from "./PanelContent";

type Props = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  onActivatePanel: (workspaceId: string, panelId: string) => void;
  onClosePanel: (workspaceId: string, panelId: string) => void;
  onFocusPane: (workspaceId: string, paneId: string) => void;
  onNewTerminal: (workspaceId: string, paneId: string) => void;
  onDividerChange?: (
    workspaceId: string,
    splitId: string,
    position: number,
  ) => void;
  callbacks: PanelCallbacks;
};

export function WorkspaceView({
  workspaces,
  activeWorkspaceId,
  ...rest
}: Props) {
  return (
    <div className="relative h-full w-full">
      {workspaces.map((ws) => (
        <div
          key={ws.id}
          className={cn(
            "absolute inset-0",
            ws.id !== activeWorkspaceId && "invisible pointer-events-none",
          )}
        >
          <SplitNodeView
            node={ws.paneTree}
            workspaceId={ws.id}
            workspaceCwd={ws.cwd}
            activePaneId={ws.activePaneId}
            onActivatePanel={rest.onActivatePanel}
            onClosePanel={rest.onClosePanel}
            onFocusPane={rest.onFocusPane}
            onNewTerminal={rest.onNewTerminal}
            onDividerChange={rest.onDividerChange}
            callbacks={rest.callbacks}
          />
        </div>
      ))}
    </div>
  );
}
