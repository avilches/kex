import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Cancel01Icon, CheckmarkCircle01Icon, ChevronRightIcon, Delete02Icon, PencilEdit01Icon, Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { resolveWorkspaceColor } from "@/modules/workspaces/lib/workspaceColor";
import { getWorkspaceIcon } from "@/modules/workspaces/lib/workspaceIcon";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useWorkspaceRenameStore } from "@/modules/workspaces/lib/workspaceRenameStore";
import { getShortcutLabel } from "@/modules/shortcuts/shortcuts";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { groupWorkspaces, NO_STATUS_GROUP_ID } from "@/modules/workspaces/lib/workspaceOrder";
import type { WorkspaceStatus } from "@/modules/settings/store";

type WorkspaceItem = {
  id: string;
  title: string;
  kind: string;
  cwd?: string;
  color?: string | null;
  icon?: string;
  statusId?: string;
};

export type WorkspaceSidebarProps = {
  workspaces: WorkspaceItem[];
  activeId: string | null;
  workspaceStatuses: WorkspaceStatus[];
  onSelect: (id: string) => void;
  onNew: () => void;
  onReorder: (fromId: string, toId: string) => void;
  onSetStatus: (id: string, statusId: string | null) => void;
  onClose?: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onOpenSettings: (id: string) => void;
  width: number;
  onWidthChange: (w: number) => void;
  collapsedGroups: Set<string>;
  onToggleGroup: (statusId: string) => void;
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
  sidebarWidth,
  workspaceStatuses,
  onSelect,
  onClose,
  onRename,
  onOpenSettings,
  onSetStatus,
}: {
  ws: WorkspaceItem;
  active: boolean;
  sidebarWidth: number;
  workspaceStatuses: WorkspaceStatus[];
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onOpenSettings: (id: string) => void;
  onSetStatus: (id: string, statusId: string | null) => void;
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

  const compact = sidebarWidth <= 80;

  const button = (
    <div ref={setNodeRef} className="group relative w-full px-1.5" style={style}>
      <button
        type="button"
        title={ws.cwd ? `${ws.title || ws.kind}: ${ws.cwd}` : (ws.title || ws.kind)}
        onClick={() => onSelect(ws.id)}
        onDoubleClick={() => onOpenSettings(ws.id)}
        className={cn(
          "flex w-full items-center rounded-lg font-semibold transition-all select-none",
          compact
            ? "h-9 justify-center text-[12px]"
            : "h-9 gap-2 px-2.5 text-[12px]",
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
        {compact ? (
          ws.icon && getWorkspaceIcon(ws.icon)
            ? <HugeiconsIcon icon={getWorkspaceIcon(ws.icon)!} size={22} strokeWidth={1.5} />
            : <span className="text-[12px]">{abbrev(ws.title, ws.kind)}</span>
        ) : (
          <>
            {ws.icon && getWorkspaceIcon(ws.icon) && (
              <HugeiconsIcon icon={getWorkspaceIcon(ws.icon)!} size={18} strokeWidth={1.5} className="shrink-0" />
            )}
            <span className="truncate">{ws.title || ws.kind}</span>
          </>
        )}
      </button>
      {!active && displayColor && (
        <span
          className="absolute inset-y-2 left-1.5 w-[3px] rounded-full"
          style={{ backgroundColor: displayColor }}
        />
      )}
      {onClose && (
        <button
          type="button"
          title="Close workspace"
          onClick={(e) => { e.stopPropagation(); onClose(ws.id); }}
          className="absolute -right-0 -top-1 hidden size-[14px] items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-destructive/80 hover:text-white group-hover:flex"
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
            Rename
            {renameLabel && <ContextMenuShortcut>{renameLabel}</ContextMenuShortcut>}
          </ContextMenuItem>
          {workspaceStatuses.length > 0 && (
            <ContextMenuSub>
              <ContextMenuSubTrigger className="gap-2">
                <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} strokeWidth={2} />
                Set status
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="max-h-[420px] overflow-y-auto">
                <ContextMenuRadioGroup
                  value={ws.statusId ?? ""}
                  onValueChange={(value) => onSetStatus(ws.id, value === "" ? null : value)}
                >
                  <ContextMenuRadioItem value="">
                    No status
                  </ContextMenuRadioItem>
                  <ContextMenuSeparator />
                  {workspaceStatuses.map((s) => (
                    <ContextMenuRadioItem key={s.id} value={s.id}>
                      {s.label}
                    </ContextMenuRadioItem>
                  ))}
                </ContextMenuRadioGroup>
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          {onClose && (
            <ContextMenuItem onSelect={() => onClose(ws.id)} className="text-destructive focus:text-destructive">
              <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
              Delete
              {closeLabel && <ContextMenuShortcut>{closeLabel}</ContextMenuShortcut>}
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onOpenSettings(ws.id)}>
            <HugeiconsIcon icon={Settings01Icon} size={14} strokeWidth={2} />
            Properties
            {settingsLabel && <ContextMenuShortcut>{settingsLabel}</ContextMenuShortcut>}
          </ContextMenuItem>
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

export function WorkspaceSidebar({
  workspaces,
  activeId,
  workspaceStatuses,
  onSelect,
  onNew,
  onReorder,
  onSetStatus,
  onClose,
  onRename,
  onOpenSettings,
  width,
  onWidthChange,
  collapsedGroups,
  onToggleGroup,
}: WorkspaceSidebarProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [isDragging, setIsDragging] = useState(false);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  // null = "had no status"; undefined = "no drag in progress"
  const [dragStartStatus, setDragStartStatus] = useState<string | null | undefined>(undefined);
  const compact = width <= 80;

  const groups = useMemo(
    () => groupWorkspaces(workspaces, workspaceStatuses),
    [workspaces, workspaceStatuses],
  );

  function findGroupId(itemId: string): string | null {
    for (const g of groups) {
      if (g.items.some((w) => w.id === itemId)) return g.id;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    setIsDragging(true);
    const id = String(event.active.id);
    setDragActiveId(id);
    const ws = workspaces.find((w) => w.id === id);
    setDragStartStatus(ws?.statusId ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeGroupId = findGroupId(String(active.id));
    const overGroupId = findGroupId(String(over.id));
    if (overGroupId === null || activeGroupId === overGroupId) return;
    onSetStatus(String(active.id), overGroupId === NO_STATUS_GROUP_ID ? null : overGroupId);
  }

  function handleDragCancel() {
    const id = dragActiveId;
    const saved = dragStartStatus;
    setIsDragging(false);
    setDragActiveId(null);
    setDragStartStatus(undefined);
    if (id !== null && saved !== undefined) {
      onSetStatus(id, saved);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setIsDragging(false);
    const id = dragActiveId;
    const saved = dragStartStatus;
    setDragActiveId(null);
    setDragStartStatus(undefined);
    const { active, over } = event;
    if (!over || active.id === over.id) {
      // Dropped in empty space: revert any status change made during drag
      if (id !== null && saved !== undefined) {
        onSetStatus(id, saved);
      }
      return;
    }
    onReorder(String(active.id), String(over.id));
  }

  const dragActiveWs = dragActiveId ? workspaces.find((w) => w.id === dragActiveId) : null;

  return (
    <nav
      aria-label="Workspaces"
      className={cn(
        "relative flex shrink-0 flex-col items-center gap-1.5 border-r border-border/60 bg-card/60 py-2",
        isDragging && "[&_*]:!cursor-grabbing cursor-grabbing",
      )}
      style={{ width }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {groups.map((group) => {
          const isCollapsible = group.label !== null;
          const isCollapsed = isCollapsible && collapsedGroups.has(group.id);
          return (
            <div key={group.id} className="w-full">
              {isCollapsible && (
                compact ? (
                  <button
                    type="button"
                    title={isCollapsed ? `Expand ${group.label}` : `Collapse ${group.label}`}
                    onClick={() => onToggleGroup(group.id)}
                    className="mx-1.5 flex w-[calc(100%-12px)] items-center border-0 py-1.5 outline-none"
                  >
                    <span
                      className={cn(
                        "h-px w-full rounded-full bg-border/40 transition-colors hover:bg-border/80",
                        isCollapsed && "bg-border/70",
                      )}
                    />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onToggleGroup(group.id)}
                    className="flex w-full items-center gap-1 px-1.5 pt-2 pb-0.5 text-left transition-colors hover:text-foreground/80"
                  >
                    <HugeiconsIcon
                      icon={ChevronRightIcon}
                      size={10}
                      strokeWidth={2}
                      className={cn(
                        "shrink-0 text-muted-foreground/60 transition-transform duration-150",
                        !isCollapsed && "rotate-90",
                      )}
                    />
                    <span className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                      {group.label}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/40">
                      {group.items.length}
                    </span>
                  </button>
                )
              )}
              {(() => {
                if (isCollapsed) {
                  const activeWs = group.items.find((ws) => ws.id === activeId);
                  if (!activeWs) return null;
                  return (
                    <SortableContext items={[activeWs.id]} strategy={verticalListSortingStrategy}>
                      <SortableWorkspaceItem
                        ws={activeWs}
                        active={true}
                        sidebarWidth={width}
                        workspaceStatuses={workspaceStatuses}
                        onSelect={onSelect}
                        onClose={onClose}
                        onRename={onRename}
                        onOpenSettings={onOpenSettings}
                        onSetStatus={onSetStatus}
                      />
                    </SortableContext>
                  );
                }
                return (
                  <SortableContext
                    items={group.items.map((w) => w.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {group.items.map((ws) => (
                      <SortableWorkspaceItem
                        key={ws.id}
                        ws={ws}
                        active={ws.id === activeId}
                        sidebarWidth={width}
                        workspaceStatuses={workspaceStatuses}
                        onSelect={onSelect}
                        onClose={onClose}
                        onRename={onRename}
                        onOpenSettings={onOpenSettings}
                        onSetStatus={onSetStatus}
                      />
                    ))}
                  </SortableContext>
                );
              })()}
            </div>
          );
        })}

        <DragOverlay dropAnimation={null}>
          {dragActiveWs ? (() => {
            const displayColor = resolveWorkspaceColor(dragActiveWs.color, dragActiveWs.id);
            return (
              <div
                className={cn(
                  "flex items-center justify-center rounded-lg font-semibold opacity-90",
                  compact ? "h-9 w-9 text-[11px]" : "h-9 px-2 text-[11px]",
                )}
                style={
                  displayColor
                    ? { backgroundColor: displayColor, color: "white" }
                    : { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--foreground))" }
                }
              >
                {compact
                  ? abbrev(dragActiveWs.title, dragActiveWs.kind)
                  : <span className="max-w-full truncate text-center">{dragActiveWs.title || dragActiveWs.kind}</span>
                }
              </div>
            );
          })() : null}
        </DragOverlay>
      </DndContext>

      <div className="flex-1" />
      <button
        type="button"
        title="New workspace (Cmd+N)"
        onClick={onNew}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-border/60 text-lg text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        +
      </button>

      <div
        className="absolute inset-y-0 right-0 flex w-1 cursor-ew-resize items-center justify-center outline-none hover:bg-primary/20 active:bg-primary/30"
        onPointerDown={(e) => {
          const startX = e.clientX;
          const startWidth = width;
          e.currentTarget.setPointerCapture(e.pointerId);
          const onMove = (ev: PointerEvent) => {
            const next = Math.min(220, Math.max(52, startWidth + (ev.clientX - startX)));
            onWidthChange(next);
          };
          const onUp = () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
          };
          document.addEventListener("pointermove", onMove);
          document.addEventListener("pointerup", onUp);
        }}
      >
        <div className="pointer-events-none h-6 w-0.5 rounded-full bg-border" />
      </div>
    </nav>
  );
}
