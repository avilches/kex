import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { panelIcon, panelTitle } from "./lib/panelTitle";
import type { Panel } from "./lib/types";

type Props = {
  panels: Panel[];
  activePanelId: string | null;
  paneFocused: boolean;
  onActivate: (panelId: string) => void;
  onClose: (panelId: string) => void;
  onNewTerminal: () => void;
};

function DraggableTab({
  panel,
  activePanelId,
  paneFocused,
  onActivate,
  onClose,
}: {
  panel: Panel;
  activePanelId: string | null;
  paneFocused: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: panel.id });
  const active = panel.id === activePanelId;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative flex h-5 min-w-0 max-w-[140px] shrink-0 cursor-grab active:cursor-grabbing select-none items-center gap-1 rounded px-1.5 text-[11px] transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        isDragging && "opacity-40",
      )}
      onClick={() => onActivate(panel.id)}
    >
      {active && paneFocused && (
        <div className="absolute inset-x-0 top-0 h-0.5 rounded-t bg-primary" />
      )}
      <span className="shrink-0 text-[10px] opacity-70">{panelIcon(panel)}</span>
      <span className="truncate">{panelTitle(panel)}</span>
      {panel.kind === "editor" && panel.dirty && (
        <span className="shrink-0 text-[8px] text-primary">●</span>
      )}
      <button
        type="button"
        className="ml-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onClose(panel.id);
        }}
        title="Close panel"
      >
        ×
      </button>
    </div>
  );
}

export function PaneTabBar({ panels, activePanelId, paneFocused, onActivate, onClose, onNewTerminal }: Props) {
  return (
    <div className="flex h-7 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border/60 bg-card/60 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {panels.map((p) => (
        <DraggableTab
          key={p.id}
          panel={p}
          activePanelId={activePanelId}
          paneFocused={paneFocused}
          onActivate={onActivate}
          onClose={onClose}
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
