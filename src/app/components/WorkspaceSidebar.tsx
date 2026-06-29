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
import { Cancel01Icon, PencilEdit01Icon, Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { resolveWorkspaceColor } from "@/modules/workspaces/lib/workspaceColor";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useWorkspaceRenameStore } from "@/modules/workspaces/lib/workspaceRenameStore";
import { getShortcutLabel } from "@/modules/shortcuts/shortcuts";
import { usePreferencesStore } from "@/modules/settings/preferences";

type WorkspaceItem = { id: string; title: string; kind: string; cwd?: string; color?: string | null };

export type WorkspaceSidebarProps = {
  workspaces: WorkspaceItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onReorder: (fromId: string, toId: string) => void;
  onClose?: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onOpenSettings: (id: string) => void;
};

function abbrev(title: string, kind: string): string {
  const text = title.trim() || kind;
  const words = text.split(/[\s\-_/]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

function SortableWorkspaceItem({
  ws,
  active,
  onSelect,
  onClose,
  onRename,
  onOpenSettings,
}: {
  ws: WorkspaceItem;
  active: boolean;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onOpenSettings: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ws.id });
  const displayColor = resolveWorkspaceColor(ws.color, ws.id);

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isRenaming = useWorkspaceRenameStore((s) => s.renamingId === ws.id);
  const clearRename = useWorkspaceRenameStore((s) => s.clearRename);
  const startRename = useWorkspaceRenameStore((s) => s.startRename);

  const shortcuts = usePreferencesStore((s) => s.shortcuts);
  const renameLabel = getShortcutLabel("workspace.rename", shortcuts);
  const settingsLabel = getShortcutLabel("workspace.settings", shortcuts);
  const closeLabel = getShortcutLabel("workspace.close", shortcuts);

  const inputRef = useRef<HTMLInputElement>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    if (isRenaming) {
      handledRef.current = false;
      // Focus the input after the popover opens
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          el.value = ws.title;
          el.select();
          el.focus();
        }
      });
    }
  }, [isRenaming, ws.title]);

  function handleSave() {
    if (handledRef.current) return;
    handledRef.current = true;
    const value = inputRef.current?.value.trim() ?? "";
    if (value) onRename(ws.id, value);
    clearRename();
  }

  function handleCancel() {
    if (handledRef.current) return;
    handledRef.current = true;
    clearRename();
  }

  const button = (
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
            ? displayColor !== null
              ? {
                  backgroundColor: displayColor,
                  boxShadow: `0 0 0 2px hsl(var(--card) / 1), 0 0 0 4px ${displayColor}`,
                }
              : {
                  backgroundColor: "hsl(var(--muted))",
                  boxShadow: "0 0 0 2px hsl(var(--card) / 1), 0 0 0 4px hsl(var(--border))",
                }
            : undefined
        }
        {...attributes}
        {...listeners}
        aria-pressed={active}
      >
        {abbrev(ws.title, ws.kind)}
      </button>
      {!active && displayColor && (
        <span
          className="absolute inset-y-2 left-0 w-[3px] rounded-full"
          style={{ backgroundColor: displayColor }}
        />
      )}
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

  return (
    <Popover
      open={isRenaming}
      onOpenChange={(open) => { if (!open) handleSave(); }}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <PopoverAnchor asChild>
            {button}
          </PopoverAnchor>
        </ContextMenuTrigger>
        <ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
          <ContextMenuItem onSelect={() => startRename(ws.id)}>
            <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={2} />
            Rename Workspace
            {renameLabel && <ContextMenuShortcut>{renameLabel}</ContextMenuShortcut>}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onOpenSettings(ws.id)}>
            <HugeiconsIcon icon={Settings01Icon} size={14} strokeWidth={2} />
            Workspace Settings
            {settingsLabel && <ContextMenuShortcut>{settingsLabel}</ContextMenuShortcut>}
          </ContextMenuItem>
          <ContextMenuSeparator />
          {onClose && (
            <ContextMenuItem onSelect={() => onClose(ws.id)} className="text-destructive focus:text-destructive">
              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
              Close Workspace
              {closeLabel && <ContextMenuShortcut>{closeLabel}</ContextMenuShortcut>}
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
      <PopoverContent
        side="right"
        align="center"
        className="w-48 p-1.5"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={handleSave}
        onEscapeKeyDown={handleCancel}
      >
        <input
          ref={inputRef}
          type="text"
          defaultValue={ws.title}
          placeholder={ws.kind}
          className="w-full rounded bg-transparent px-1.5 py-1 text-[12px] outline-none ring-1 ring-border focus:ring-primary"
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); handleSave(); }
            else if (e.key === "Escape") { e.preventDefault(); handleCancel(); }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function WorkspaceSidebar({ workspaces, activeId, onSelect, onNew, onReorder, onClose, onRename, onOpenSettings }: WorkspaceSidebarProps) {
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
              onRename={onRename}
              onOpenSettings={onOpenSettings}
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
