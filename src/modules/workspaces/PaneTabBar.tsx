import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { panelIcon, panelTitle } from "./lib/panelTitle";
import type { Panel } from "./lib/types";
import { usePreferencesStore } from "@/modules/settings/preferences";

type Props = {
  panels: Panel[];
  activePanelId: string | null;
  paneFocused: boolean;
  workspaceId: string;
  onActivate: (panelId: string) => void;
  onClose: (panelId: string) => void;
  onNewTerminal: () => void;
};

function DraggableTab({
  panel,
  activePanelId,
  paneFocused,
  workspaceId,
  onActivate,
  onClose,
}: {
  panel: Panel;
  activePanelId: string | null;
  paneFocused: boolean;
  workspaceId: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: panel.id });
  const active = panel.id === activePanelId;
  const title = panelTitle(panel);
  const tabBarStyle = usePreferencesStore((s) => s.tabBarStyle);
  const connected = tabBarStyle === "connected";

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative flex min-w-[100px] max-w-[200px] shrink-0 cursor-grab active:cursor-grabbing select-none items-center gap-1 px-1.5 text-[11px] transition-colors",
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
        isDragging && "opacity-40",
      )}
      onClick={() => onActivate(panel.id)}
    >
      {active && paneFocused && (
        <div className={cn("absolute inset-x-0 top-0 bg-primary", connected ? "h-[1.5px]" : "h-0.5 rounded-t")} />
      )}
      <span className="shrink-0 opacity-70">{panelIcon(panel, workspaceId)}</span>
      <span
        className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
        style={{ direction: panel.kind === "terminal" ? "rtl" : "ltr", unicodeBidi: "plaintext" }}
        title={title}
      >
        {title}
      </span>
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

export function PaneTabBar({ panels, activePanelId, paneFocused, workspaceId, onActivate, onClose, onNewTerminal }: Props) {
  const tabBarStyle = usePreferencesStore((s) => s.tabBarStyle);
  return (
    <div className={cn(
      "flex h-7 shrink-0 items-center overflow-x-auto bg-card/60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      tabBarStyle === "connected"
        ? "gap-0 border-t border-border/60"
        : "gap-0.5 border-b border-border/60 px-1",
    )}>
      {panels.map((p) => (
        <DraggableTab
          key={p.id}
          panel={p}
          activePanelId={activePanelId}
          paneFocused={paneFocused}
          workspaceId={workspaceId}
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
