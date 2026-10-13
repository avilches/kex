import { Spinner } from "@/components/ui/spinner";
import {
  closestCenter,
  defaultDropAnimationSideEffects,
  pointerWithin,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  type AgentEntry,
  buildAgentEntries,
  entriesByWorkspace,
  nextEntryTab,
} from "@/modules/agents/lib/notificationList";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import {
  Cancel01Icon,
  ChevronRightIcon,
  Delete02Icon,
  Folder01Icon,
  FolderAddIcon,
  Image01Icon,
  PaintBoardIcon,
  PencilEdit01Icon,
  Settings01Icon,
  SleepingIcon,
  UploadCircle01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  chipColorOnWhite,
  resolveWorkspaceColor,
  WORKSPACE_COLOR_PALETTE,
} from "@/modules/workspaces/lib/workspaceColor";
import { IconPaletteGrid } from "@/modules/workspaces/IconPaletteGrid";
import { getWorkspaceIcon } from "@/modules/workspaces/lib/workspaceIcon";
import { createHoverSwitch, type HoverSwitch } from "@/modules/workspaces/lib/hoverSwitch";
import { canDropTabOnWorkspace } from "@/modules/workspaces/lib/tabDrop";
import { SlideReveal } from "@/app/components/SlideReveal";
import { isFreshHibernate, useJustWoken } from "@/modules/workspaces/lib/hibernateFx";
import { useBarDndBinding, useWorkspaceDnd, useWorkspaceDropTarget } from "@/modules/workspaces/WorkspaceDndProvider";
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
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { useWorkspaceRenameStore } from "@/modules/workspaces/lib/workspaceRenameStore";
import { useGroupRenameStore } from "@/modules/workspaces/lib/groupRenameStore";
import { useContextMenuCloseStore } from "@/modules/workspaces/lib/contextMenuCloseStore";
import { getShortcutLabel } from "@/modules/shortcuts/shortcuts";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { AutoHibernateCountdown } from "./AutoHibernateCountdown";
import { autoHibernateDelayMs } from "@/modules/workspaces/lib/autoHibernate";
import {
  groupDropId,
  groupIdFromGroupId,
  groupWorkspaces,
  groupWorkspacesForDrag,
  parseGroupDropId,
} from "@/modules/workspaces/lib/workspaceOrder";
import type { Tab, WorkspaceGroup } from "@/modules/workspaces/lib/types";
import {
  activeAgentCount,
  hasDetail,
  type DetailFilter,
} from "@/modules/workspaces/lib/workspaceDetail";
import { useDetailFilter } from "@/modules/workspaces/lib/useDetailFilter";
import { WorkspaceDetailList } from "./WorkspaceDetailList";

type WorkspaceItem = {
  id: string;
  title: string;
  kind: string;
  cwd?: string;
  color?: string | null;
  icon?: string;
  groupId?: string;
  tabs: Tab[];
  focusedTabId: string | null;
  // Comma-joined active tab of every pane: the tabs whose note a pane can draw.
  visibleTabIds?: string;
  detailExpanded?: boolean;
  hibernated?: boolean;
  hibernatedAt?: number;
};

export type WorkspaceBarProps = {
  workspaces: WorkspaceItem[];
  activeId: string | null;
  workspaceGroups: WorkspaceGroup[];
  onSelect: (id: string) => void;
  onNew: () => void;
  onReorder: (fromId: string, toId: string) => void;
  onSetGroup: (id: string, groupId: string | null) => void;
  onPreviewGroup: (id: string, groupId: string | null) => void;
  onCommitGroupMove: () => void;
  onCreateGroup: (workspaceId: string) => string;
  onRenameGroup: (groupId: string, label: string) => void;
  onReorderGroups: (fromId: string, toId: string) => void;
  onClose?: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onHibernate?: (id: string) => void;
  onWake?: (id: string) => void;
  onOpenSettings: (id: string) => void;
  onSetColor: (id: string, color: string | null) => void;
  onSetIcon: (id: string, icon: string | null) => void;
  width: number;
  onWidthChange: (w: number) => void;
  collapsedGroups: Set<string>;
  onToggleGroup: (groupId: string) => void;
  onRestoreFocus: () => void;
  onActivateAgentTab: (workspaceId: string, tabId: string) => void;
  onSetDetailExpanded: (id: string, expanded: boolean) => void;
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
  agentEntries,
  onJumpAgent,
  detailFilter,
  onSetDetailExpanded,
  onActivateAgentTab,
  barWidth,
  workspaceGroups,
  onSelect,
  onClose,
  onRename,
  onHibernate,
  onWake,
  onOpenSettings,
  onSetColor,
  onSetIcon,
  onSetGroup,
  onCreateGroup,
  onRestoreFocus,
  hoverSwitch,
}: {
  ws: WorkspaceItem;
  active: boolean;
  agentEntries?: AgentEntry[];
  onJumpAgent: (workspaceId: string, entries: AgentEntry[]) => void;
  detailFilter: DetailFilter;
  onSetDetailExpanded: (id: string, expanded: boolean) => void;
  onActivateAgentTab: (workspaceId: string, tabId: string) => void;
  barWidth: number;
  workspaceGroups: WorkspaceGroup[];
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onHibernate?: (id: string) => void;
  onWake?: (id: string) => void;
  onOpenSettings: (id: string) => void;
  onSetColor: (id: string, color: string | null) => void;
  onSetIcon: (id: string, icon: string | null) => void;
  onSetGroup: (id: string, groupId: string | null) => void;
  onCreateGroup: (workspaceId: string) => string;
  onRestoreFocus: () => void;
  hoverSwitch: HoverSwitch | null;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: ws.id,
    data: { type: "workspace" },
  });
  const displayColor = resolveWorkspaceColor(ws.color, ws.id);
  const dropTarget = useWorkspaceDropTarget();
  const dragging = useWorkspaceDnd().draggingItem;
  const tabDragActive = dragging?.kind === "tab";
  const canDrop = dragging?.kind === "tab" && canDropTabOnWorkspace(dragging.workspaceId, ws);
  const dropHover = canDrop && dropTarget.id === ws.id;
  const lit = (active && !ws.hibernated) || dropHover;

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const activateDetailTab = useCallback(
    (tabId: string) => onActivateAgentTab(ws.id, tabId),
    [onActivateAgentTab, ws.id],
  );

  const isRenaming = useWorkspaceRenameStore((s) => s.renamingId === ws.id);
  const clearRename = useWorkspaceRenameStore((s) => s.clearRename);
  const startRename = useWorkspaceRenameStore((s) => s.startRename);

  const [menuOpen, setMenuOpen] = useState(false);
  const closeSignal = useContextMenuCloseStore((s) => s.signal);
  // biome-ignore lint/correctness/useExhaustiveDependencies: closeSignal is a bump counter, only its change matters
  useEffect(() => {
    setMenuOpen(false);
  }, [closeSignal]);

  const shortcuts = usePreferencesStore((s) => s.shortcuts);
  const renameLabel = getShortcutLabel("workspace.rename", shortcuts);
  const hibernateLabel = getShortcutLabel("workspace.hibernate", shortcuts);
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

  const wokenAt = useJustWoken(ws.hibernated);
  const fresh = !!ws.hibernated && isFreshHibernate(ws.hibernatedAt);
  const chipFx = fresh ? "in" : wokenAt !== null ? "out" : null;
  const hibernatedLook = ws.hibernated ? (fresh ? "in" : "static") : chipFx;
  const compact = barWidth <= 80;
  const showDetail = !compact && hasDetail(detailFilter);
  const expanded = showDetail && !!ws.detailExpanded && !ws.hibernated;
  const agentCount = activeAgentCount(agentEntries);

  const autoHibernate = usePreferencesStore((s) => s.autoHibernate);
  const showCountdown =
    !active && !ws.hibernated && !compact && autoHibernateDelayMs(autoHibernate) !== null;

  const sideControl =
    "absolute top-1/2 z-10 flex -translate-y-1/2 items-center justify-center rounded outline-none focus-visible:ring-1 focus-visible:ring-ring";

  const detailSpacer = showDetail ? <span aria-hidden className="size-[14px] shrink-0" /> : null;
  const detailToggle = showDetail ? (
    <button
      type="button"
      aria-expanded={ws.hibernated ? undefined : expanded}
      aria-label={ws.hibernated ? "Restore" : expanded ? "Hide tabs" : "Show tabs"}
      title={ws.hibernated ? "Restore" : expanded ? "Hide tabs" : "Show tabs"}
      onClick={() => {
        if (ws.hibernated) {
          onSetDetailExpanded(ws.id, true);
          onWake?.(ws.id);
        } else onSetDetailExpanded(ws.id, !expanded);
      }}
      className={cn(sideControl, "left-4 size-[14px] opacity-60 hover:opacity-100 focus-visible:opacity-100")}
    >
      <HugeiconsIcon
        icon={ChevronRightIcon}
        size={12}
        strokeWidth={2}
        className={cn("transition-transform", expanded && "rotate-90")}
      />
    </button>
  ) : null;

  const agentLabel = agentEntries
    ? agentEntries.length > 1
      ? `${agentEntries.length} agents, click to visit the next`
      : agentEntries[0].visual === "working"
        ? "Agent working"
        : "Agent needs you"
    : "";
  const agentSpacer = agentEntries && !compact ? <span aria-hidden className="size-[10px] shrink-0" /> : null;
  const agentIndicator = agentEntries ? (
    <button
      type="button"
      title={agentLabel}
      aria-label={agentLabel}
      onClick={() => onJumpAgent(ws.id, agentEntries)}
      className={cn(
        "z-10 flex size-[12px] items-center justify-center rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-ring",
        compact ? "absolute right-1 top-1" : "absolute right-4 top-1/2 -translate-y-1/2",
      )}
    >
      {agentEntries[0].visual === "working" ? (
        <Spinner size={11} className="text-white" />
      ) : (
        <span
          className={cn(
            "size-[6px] rounded-full",
            agentEntries[0].visual === "error"
              ? "bg-destructive"
              : "bg-amber-400",
          )}
        />
      )}
    </button>
  ) : null;

  const button = (
    <div
      ref={setNodeRef}
      className="group relative w-full px-1.5"
      style={style}
      onPointerEnter={() => {
        if (!tabDragActive) return;
        if (canDrop) dropTarget.set(ws.id);
        hoverSwitch?.enter(ws.id);
      }}
      onPointerLeave={() => {
        if (!tabDragActive) return;
        if (dropTarget.id === ws.id) dropTarget.set(null);
        hoverSwitch?.leave(ws.id);
      }}
    >
      <PopoverAnchor asChild>
      <div className="relative -mx-1.5 px-1.5">
        <button
          type="button"
          title={
            ws.cwd ? `${ws.title || ws.kind}: ${ws.cwd}` : ws.title || ws.kind
          }
          onClick={() => {
            if (active) onRestoreFocus();
            else onSelect(ws.id);
          }}
          onDoubleClick={() => (ws.hibernated ? onWake?.(ws.id) : onOpenSettings(ws.id))}
          className={cn(
            "flex w-full items-center rounded-lg font-semibold transition-all select-none",
            compact
              ? "h-9 justify-center text-[12px]"
              : "h-9 gap-2 px-2.5 text-[12px]",
            hibernatedLook && "relative overflow-hidden",
            chipFx && "hib-chip-pop",
            lit
              ? "text-foreground"
              : "bg-foreground/[0.09] text-muted-foreground hover:bg-foreground/[0.14] hover:text-foreground",
          )}
          style={
            lit
              ? expanded
                ? {
                    boxShadow: `inset 0 0 0 1px ${displayColor ?? "var(--ring)"}`,
                  }
                : displayColor !== null
                ? {
                    backgroundColor: chipColorOnWhite(displayColor),
                    color: "#ffffff",
                    boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.4)",
                  }
                : {
                    backgroundColor: "var(--muted)",
                    boxShadow: "inset 0 0 0 1px var(--ring)",
                  }
              : undefined
          }
          {...attributes}
          {...listeners}
          aria-pressed={active}
        >
          {hibernatedLook && (
            <span
              key={hibernatedLook === "out" ? wokenAt : ws.hibernatedAt}
              aria-hidden
              className={cn(
                "ws-hib-look",
                hibernatedLook !== "static" && `ws-hib-look-${hibernatedLook}`,
                active && ws.hibernated && "ws-hib-look-focused",
              )}
            />
          )}
          {compact ? (
            ws.icon && getWorkspaceIcon(ws.icon) ? (
              <HugeiconsIcon
                icon={getWorkspaceIcon(ws.icon)!}
                size={22}
                strokeWidth={1.5}
              />
            ) : (
              <span className="text-[12px]">{abbrev(ws.title, ws.kind)}</span>
            )
          ) : (
            <>
              {detailSpacer}
              {ws.icon && getWorkspaceIcon(ws.icon) && (
                <HugeiconsIcon
                  icon={getWorkspaceIcon(ws.icon)!}
                  size={18}
                  strokeWidth={1.5}
                  className="shrink-0"
                />
              )}
              <span className="truncate">{ws.title || ws.kind}</span>
              {ws.hibernated && <span aria-hidden className="ml-auto size-[13px] shrink-0" />}
              {agentCount > 0 && (
                <span
                  title={`${agentCount} active ${agentCount === 1 ? "agent" : "agents"}`}
                  className="shrink-0 text-[11px] font-normal tabular-nums opacity-50"
                >
                  {agentCount}
                </span>
              )}
              {showCountdown && <AutoHibernateCountdown workspaceId={ws.id} mode={autoHibernate} />}
              {agentSpacer}
            </>
          )}
        </button>
        {!compact && detailToggle}
        {!compact && ws.hibernated && (
          <button
            type="button"
            title="Restore"
            aria-label="Restore"
            className={cn(
              sideControl,
              "group/wake right-4 opacity-0 transition-opacity group-hover:opacity-60 group-focus-within:opacity-60 hover:!opacity-100 focus-visible:!opacity-100",
            )}
            onClick={() => onWake?.(ws.id)}
          >
            <HugeiconsIcon icon={SleepingIcon} size={13} strokeWidth={1.75} className="group-hover/wake:hidden group-focus-visible/wake:hidden" />
            <HugeiconsIcon icon={UploadCircle01Icon} size={13} strokeWidth={1.75} className="hidden group-hover/wake:block group-focus-visible/wake:block" />
          </button>
        )}
        {agentIndicator}
        {!active && displayColor && (
          <span
            className="absolute inset-y-2 left-1.5 w-[3px] rounded-full"
            style={{ backgroundColor: displayColor }}
          />
        )}
      </div>
      </PopoverAnchor>
      <SlideReveal open={expanded}>
        <WorkspaceDetailList
          workspaceId={ws.id}
          tabs={ws.tabs}
          entries={agentEntries}
          filter={detailFilter}
          focusedTabId={active ? ws.focusedTabId : null}
          color={displayColor}
          visibleTabIds={active ? ws.visibleTabIds : ""}
          onActivate={activateDetailTab}
        />
      </SlideReveal>
    </div>
  );

  return (
    <Popover
      open={isRenaming}
      onOpenChange={(open) => {
        if (!open) handleSave();
      }}
    >
      <ContextMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <ContextMenuTrigger asChild>
          {button}
        </ContextMenuTrigger>
        <ContextMenuContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            // Selecting "Rename" (or "New" group) opens a Popover in the same
            // tick the menu closes; restoring focus to the terminal here would
            // steal it from that input and trip its onInteractOutside.
            if (
              useWorkspaceRenameStore.getState().renamingId !== ws.id &&
              useGroupRenameStore.getState().renamingId === null
            ) {
              onRestoreFocus();
            }
          }}
        >
          <ContextMenuItem onSelect={() => startRename(ws.id)}>
            <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={2} />
            Rename Workspace
            {renameLabel && (
              <ContextMenuShortcut>{renameLabel}</ContextMenuShortcut>
            )}
          </ContextMenuItem>
          {ws.hibernated
            ? onWake && (
                <ContextMenuItem onSelect={() => onWake(ws.id)}>
                  <HugeiconsIcon icon={UploadCircle01Icon} size={14} strokeWidth={2} />
                  Restore
                  {hibernateLabel && (
                    <ContextMenuShortcut>{hibernateLabel}</ContextMenuShortcut>
                  )}
                </ContextMenuItem>
              )
            : onHibernate && (
                <ContextMenuItem onSelect={() => onHibernate(ws.id)}>
                  <HugeiconsIcon icon={SleepingIcon} size={14} strokeWidth={2} />
                  Hibernate
                  {hibernateLabel && (
                    <ContextMenuShortcut>{hibernateLabel}</ContextMenuShortcut>
                  )}
                </ContextMenuItem>
              )}
          <ContextMenuSub>
            <ContextMenuSubTrigger className="gap-2">
              <HugeiconsIcon icon={PaintBoardIcon} size={14} strokeWidth={2} />
              Color
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="p-2">
              <div className="grid grid-cols-6 gap-1.5">
                <button
                  type="button"
                  title="No color"
                  onClick={() => {
                    onSetColor(ws.id, null);
                    setMenuOpen(false);
                  }}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full border-2 bg-muted text-muted-foreground transition-colors",
                    ws.color === null
                      ? "border-foreground"
                      : "border-transparent hover:border-muted-foreground/50",
                  )}
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
                </button>
                {WORKSPACE_COLOR_PALETTE.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    title={hex}
                    onClick={() => {
                      onSetColor(ws.id, hex);
                      setMenuOpen(false);
                    }}
                    className={cn(
                      "size-6 rounded-full border-2 transition-colors",
                      ws.color === hex
                        ? "border-foreground"
                        : "border-transparent hover:border-foreground/40",
                    )}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger className="gap-2">
              <HugeiconsIcon icon={Image01Icon} size={14} strokeWidth={2} />
              Icon
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="max-h-[320px] w-[288px] overflow-y-auto p-2">
              <IconPaletteGrid
                value={ws.icon}
                onSelect={(icon) => {
                  onSetIcon(ws.id, icon);
                  setMenuOpen(false);
                }}
              />
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger className="gap-2">
              <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={2} />
              Move to Group
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="max-h-[420px] overflow-y-auto">
              <ContextMenuItem
                onSelect={() => {
                  const groupId = onCreateGroup(ws.id);
                  useGroupRenameStore.getState().startRename(groupId);
                }}
              >
                <HugeiconsIcon icon={FolderAddIcon} size={14} strokeWidth={2} />
                New
              </ContextMenuItem>
              {(workspaceGroups.length > 0 || ws.groupId) && (
                <ContextMenuSeparator />
              )}
              <ContextMenuRadioGroup
                value={ws.groupId ?? ""}
                onValueChange={(value) =>
                  onSetGroup(ws.id, value === "" ? null : value)
                }
              >
                {workspaceGroups.map((g) => (
                  <ContextMenuRadioItem key={g.id} value={g.id}>
                    {g.label}
                  </ContextMenuRadioItem>
                ))}
                {ws.groupId && (
                  <>
                    {workspaceGroups.length > 0 && <ContextMenuSeparator />}
                    <ContextMenuRadioItem value="">
                      No group
                    </ContextMenuRadioItem>
                  </>
                )}
              </ContextMenuRadioGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>
          {onClose && (
            <ContextMenuItem
              onSelect={() => onClose(ws.id)}
              className="text-destructive focus:text-destructive"
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
              Close Workspace
              {closeLabel && (
                <ContextMenuShortcut>{closeLabel}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onOpenSettings(ws.id)}>
            <HugeiconsIcon icon={Settings01Icon} size={14} strokeWidth={2} />
            Properties
            {settingsLabel && (
              <ContextMenuShortcut>{settingsLabel}</ContextMenuShortcut>
            )}
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
            if (e.key === "Enter") {
              e.preventDefault();
              handleSave();
            } else if (e.key === "Escape") {
              e.preventDefault();
              handleCancel();
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

// A group's draggable unit is its header PLUS its (variably many) workspace
// items, but only the header should be grabbable. useSortable is called once
// here, on the whole block, so dnd-kit measures and animates its real height;
// attributes/listeners are handed down to just the header (the drag handle)
// instead of being attached to this wrapper. Attaching useSortable to the
// header alone (the earlier approach) made dnd-kit's vertical strategy treat
// every group as header-sized, producing a swap-like reorder that ignored
// how many workspaces each group actually holds.
type SortableHandleProps = Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "listeners"
>;

function SortableGroupBlock({
  groupId,
  disabled,
  children,
}: {
  groupId: string;
  disabled: boolean;
  children: (handle: SortableHandleProps) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: groupId,
    data: { type: "group" },
    disabled,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex w-full flex-col gap-px">
      {children({ attributes, listeners })}
    </div>
  );
}

function SortableGroupHeader({
  groupId,
  label,
  itemCount,
  compact,
  isCollapsed,
  onToggleGroup,
  onRenameGroup,
  attributes,
  listeners,
}: {
  groupId: string;
  label: string;
  itemCount: number;
  compact: boolean;
  isCollapsed: boolean;
  onToggleGroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, label: string) => void;
} & SortableHandleProps) {
  const isRenaming = useGroupRenameStore((s) => s.renamingId === groupId);
  const clearRename = useGroupRenameStore((s) => s.clearRename);
  const startRename = useGroupRenameStore((s) => s.startRename);
  const inputRef = useRef<HTMLInputElement>(null);
  const handledRef = useRef(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const closeSignal = useContextMenuCloseStore((s) => s.signal);
  // biome-ignore lint/correctness/useExhaustiveDependencies: closeSignal is a bump counter, only its change matters
  useEffect(() => {
    setMenuOpen(false);
  }, [closeSignal]);

  useEffect(() => {
    if (isRenaming) {
      handledRef.current = false;
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          el.value = label;
          el.select();
          el.focus();
        }
      });
    }
  }, [isRenaming, label]);

  function handleSave() {
    if (handledRef.current) return;
    handledRef.current = true;
    const value = inputRef.current?.value.trim() ?? "";
    if (value) onRenameGroup(groupId, value);
    clearRename();
  }

  function handleCancel() {
    if (handledRef.current) return;
    handledRef.current = true;
    clearRename();
  }

  const header = compact ? (
    <button
      type="button"
      title={isCollapsed ? `Expand ${label}` : `Collapse ${label}`}
      onClick={() => onToggleGroup(groupId)}
      className="mx-1.5 flex w-[calc(100%-12px)] items-center border-0 py-1.5 outline-none"
      {...attributes}
      {...listeners}
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
      onClick={() => onToggleGroup(groupId)}
      className="flex w-full items-center gap-1 px-1.5 pt-2 pb-0.5 text-left transition-colors hover:text-foreground/80"
      {...attributes}
      {...listeners}
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
      <span className="truncate text-[11px] font-medium text-muted-foreground/60">
        {label}
      </span>
      {itemCount > 0 && (
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/40">
          {itemCount}
        </span>
      )}
    </button>
  );

  return (
    <Popover
      open={isRenaming}
      onOpenChange={(open) => {
        if (!open) handleSave();
      }}
    >
      <ContextMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <ContextMenuTrigger asChild>
          <PopoverAnchor asChild>{header}</PopoverAnchor>
        </ContextMenuTrigger>
        <ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
          <ContextMenuItem onSelect={() => startRename(groupId)}>
            <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={2} />
            Rename Group
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
          defaultValue={label}
          className="w-full rounded bg-transparent px-1.5 py-1 text-[12px] outline-none ring-1 ring-border focus:ring-primary"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSave();
            } else if (e.key === "Escape") {
              e.preventDefault();
              handleCancel();
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

// Glide the dropped workspace from where it was released to its final slot,
// instead of snapping. The placeholder keeps the dragging opacity so only the
// overlay is fully visible while it travels.
const dropAnimation: DropAnimation = {
  duration: 200,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.4" } },
  }),
};

// While reordering group headers, only other headers are valid collisions.
// While dragging a workspace, prefer an item under the pointer (reorder
// within a group); fall back to the group drop zone (change group), then to
// closestCenter for edge cases. Group headers themselves are never a valid
// drop target for a workspace (moving onto one would silently clear its group).
const groupAwareCollision: CollisionDetection = (args) => {
  if (args.active.data.current?.type === "group") {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (c) => c.data?.current?.type === "group",
      ),
    });
  }
  const pointer = pointerWithin(args);
  const onItem = pointer.filter(
    (c) =>
      parseGroupDropId(String(c.id)) === null &&
      c.data?.current?.type !== "group",
  );
  if (onItem.length > 0) return onItem;
  if (pointer.length > 0) return pointer;
  return closestCenter(args);
};

// Drop target for a group, highlighted while hovered. Only used for empty
// groups (groups with items are reordered by dropping on their items).
function GroupDropZone({
  groupId,
  children,
}: {
  groupId: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: groupDropId(groupId) });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-full rounded-lg transition-colors",
        isOver && "bg-primary/10 ring-1 ring-inset ring-primary/40",
      )}
    >
      {children}
    </div>
  );
}

// Drop targets for groups with no workspaces, rendered at the end of the list
// only while dragging. Placing them after the groups (the flex-1 spacer absorbs
// the growth) keeps the existing items from shifting, so the drag overlay does
// not jump. The no-group group appears here only when it is empty too.
function EmptyGroupDropTargets({
  workspaces,
  workspaceGroups,
  compact,
}: {
  workspaces: WorkspaceItem[];
  workspaceGroups: WorkspaceGroup[];
  compact: boolean;
}) {
  const empty = groupWorkspacesForDrag(workspaces, workspaceGroups).filter(
    (g) => g.items.length === 0,
  );
  if (empty.length === 0) return null;
  return (
    <div className="mt-1 w-full border-t border-border/40 pt-1">
      {empty.map((group) => {
        const label = group.label ?? "No group";
        return (
          <GroupDropZone key={group.id} groupId={group.id}>
            {compact ? (
              <div title={label} className="mx-1.5 py-2">
                <span className="block h-px w-full rounded-full bg-border/40" />
              </div>
            ) : (
              <div className="px-1.5 py-1.5">
                <span className="truncate text-[11px] font-medium text-muted-foreground/50">
                  {label}
                </span>
              </div>
            )}
          </GroupDropZone>
        );
      })}
    </div>
  );
}

export function WorkspaceBar({
  workspaces,
  activeId,
  workspaceGroups,
  onSelect,
  onNew,
  onReorder,
  onSetGroup,
  onPreviewGroup,
  onCommitGroupMove,
  onCreateGroup,
  onRenameGroup,
  onReorderGroups,
  onClose,
  onRename,
  onHibernate,
  onWake,
  onOpenSettings,
  onSetColor,
  onSetIcon,
  width,
  onWidthChange,
  collapsedGroups,
  onToggleGroup,
  onRestoreFocus,
  onActivateAgentTab,
  onSetDetailExpanded,
}: WorkspaceBarProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [dragKind, setDragKind] = useState<"workspace" | "group" | null>(null);
  // null = "had no group"; undefined = "no drag in progress"
  const [dragStartGroup, setDragStartGroup] = useState<
    string | null | undefined
  >(undefined);
  const compact = width <= 80;

  const detailFilter = useDetailFilter();
  const agentSessions = useAgentStore((s) => s.sessions);
  const agentNotifications = useAgentStore((s) => s.notifications);
  const tabLocations = useAgentStore((s) => s.tabLocations);
  const agentEntriesByWs = useMemo(
    () =>
      entriesByWorkspace(
        buildAgentEntries(agentSessions, agentNotifications, tabLocations),
      ),
    [agentSessions, agentNotifications, tabLocations],
  );
  const lastJump = useRef(new Map<string, string>());
  const jumpAgent = useCallback(
    (workspaceId: string, entries: AgentEntry[]) => {
      const tabId = nextEntryTab(entries, lastJump.current.get(workspaceId));
      if (!tabId) return;
      lastJump.current.set(workspaceId, tabId);
      onActivateAgentTab(workspaceId, tabId);
    },
    [onActivateAgentTab],
  );

  const shortcuts = usePreferencesStore((s) => s.shortcuts);
  const newWorkspaceLabel = getShortcutLabel("workspace.new", shortcuts);
  const newWorkspaceTitle = newWorkspaceLabel
    ? `New workspace (${newWorkspaceLabel})`
    : "New workspace";

  const { draggingItem } = useWorkspaceDnd();
  const nonBarDrag = draggingItem !== null;
  const tabDragging = draggingItem?.kind === "tab";
  const hoverSwitch = useMemo(() => createHoverSwitch(onSelect), [onSelect]);
  useEffect(() => {
    if (!tabDragging) hoverSwitch.cancel();
    return () => hoverSwitch.cancel();
  }, [tabDragging, hoverSwitch]);

  const groups = useMemo(
    () => groupWorkspaces(workspaces, workspaceGroups),
    [workspaces, workspaceGroups],
  );
  const sortableGroupIds = useMemo(
    () => groups.filter((g) => g.label !== null).map((g) => g.id),
    [groups],
  );

  function handleDragStart(event: DragStartEvent) {
    setIsDragging(true);
    const kind =
      event.active.data.current?.type === "group" ? "group" : "workspace";
    setDragKind(kind);
    const id = String(event.active.id);
    setDragActiveId(id);
    if (kind === "workspace") {
      const ws = workspaces.find((w) => w.id === id);
      setDragStartGroup(ws?.groupId ?? null);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    if (dragKind === "group") return;
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    // Empty-group zones assign on drop only: reassigning here would fill the
    // group, making its header vanish from under the pointer mid-drag.
    if (parseGroupDropId(overId) !== null) return;
    const activeId = String(active.id);
    if (overId === activeId) return;
    const activeWs = workspaces.find((w) => w.id === activeId);
    if (!activeWs) return;
    const target = workspaces.find((w) => w.id === overId)?.groupId ?? null;
    if (target !== (activeWs.groupId ?? null)) onPreviewGroup(activeId, target);
  }

  function handleDragCancel() {
    const id = dragActiveId;
    const saved = dragStartGroup;
    const kind = dragKind;
    setIsDragging(false);
    setDragActiveId(null);
    setDragStartGroup(undefined);
    setDragKind(null);
    if (kind === "workspace" && id !== null && saved !== undefined) {
      onPreviewGroup(id, saved);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setIsDragging(false);
    const id = dragActiveId;
    const saved = dragStartGroup;
    const kind = dragKind;
    setDragActiveId(null);
    setDragStartGroup(undefined);
    setDragKind(null);
    const { active, over } = event;

    if (kind === "group") {
      if (over) {
        const activeId = String(active.id);
        const overId = String(over.id);
        if (overId !== activeId) onReorderGroups(activeId, overId);
      }
      return;
    }

    if (!over) {
      // Dropped in empty space: revert any group change made during drag.
      if (id !== null && saved !== undefined) onPreviewGroup(id, saved);
      return;
    }
    const activeId = String(active.id);
    const overId = String(over.id);
    const dropGroupId = parseGroupDropId(overId);
    if (dropGroupId !== null) {
      // Dropped on an empty-group zone: assign that group, nothing to reorder.
      onSetGroup(activeId, groupIdFromGroupId(dropGroupId));
      return;
    }
    if (overId !== activeId) onReorder(activeId, overId);
    if (id !== null && saved !== undefined) onCommitGroupMove();
  }

  const dragActiveWs =
    dragKind === "workspace" && dragActiveId
      ? workspaces.find((w) => w.id === dragActiveId)
      : null;

  const barBinding = useBarDndBinding();
  useEffect(() => {
    barBinding.setHandlers({
      collision: groupAwareCollision,
      onDragStart: handleDragStart,
      onDragOver: handleDragOver,
      onDragEnd: handleDragEnd,
      onDragCancel: handleDragCancel,
    });
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: the overlay only depends on the dragged workspace and the bar width
  useEffect(() => {
    barBinding.setOverlay(
      <>
          {dragActiveWs
            ? (() => {
                const displayColor = resolveWorkspaceColor(
                  dragActiveWs.color,
                  dragActiveWs.id,
                );
                return (
                  <div
                    className={cn(
                      "flex items-center justify-center rounded-lg font-semibold opacity-90",
                      compact ? "h-9 w-9 text-[11px]" : "h-9 px-2 text-[11px]",
                    )}
                    style={
                      displayColor
                        ? {
                            backgroundColor: chipColorOnWhite(displayColor),
                            color: "#ffffff",
                          }
                        : {
                            backgroundColor: "var(--muted)",
                            color: "var(--foreground)",
                          }
                    }
                  >
                    {compact ? (
                      abbrev(dragActiveWs.title, dragActiveWs.kind)
                    ) : (
                      <span className="max-w-full truncate text-center">
                        {dragActiveWs.title || dragActiveWs.kind}
                      </span>
                    )}
                  </div>
                );
              })()
            : null}
        </>,
      dropAnimation,
    );
  }, [barBinding, dragActiveWs, compact]);

  return (
    <nav
      aria-label="Workspaces"
      className={cn(
        "relative flex shrink-0 flex-col items-center gap-1.5 border-r border-border/60 bg-card/60 py-2",
        isDragging && "[&_*]:!cursor-grabbing cursor-grabbing",
      )}
      style={{ width }}
    >
      <>
        <SortableContext
 disabled={nonBarDrag}
          items={sortableGroupIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="thin-scrollbar flex w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto overflow-x-hidden">
            {groups.map((group) => {
              const isCollapsible = group.label !== null;
              const isCollapsed =
                isCollapsible && collapsedGroups.has(group.id);
              return (
                <SortableGroupBlock
                  key={group.id}
                  groupId={group.id}
                  disabled={!isCollapsible}
                >
                  {({ attributes, listeners }) => (
                    <>
                      {isCollapsible && (
                        <SortableGroupHeader
                          groupId={group.id}
                          label={group.label ?? ""}
                          itemCount={group.items.length}
                          compact={compact}
                          isCollapsed={isCollapsed}
                          onToggleGroup={onToggleGroup}
                          onRenameGroup={onRenameGroup}
                          attributes={attributes}
                          listeners={listeners}
                        />
                      )}
                      {(() => {
                        if (isCollapsed) {
                          const activeWs = group.items.find(
                            (ws) => ws.id === activeId,
                          );
                          if (!activeWs) return null;
                          return (
                            <SortableContext
 disabled={nonBarDrag}
                              items={[activeWs.id]}
                              strategy={verticalListSortingStrategy}
                            >
                              <SortableWorkspaceItem
                                ws={activeWs}
                                active={true}
                                agentEntries={agentEntriesByWs[activeWs.id]}
                                onJumpAgent={jumpAgent}
                                detailFilter={detailFilter}
                                onSetDetailExpanded={onSetDetailExpanded}
                                onActivateAgentTab={onActivateAgentTab}
                                barWidth={width}
                                workspaceGroups={workspaceGroups}
                                onSelect={onSelect}
                                onClose={onClose}
                                onRename={onRename}
                                onHibernate={onHibernate}
                                onWake={onWake}
                                onOpenSettings={onOpenSettings}
                                onSetColor={onSetColor}
                                onSetIcon={onSetIcon}
                                onSetGroup={onSetGroup}
                                onCreateGroup={onCreateGroup}
                                onRestoreFocus={onRestoreFocus}
                                hoverSwitch={null}
                              />
                            </SortableContext>
                          );
                        }
                        return (
                          <SortableContext
 disabled={nonBarDrag}
                            items={group.items.map((w) => w.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {group.items.map((ws) => (
                              <SortableWorkspaceItem
                                key={ws.id}
                                ws={ws}
                                active={ws.id === activeId}
                                agentEntries={agentEntriesByWs[ws.id]}
                                onJumpAgent={jumpAgent}
                                detailFilter={detailFilter}
                                onSetDetailExpanded={onSetDetailExpanded}
                                onActivateAgentTab={onActivateAgentTab}
                                barWidth={width}
                                workspaceGroups={workspaceGroups}
                                onSelect={onSelect}
                                onClose={onClose}
                                onRename={onRename}
                                onHibernate={onHibernate}
                                onWake={onWake}
                                onOpenSettings={onOpenSettings}
                                onSetColor={onSetColor}
                                onSetIcon={onSetIcon}
                                onSetGroup={onSetGroup}
                                onCreateGroup={onCreateGroup}
                                onRestoreFocus={onRestoreFocus}
                                hoverSwitch={tabDragging && ws.id !== activeId ? hoverSwitch : null}
                              />
                            ))}
                          </SortableContext>
                        );
                      })()}
                    </>
                  )}
                </SortableGroupBlock>
              );
            })}

            {isDragging && (
              <EmptyGroupDropTargets
                workspaces={workspaces}
                workspaceGroups={workspaceGroups}
                compact={compact}
              />
            )}
          </div>
        </SortableContext>


      </>

      <button
        type="button"
        title={newWorkspaceTitle}
        onClick={onNew}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-border/60 text-lg text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        +
      </button>

      <div
        className="absolute inset-y-0 right-0 flex w-1 cursor-col-resize items-center justify-center outline-none"
        onPointerDown={(e) => {
          const startX = e.clientX;
          const startWidth = width;
          e.currentTarget.setPointerCapture(e.pointerId);
          const onMove = (ev: PointerEvent) => {
            const next = Math.min(
              440,
              Math.max(52, startWidth + (ev.clientX - startX)),
            );
            onWidthChange(next);
          };
          const onUp = () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
          };
          document.addEventListener("pointermove", onMove);
          document.addEventListener("pointerup", onUp);
        }}
      ></div>
    </nav>
  );
}
