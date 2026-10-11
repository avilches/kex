import { type DragMoveEvent, useDndMonitor, useDraggable, useDroppable } from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { PopoverAnchor } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import type { AgentEntry } from "@/modules/agents/lib/notificationList";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { tabIcon } from "@/modules/workspaces/lib/tabTitle";
import { useAgentTabTitle } from "@/modules/workspaces/lib/useAgentTabTitle";
import { useContextMenuCloseStore } from "@/modules/workspaces/lib/contextMenuCloseStore";
import type { Tab } from "@/modules/workspaces/lib/types";
import { useSidebarTabMenu } from "@/modules/workspaces/SidebarTabMenuContext";
import { TabContextMenuItems } from "@/modules/workspaces/TabContextMenuItems";
import { sidebarTabDragId, useWorkspaceDnd } from "@/modules/workspaces/WorkspaceDndProvider";
import { SIDE_ROW_DROP_PREFIX, type SideRowDropData, sideRowSide } from "@/modules/workspaces/lib/tabDrop";
import { TabRenamePopover } from "@/modules/workspaces/TabRenamePopover";
import {
  type DetailFilter,
  type DetailRow,
  workspaceDetailRows,
} from "@/modules/workspaces/lib/workspaceDetail";

function StatusMark({ visual }: { visual: DetailRow["visual"] }) {
  if (visual === "working") {
    return (
      <span className="size-[8px] shrink-0 animate-spin rounded-full border border-transparent border-t-current opacity-70" />
    );
  }
  if (visual === null) return null;
  return (
    <span
      className={cn(
        "size-[6px] shrink-0 rounded-full",
        visual === "error" ? "bg-destructive" : "bg-amber-400",
      )}
    />
  );
}

function DetailTabMenu({
  tab,
  workspaceId,
  onActivate,
}: {
  tab: Tab;
  workspaceId: string;
  onActivate: (tabId: string) => void;
}) {
  const actions = useSidebarTabMenu();
  return (
    <TabContextMenuItems
      tab={tab}
      workspaceId={workspaceId}
      paneTabCount={actions.paneTabCount(tab.id)}
      renameOrigin="sidebar"
      onActivate={onActivate}
      onClose={actions.onClose}
      onCloseOtherTabs={actions.onCloseOtherTabs}
      onCloseAllTabs={actions.onCloseAllTabs}
      onRenameTab={actions.onRenameTab}
      onUpdateTab={actions.onUpdateTab}
    />
  );
}

function DetailTabRow({
  tab,
  workspaceId,
  visual,
  focused,
  prevTabId,
  insertSide,
  onActivate,
}: {
  tab: Tab;
  workspaceId: string;
  visual: DetailRow["visual"];
  focused: boolean;
  prevTabId: string | null;
  insertSide: "before" | "after" | null;
  onActivate: (tabId: string) => void;
}) {
  const info = useAgentTabTitle(tab);
  const title = info?.displayTitle ?? tab.id;
  const agent = info?.hasAgent ? info.agentSession?.agent : undefined;
  const { onRenameTab } = useSidebarTabMenu();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: sidebarTabDragId(tab.id),
    data: { type: "tab" },
  });

  const tabDragActive = useWorkspaceDnd().draggingItem?.kind === "tab";
  const dropData = useMemo<SideRowDropData>(
    () => ({ sideRow: true, workspaceId, tabId: tab.id, prevTabId }),
    [workspaceId, tab.id, prevTabId],
  );
  const { setNodeRef: setDropRef } = useDroppable({
    id: `${SIDE_ROW_DROP_PREFIX}${tab.id}`,
    data: dropData,
    disabled: !tabDragActive,
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const closeSignal = useContextMenuCloseStore((s) => s.signal);
  // biome-ignore lint/correctness/useExhaustiveDependencies: closeSignal is a bump counter, only its change matters
  useEffect(() => {
    setMenuOpen(false);
  }, [closeSignal]);

  return (
    <div ref={setDropRef} className="relative">
      {insertSide && (
        <span
          className={cn(
            "pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-primary",
            insertSide === "before" ? "-top-px" : "-bottom-px",
          )}
        />
      )}
    <TabRenamePopover
      tabId={tab.id}
      origin="sidebar"
      title={tab.title}
      placeholder={title}
      onRenameTab={onRenameTab}
    >
      <ContextMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <ContextMenuTrigger asChild>
          <PopoverAnchor asChild>
            <button
              ref={setNodeRef}
              {...attributes}
              {...listeners}
              type="button"
              title={title}
              aria-current={focused || undefined}
              onClick={() => onActivate(tab.id)}
              className={cn(
                "flex h-6 w-full items-center gap-1.5 rounded-md pl-2 pr-1.5 text-left text-[11.5px] transition-colors select-none",
                isDragging && "opacity-40",
                focused
                  ? "bg-foreground/[0.16] font-medium text-foreground"
                  : "text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground",
              )}
            >
              <span className="flex size-3.5 shrink-0 items-center justify-center">
                {agent ? <AgentIcon agent={agent} size={12} /> : tabIcon(tab)}
              </span>
              <span className="min-w-0 flex-1 truncate">{title}</span>
              <StatusMark visual={visual} />
            </button>
          </PopoverAnchor>
        </ContextMenuTrigger>
        <ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
          <DetailTabMenu tab={tab} workspaceId={workspaceId} onActivate={onActivate} />
        </ContextMenuContent>
      </ContextMenu>
    </TabRenamePopover>
    </div>
  );
}

export const WorkspaceDetailList = memo(function WorkspaceDetailList({
  workspaceId,
  tabs,
  entries,
  filter,
  focusedTabId,
  onActivate,
}: {
  workspaceId: string;
  tabs: Tab[];
  entries: AgentEntry[] | undefined;
  filter: DetailFilter;
  focusedTabId: string | null;
  onActivate: (tabId: string) => void;
}) {
  const sessions = useAgentStore((s) => s.sessions);
  const rows = useMemo(() => {
    const agentTabIds = new Set(
      tabs.filter((t) => t.kind === "terminal" && sessions[t.id]).map((t) => t.id),
    );
    return workspaceDetailRows(tabs, agentTabIds, entries ?? [], filter);
  }, [tabs, sessions, entries, filter]);
  const [insert, setInsert] = useState<{ tabId: string; side: "before" | "after" } | null>(null);
  const trackInsert = useCallback(
    (e: DragMoveEvent) => {
      const data = e.over?.data.current;
      if (!e.over || data?.sideRow !== true || data.workspaceId !== workspaceId) {
        setInsert((cur) => (cur === null ? cur : null));
        return;
      }
      const pointer = getEventCoordinates(e.activatorEvent);
      const side = sideRowSide(e.over.rect, (pointer?.y ?? 0) + e.delta.y);
      const tabId = String(data.tabId);
      setInsert((cur) => (cur?.tabId === tabId && cur.side === side ? cur : { tabId, side }));
    },
    [workspaceId],
  );
  const clearInsert = useCallback(() => setInsert(null), []);
  useDndMonitor({ onDragMove: trackInsert, onDragEnd: clearInsert, onDragCancel: clearInsert });
  const tabsById = useMemo(() => new Map(tabs.map((t) => [t.id, t])), [tabs]);

  if (rows.length === 0) return null;

  return (
    <div className="ml-3 mt-0.5 flex flex-col gap-px border-l border-border/60 pl-0.5">
      {rows.map((row, i) => {
        const tab = tabsById.get(row.tabId);
        return tab ? (
          <DetailTabRow
            key={row.tabId}
            tab={tab}
            workspaceId={workspaceId}
            visual={row.visual}
            focused={row.tabId === focusedTabId}
            prevTabId={rows[i - 1]?.tabId ?? null}
            insertSide={insert?.tabId === row.tabId ? insert.side : null}
            onActivate={onActivate}
          />
        ) : null;
      })}
    </div>
  );
});
