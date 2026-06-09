import { useDroppable, useDndMonitor } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { useCallback, useState } from "react";
import { PaneTabBar } from "./PaneTabBar";
import { PanelContent } from "./PanelContent";
import type { PanelCallbacks } from "./PanelContent";
import type { PaneNode } from "./lib/types";

type Props = {
  pane: PaneNode;
  workspaceId: string;
  workspaceCwd?: string;
  focused: boolean;
  onActivatePanel: (workspaceId: string, panelId: string) => void;
  onClosePanel: (workspaceId: string, panelId: string) => void;
  onFocusPane: (workspaceId: string, paneId: string) => void;
  onNewTerminal: (workspaceId: string, paneId: string) => void;
  callbacks: PanelCallbacks;
};

function DropZone({ id, className }: { id: string; className: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute transition-colors",
        className,
        isOver ? "bg-primary/25 ring-1 ring-inset ring-primary/60" : "bg-transparent",
      )}
    />
  );
}

export function PaneView({
  pane,
  workspaceId,
  workspaceCwd: _workspaceCwd,
  focused,
  onActivatePanel,
  onClosePanel,
  onFocusPane,
  onNewTerminal,
  callbacks,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);

  useDndMonitor({
    onDragStart: () => setIsDragging(true),
    onDragEnd: () => setIsDragging(false),
    onDragCancel: () => setIsDragging(false),
  });

  const handleFocus = useCallback(() => {
    if (!focused) onFocusPane(workspaceId, pane.id);
  }, [focused, workspaceId, pane.id, onFocusPane]);

  return (
    <div
      className="relative flex h-full flex-col"
      onMouseDownCapture={handleFocus}
      onFocus={handleFocus}
    >
      <PaneTabBar
        panels={pane.panels}
        activePanelId={pane.activePanelId}
        onActivate={(panelId) => onActivatePanel(workspaceId, panelId)}
        onClose={(panelId) => onClosePanel(workspaceId, panelId)}
        onNewTerminal={() => onNewTerminal(workspaceId, pane.id)}
      />
      <div className="relative min-h-0 flex-1">
        {pane.panels.map((panel) => (
          <div
            key={panel.id}
            className={cn(
              "absolute inset-0",
              panel.id !== pane.activePanelId && "invisible pointer-events-none",
            )}
          >
            <PanelContent
              panel={panel}
              visible={panel.id === pane.activePanelId}
              focused={focused && panel.id === pane.activePanelId}
              callbacks={callbacks}
            />
          </div>
        ))}
        {pane.panels.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Empty pane — click + to add a terminal
          </div>
        )}

        {/* 5-zone drop overlay — only visible during an active panel drag */}
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-40">
            <DropZone
              id={`zone:${pane.id}:top`}
              className="pointer-events-auto left-0 right-0 top-0 h-1/4"
            />
            <DropZone
              id={`zone:${pane.id}:bottom`}
              className="pointer-events-auto bottom-0 left-0 right-0 h-1/4"
            />
            <DropZone
              id={`zone:${pane.id}:left`}
              className="pointer-events-auto bottom-1/4 left-0 top-1/4 w-1/4"
            />
            <DropZone
              id={`zone:${pane.id}:right`}
              className="pointer-events-auto bottom-1/4 right-0 top-1/4 w-1/4"
            />
            <DropZone
              id={`zone:${pane.id}:center`}
              className="pointer-events-auto bottom-1/4 left-1/4 right-1/4 top-1/4"
            />
          </div>
        )}
      </div>
    </div>
  );
}
