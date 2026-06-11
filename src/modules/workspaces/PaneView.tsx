import { useDroppable, useDndMonitor } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { PaneTabBar } from "./PaneTabBar";
import { PanelContent } from "./PanelContent";
import type { PanelCallbacks } from "./PanelContent";
import type { PaneNode } from "./lib/types";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { poolSlotStats } from "@/modules/terminal/lib/rendererPool";
import { useTheme } from "@/modules/theme";

type Props = {
  pane: PaneNode;
  workspaceId: string;
  workspaceCwd?: string;
  focused: boolean;
  isWorkspaceActive: boolean;
  onActivatePanel: (workspaceId: string, panelId: string) => void;
  onClosePanel: (workspaceId: string, panelId: string) => void;
  onFocusPane: (workspaceId: string, paneId: string) => void;
  onNewTerminal: (workspaceId: string, paneId: string) => void;
  callbacks: PanelCallbacks;
};

function DropZone({
  id,
  hitClassName,
  visualClassName,
}: {
  id: string;
  hitClassName: string;
  visualClassName: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <>
      <div
        ref={setNodeRef}
        className={cn("absolute cursor-grabbing", hitClassName)}
      />
      {isOver && (
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

export function PaneView({
  pane,
  workspaceId,
  workspaceCwd: _workspaceCwd,
  focused,
  isWorkspaceActive,
  onActivatePanel,
  onClosePanel,
  onFocusPane,
  onNewTerminal,
  callbacks,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
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

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  const activePanel = pane.panels.find((p) => p.id === pane.activePanelId);
  const isTerminal = activePanel?.kind === "terminal";
  const hasGpu = isTerminal && poolSlotStats().some(
    (s) => s.leafId === pane.activePanelId && s.webgl,
  );

  useDndMonitor({
    onDragStart: () => setIsDragging(true),
    onDragEnd: () => setIsDragging(false),
    onDragCancel: () => setIsDragging(false),
  });

  const { resolvedTheme } = useTheme();
  const dimOpacity = focused ? 0 : (resolvedTheme.inactivePaneDim?.[activePanel?.kind ?? ""] ?? 0);

  const handleFocus = useCallback(() => {
    if (!focused) onFocusPane(workspaceId, pane.id);
  }, [focused, workspaceId, pane.id, onFocusPane]);

  return (
    <div
      ref={containerRef}
      data-pane-id={pane.id}
      className="relative flex h-full flex-col overflow-hidden"
      onMouseDownCapture={handleFocus}
      onFocus={handleFocus}
    >
      <PaneTabBar
        panels={pane.panels}
        activePanelId={pane.activePanelId}
        paneFocused={focused}
        workspaceId={workspaceId}
        onActivate={(panelId) => onActivatePanel(workspaceId, panelId)}
        onClose={(panelId) => onClosePanel(workspaceId, panelId)}
        onNewTerminal={() => onNewTerminal(workspaceId, pane.id)}
      />
      {/* DEBUG — remove before ship */}
      <div className={cn(
        "pointer-events-none absolute right-1 top-1 z-50 rounded px-1 py-0.5 font-mono text-[10px]",
        (tooNarrow || tooShort) ? "bg-red-500/80 text-white" : "bg-green-600/70 text-white",
      )}>
        {paneSize.w === Infinity ? "?" : `${paneSize.w}x${paneSize.h}`}
        {tooNarrow && tooShort ? " narrow+short" : tooNarrow ? " narrow" : tooShort ? " short" : " OK"}
        {isTerminal && hasGpu && (
          <span className="ml-1 rounded bg-yellow-400/90 px-1 text-black">GPU</span>
        )}
      </div>
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
              visible={panel.id === pane.activePanelId && isWorkspaceActive}
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

        {dimOpacity > 0 && (
          <div
            className="pointer-events-none absolute inset-0 z-10 bg-black"
            style={{ opacity: dimOpacity }}
          />
        )}

        {/* drop overlay — only register/show for the active workspace */}
        {isDragging && isWorkspaceActive && (
          <div className="pointer-events-none absolute inset-0 z-40">
            {tooNarrow && tooShort ? (
              // Both dimensions too small: center only, full pane hit area
              <DropZone
                id={`zone:${pane.id}:center`}
                hitClassName="pointer-events-auto inset-0"
                visualClassName="inset-0 rounded-md"
              />
            ) : (
              <>
                {!tooShort && (
                  <>
                    <DropZone
                      id={`zone:${pane.id}:top`}
                      hitClassName="pointer-events-auto left-0 right-0 top-0 h-1/4"
                      visualClassName="left-0 right-0 top-0 h-1/2 rounded-t-md"
                    />
                    <DropZone
                      id={`zone:${pane.id}:bottom`}
                      hitClassName="pointer-events-auto bottom-0 left-0 right-0 h-1/4"
                      visualClassName="bottom-0 left-0 right-0 h-1/2 rounded-b-md"
                    />
                  </>
                )}
                {!tooNarrow && (
                  <>
                    <DropZone
                      id={`zone:${pane.id}:left`}
                      hitClassName={cn(
                        "pointer-events-auto left-0 w-1/4",
                        tooShort ? "inset-y-0" : "bottom-1/4 top-1/4",
                      )}
                      visualClassName="bottom-0 left-0 top-0 w-1/2 rounded-l-md"
                    />
                    <DropZone
                      id={`zone:${pane.id}:right`}
                      hitClassName={cn(
                        "pointer-events-auto right-0 w-1/4",
                        tooShort ? "inset-y-0" : "bottom-1/4 top-1/4",
                      )}
                      visualClassName="bottom-0 right-0 top-0 w-1/2 rounded-r-md"
                    />
                  </>
                )}
                <DropZone
                  id={`zone:${pane.id}:center`}
                  hitClassName={cn(
                    "pointer-events-auto",
                    // When some directional zones are absent, expand center to fill the gap
                    tooNarrow
                      ? "inset-y-1/4 left-0 right-0"
                      : tooShort
                        ? "inset-x-1/4 top-0 bottom-0"
                        : "bottom-1/4 left-1/4 right-1/4 top-1/4",
                  )}
                  visualClassName="inset-0 rounded-md"
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
