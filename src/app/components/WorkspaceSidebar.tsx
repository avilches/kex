import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type WorkspaceItem = { id: string; title: string; kind: string; cwd?: string };

export type WorkspaceSidebarProps = {
  workspaces: WorkspaceItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onReorder: (fromId: string, toId: string) => void;
  onClose?: (id: string) => void;
};

function abbrev(title: string, kind: string): string {
  const text = title.trim() || kind;
  const words = text.split(/[\s\-_/]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

// Stable hue 0–359 derived from the workspace ID string.
function idHue(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return (h >>> 0) % 360;
}

function SortableWorkspaceItem({
  ws,
  active,
  onSelect,
  onClose,
}: {
  ws: WorkspaceItem;
  active: boolean;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ws.id });
  const hue = idHue(ws.id);

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} className="group relative" style={style}>
      <button
        type="button"
        title={ws.cwd ? `${ws.title || ws.kind}: ${ws.cwd}` : (ws.title || ws.kind)}
        onClick={() => onSelect(ws.id)}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg text-[11px] font-semibold transition-all select-none",
          active
            ? "text-white"
            : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        style={
          active
            ? {
                backgroundColor: `hsl(${hue} 55% 42%)`,
                boxShadow: `0 0 0 2px hsl(var(--card) / 1), 0 0 0 4px hsl(${hue} 55% 55%)`,
              }
            : undefined
        }
        {...attributes}
        {...listeners}
        aria-pressed={active}
      >
        {abbrev(ws.title, ws.kind)}
      </button>
      {onClose && (
        <button
          type="button"
          title="Close workspace"
          onClick={(e) => { e.stopPropagation(); onClose(ws.id); }}
          className="absolute -right-1 -top-1 hidden size-[14px] items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-destructive/80 hover:text-white group-hover:flex"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

export function WorkspaceSidebar({ workspaces, activeId, onSelect, onNew, onReorder, onClose }: WorkspaceSidebarProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [isDragging, setIsDragging] = useState(false);

  function handleDragStart(_event: DragStartEvent) {
    setIsDragging(true);
  }

  function handleDragCancel() {
    setIsDragging(false);
  }

  function handleDragEnd(event: DragEndEvent) {
    setIsDragging(false);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  }

  return (
    <nav
      aria-label="Workspaces"
      className={cn(
        "flex w-[52px] shrink-0 flex-col items-center gap-1.5 border-r border-border/60 bg-card/60 py-2",
        isDragging && "[&_*]:!cursor-grabbing cursor-grabbing",
      )}
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
        <SortableContext items={workspaces.map((w) => w.id)} strategy={verticalListSortingStrategy}>
          {workspaces.map((ws) => (
            <SortableWorkspaceItem
              key={ws.id}
              ws={ws}
              active={ws.id === activeId}
              onSelect={onSelect}
              onClose={onClose}
            />
          ))}
        </SortableContext>
      </DndContext>
      <div className="flex-1" />
      <button
        type="button"
        title="New workspace (⌘N)"
        onClick={onNew}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-border/60 text-lg text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        +
      </button>
    </nav>
  );
}
