import { Spinner } from "@/components/ui/spinner";
import { chipColorOnWhite } from "@/modules/workspaces/lib/workspaceColor";
import { sidebarChipColor } from "@/modules/workspaces/lib/tabColor";
import { type DragMoveEvent, useDndMonitor, useDraggable, useDroppable } from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { HugeiconsIcon } from "@hugeicons/react";
import { CrosshairIcon, LinkSquare02Icon, LockKeyIcon, StickyNote03Icon, UploadCircle01Icon } from "@hugeicons/core-free-icons";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuShortcut, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useShortcutLabel } from "@/modules/shortcuts/useShortcutLabel";
import { PopoverAnchor } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import type { AgentEntry } from "@/modules/agents/lib/notificationList";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { FloatingTabNote } from "@/modules/workspaces/FloatingTabNote";
import { hideTabNote, toggleTabNote } from "@/modules/workspaces/lib/tabNote";
import { useTabNoteStore } from "@/modules/workspaces/lib/tabNoteStore";
import { useNotePreview } from "@/modules/workspaces/lib/useNotePreview";
import { tabIcon } from "@/modules/workspaces/lib/tabTitle";
import { useAgentTabTitle } from "@/modules/workspaces/lib/useAgentTabTitle";
import { useTabRenameStore } from "@/modules/workspaces/lib/tabRenameStore";
import { useContextMenuCloseStore } from "@/modules/workspaces/lib/contextMenuCloseStore";
import { type Tab, isAutofocusTab } from "@/modules/workspaces/lib/types";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useTheme } from "@/modules/theme/ThemeProvider";
import { noteSurfaceKind } from "@/modules/theme/noteSurface";
import { tabGitColor } from "@/modules/workspaces/lib/tabGitColor";
import { useTabTooltip } from "@/modules/workspaces/lib/useTabTooltip";
import { useSidebarGit } from "@/modules/workspaces/SidebarGitContext";
import { useSidebarTabMenu } from "@/modules/workspaces/SidebarTabMenuContext";
import { TabContextMenuItems } from "@/modules/workspaces/TabContextMenuItems";
import { sidebarTabDragId, useWorkspaceDnd } from "@/modules/workspaces/WorkspaceDndProvider";
import { SIDE_ROW_DROP_PREFIX, type SideRowDropData, sideRowSide } from "@/modules/workspaces/lib/tabDrop";
import { TabRenamePopover } from "@/modules/workspaces/TabRenamePopover";
import {
  type DetailFilter,
  type DetailRow,
  type SubagentRow as SubagentRowData,
  subagentRows,
  workspaceDetailRows,
} from "@/modules/workspaces/lib/workspaceDetail";

type SubagentTone = "plain" | "chip" | "chip-color";

const SUBAGENT_TONE: Record<SubagentTone, string> = {
  plain: "text-muted-foreground group-hover/block:text-foreground",
  chip: "text-foreground/70",
  "chip-color": "text-white/80",
};

function SubagentRow({
  agent,
  row,
  tone,
}: {
  agent: string | undefined;
  row: SubagentRowData;
  tone: SubagentTone;
}) {
  return (
    <div
      data-subagent-row=""
      title={row.label}
      className={cn(
        "flex h-6 w-full cursor-default items-center gap-1.5 pl-2 pr-1.5 text-[11.5px] select-none",
        SUBAGENT_TONE[tone],
      )}
    >
      {agent && (
        <span className="flex size-3.5 shrink-0 items-center justify-center">
          <AgentIcon agent={agent} size={12} />
        </span>
      )}
      <span className="min-w-0 truncate">{row.label}</span>
      <span aria-hidden className="flex-1" />
      <Spinner size={11} />
    </div>
  );
}

function focusChipStyle(color: string | null): React.CSSProperties {
  return color !== null
    ? {
        backgroundColor: chipColorOnWhite(color),
        color: "#ffffff",
        boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--foreground) 40%, transparent)",
      }
    : {
        backgroundColor: "var(--muted)",
        boxShadow: "inset 0 0 0 1px var(--ring)",
      };
}

function SubagentGroup({
  agent,
  rows,
  tone,
}: {
  agent: string | undefined;
  rows: SubagentRowData[];
  tone: SubagentTone;
}) {
  return (
    <div className="ml-[15px] flex flex-col gap-px border-l border-border/60 pl-0.5">
      {rows.map((sub) => (
        <SubagentRow key={sub.id} agent={agent} row={sub} tone={tone} />
      ))}
    </div>
  );
}

function StatusMark({ visual }: { visual: DetailRow["visual"] }) {
  if (visual === "working") {
    return (
      <Spinner size={11} />
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

function RestoreWorkspaceItem({ onWake }: { onWake: () => void }) {
  const label = useShortcutLabel("workspace.hibernate");
  return (
    <ContextMenuItem onSelect={onWake}>
      <HugeiconsIcon icon={UploadCircle01Icon} size={14} strokeWidth={2} />
      Restore Workspace
      {label && <ContextMenuShortcut>{label}</ContextMenuShortcut>}
    </ContextMenuItem>
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
  grouped,
  hasSubagents,
  color,
  prevTabId,
  insertSide,
  hibernated,
  onActivate,
  onWake,
  onNoteHover,
  onNoteToggle,
}: {
  tab: Tab;
  workspaceId: string;
  visual: DetailRow["visual"];
  focused: boolean;
  grouped: boolean;
  hasSubagents: boolean;
  color: string | null;
  prevTabId: string | null;
  insertSide: "before" | "after" | null;
  hibernated: boolean;
  onActivate: (tabId: string) => void;
  onWake?: () => void;
  onNoteHover: (tabId: string, hovering: boolean) => void;
  onNoteToggle: (tabId: string) => void;
}) {
  const info = useAgentTabTitle(tab);
  const title = info?.displayTitle ?? tab.id;
  const agent = info?.hasAgent ? info.agentSession?.agent : undefined;
  const { onRenameTab, onClose, onUpdateTab } = useSidebarTabMenu();
  // A sleeping tab can only be looked at: the workspace has to be restored before anything else.
  const isLocked = !hibernated && (tab.locked ?? false);
  const hoverBg = focused && color !== null ? "hover:bg-white/25" : "hover:bg-muted";
  const hasNote = !hibernated && tab.note !== undefined;
  const tooltip = useTabTooltip(tab, info?.agentSession);
  const autofocusMode = usePreferencesStore((s) => s.autofocusMode);
  const sidebarGit = useSidebarGit();
  const { resolvedMode } = useTheme();
  const gitColor = useMemo(
    () =>
      sidebarGit?.workspaceId === workspaceId
        ? tabGitColor(tab, sidebarGit.statusMap, sidebarGit.status, sidebarGit.scheme, resolvedMode)
        : null,
    [sidebarGit, workspaceId, tab, resolvedMode],
  );
  const solidChip = focused && color !== null;
  const showAutofocus = !hibernated && isAutofocusTab(tab) && tab.autofocus === true && autofocusMode !== "always";

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: sidebarTabDragId(tab.id),
    data: { type: "tab" },
    disabled: hibernated,
  });

  const tabDragActive = useWorkspaceDnd().draggingItem?.kind === "tab";
  const dropData = useMemo<SideRowDropData>(
    () => ({ sideRow: true, workspaceId, tabId: tab.id, prevTabId }),
    [workspaceId, tab.id, prevTabId],
  );
  const { setNodeRef: setDropRef } = useDroppable({
    id: `${SIDE_ROW_DROP_PREFIX}${tab.id}`,
    data: dropData,
    disabled: !tabDragActive || hibernated,
  });

  const rowRef = useRef<HTMLButtonElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeSignal = useContextMenuCloseStore((s) => s.signal);
  // biome-ignore lint/correctness/useExhaustiveDependencies: closeSignal is a bump counter, only its change matters
  useEffect(() => {
    setMenuOpen(false);
  }, [closeSignal]);

  return (
    <div ref={setDropRef} className="group/tab relative">
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
      kind={tab.kind}
      origin="sidebar"
      title={tab.title}
      placeholder={title}
      onRenameTab={onRenameTab}
    >
      <ContextMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <ContextMenuTrigger asChild>
          <PopoverAnchor asChild>
            <button
              ref={(node) => {
                rowRef.current = node;
                setNodeRef(node);
              }}
              {...attributes}
              {...listeners}
              type="button"
              data-detail-row=""
              data-detail-row-id={tab.id}
              title={tooltip.title ?? title}
              onPointerEnter={tooltip.onPointerEnter}
              aria-current={focused || undefined}
              onClick={() => onActivate(tab.id)}
              onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault();
              }}
              onAuxClick={(e) => {
                if (e.button === 1 && !hibernated) {
                  e.stopPropagation();
                  onClose(tab.id);
                }
              }}
              className={cn(
                "relative flex h-6 w-full items-center gap-1.5 rounded-md pl-2 pr-1.5 text-left text-[11.5px] transition-colors select-none",
                isDragging && "opacity-40",
                focused
                  ? "font-medium text-foreground"
                  : hasSubagents
                    ? "text-muted-foreground group-hover/block:text-foreground"
                    : "text-muted-foreground group-hover/tab:bg-foreground/[0.08] group-hover/tab:text-foreground",
              )}
              style={
                focused
                  ? grouped
                    ? color !== null
                      ? { color: "#ffffff" }
                      : undefined
                    : focusChipStyle(color)
                  : undefined
              }
            >
              {!focused && tab.color && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-1 left-0 w-0.5 rounded-full"
                  style={{ backgroundColor: tab.color }}
                />
              )}
              <span className="flex size-3.5 shrink-0 items-center justify-center">
                {agent && !tab.icon ? (
                  <AgentIcon agent={agent} size={12} />
                ) : tab.kind === "browser" && tab.floating ? (
                  <HugeiconsIcon icon={LinkSquare02Icon} size={12} strokeWidth={1.75} className="opacity-60" />
                ) : (
                  tabIcon(tab, info?.isRunning, !focused)
                )}
              </span>
              <span
                className={cn(
                  "min-w-0 truncate",
                  (tab.kind === "editor" || tab.kind === "git-diff" || tab.kind === "git-commit-file") &&
                    tab.preview &&
                    "italic",
                )}
                style={gitColor && !solidChip ? { color: gitColor } : undefined}
              >
                {title}
              </span>
              {(tab.kind === "editor" || tab.kind === "markdown") && tab.dirty && (
                <span className="shrink-0 text-[8px] text-primary">●</span>
              )}
              <span aria-hidden className="flex-1" />
              <span aria-hidden className="size-[16px] shrink-0" />
              {hasNote && <span aria-hidden className="size-[16px] shrink-0" />}
              {showAutofocus && <span aria-hidden className="size-[16px] shrink-0" />}
            </button>
          </PopoverAnchor>
        </ContextMenuTrigger>
        <ContextMenuContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            // Opening the rename popover steals focus on purpose; any other
            // close hands focus back to the row it was opened from.
            if (useTabRenameStore.getState().renamingTabId !== tab.id) rowRef.current?.focus();
          }}
        >
          {hibernated ? (
            onWake && <RestoreWorkspaceItem onWake={onWake} />
          ) : (
            <DetailTabMenu tab={tab} workspaceId={workspaceId} onActivate={onActivate} />
          )}
        </ContextMenuContent>
      </ContextMenu>
    </TabRenamePopover>
      {hasNote && (
        <button
          type="button"
          title={tab.noteOpen ? "Hide note" : "Show note"}
          aria-label="Tab note"
          aria-pressed={!!tab.noteOpen}
          className={cn(
            "absolute right-[26px] top-1/2 z-10 flex size-[16px] -translate-y-1/2 items-center justify-center rounded outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring",
            tab.noteOpen ? "text-foreground" : "text-muted-foreground",
          )}
          onPointerEnter={() => onNoteHover(tab.id, true)}
          onPointerLeave={() => onNoteHover(tab.id, false)}
          onClick={() => onNoteToggle(tab.id)}
        >
          <HugeiconsIcon icon={StickyNote03Icon} size={12} strokeWidth={2} />
        </button>
      )}
      {showAutofocus && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 z-10 flex size-[16px] -translate-y-1/2 items-center justify-center",
            hasNote ? "right-[46px]" : "right-[26px]",
          )}
        >
          <HugeiconsIcon icon={CrosshairIcon} size={12} strokeWidth={2} />
        </span>
      )}
      {isLocked ? (
        <button
          type="button"
          title="Unlock tab"
          aria-label="Unlock tab"
          className={cn("absolute right-1.5 top-1/2 z-10 flex size-[16px] -translate-y-1/2 items-center justify-center rounded text-foreground outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring", hoverBg)}
          onClick={() => onUpdateTab(tab.id, (p) => ({ ...p, locked: false }))}
        >
          <HugeiconsIcon icon={LockKeyIcon} size={13} strokeWidth={2} />
        </button>
      ) : hibernated ? null : (
        <>
          {visual !== null && (
            <span className="pointer-events-none absolute right-1.5 top-1/2 flex size-[16px] -translate-y-1/2 items-center justify-center transition-opacity group-focus-within/tab:opacity-0 group-hover/tab:opacity-0">
              <StatusMark visual={visual} />
            </span>
          )}
          <button
            type="button"
            title="Close tab"
            aria-label="Close tab"
            className={cn("absolute right-1.5 top-1/2 z-10 flex size-[16px] -translate-y-1/2 items-center justify-center rounded opacity-0 outline-none transition-opacity group-focus-within/tab:opacity-60 group-hover/tab:opacity-60 hover:!opacity-100 focus-visible:!opacity-100 focus-visible:ring-1 focus-visible:ring-ring", hoverBg)}
            onClick={() => onClose(tab.id)}
          >
            <span className="text-[13px] leading-none">×</span>
          </button>
        </>
      )}
    </div>
  );
}

export const WorkspaceDetailList = memo(function WorkspaceDetailList({
  workspaceId,
  tabs,
  entries,
  filter,
  focusedTabId,
  color = null,
  visibleTabIds = "",
  hibernated = false,
  onActivate,
  onWake,
}: {
  workspaceId: string;
  tabs: Tab[];
  entries: AgentEntry[] | undefined;
  filter: DetailFilter;
  focusedTabId: string | null;
  color?: string | null;
  visibleTabIds?: string;
  hibernated?: boolean;
  onActivate: (tabId: string) => void;
  onWake?: () => void;
}) {
  const sessions = useAgentStore((s) => s.sessions);
  const rows = useMemo(() => {
    const agentTabIds = new Set(
      tabs.filter((t) => t.kind === "terminal" && sessions[t.id]).map((t) => t.id),
    );
    return workspaceDetailRows(tabs, agentTabIds, entries ?? [], filter);
  }, [tabs, sessions, entries, filter]);
  const viewportRef = useRef<HTMLElement | null>(document.documentElement);
  const noBarRef = useRef<HTMLElement | null>(null);
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

  const { onUpdateTab } = useSidebarTabMenu();
  const setSidebarHover = useTabNoteStore((s) => s.setSidebarHover);
  const notePreview = useNotePreview(
    useCallback(
      (id: string) =>
        !!document
          .querySelector(`[data-tab-note-id="${CSS.escape(id)}"]`)
          ?.contains(document.activeElement),
      [],
    ),
    focusedTabId ?? "",
  );
  // A tab that is the active one of a pane has its note drawn by that pane, at its own position
  // and sticky once opened. Any other tab's note is docked next to its row.
  const visibleSet = useMemo(() => new Set(visibleTabIds.split(",")), [visibleTabIds]);
  const handleNoteHover = useCallback(
    (tabId: string, hovering: boolean) => {
      if (visibleSet.has(tabId)) {
        setSidebarHover(hovering ? tabId : null);
      } else if (hovering) {
        notePreview.show(tabId);
      } else {
        notePreview.leave(tabId);
      }
    },
    [visibleSet, setSidebarHover, notePreview.show, notePreview.leave],
  );
  // A visible tab's pane resets its own preview when the note opens or closes. A docked preview
  // stays under the pointer when the note is turned on (now with its close button) and goes away
  // when it is turned off.
  const handleNoteToggle = useCallback(
    (tabId: string) => {
      // The pointer is still on the icon, so no new enter event will reopen the preview.
      if (tabsById.get(tabId)?.noteOpen) notePreview.close();
      else if (!visibleSet.has(tabId)) notePreview.show(tabId);
      onUpdateTab(tabId, toggleTabNote);
    },
    [tabsById, visibleSet, notePreview.close, notePreview.show, onUpdateTab],
  );
  useEffect(() => () => setSidebarHover(null), [setSidebarHover]);
  const previewTab = notePreview.tabId ? tabsById.get(notePreview.tabId) : undefined;

  if (rows.length === 0) return null;

  return (
    <div className="ml-3 mt-0.5 flex flex-col gap-px border-l border-border/60 pl-0.5">
      {rows.map((row, i) => {
        const tab = tabsById.get(row.tabId);
        if (!tab) return null;
        const subs = subagentRows(sessions[row.tabId]?.subagents);
        const focused = row.tabId === focusedTabId;
        const grouped = focused && subs.length > 0;
        // A workspace color wins over the tab color while the row has focus.
        const chipColor = sidebarChipColor(color, tab.color);
        return (
          <div
            key={row.tabId}
            className={cn(
              "group/block",
              subs.length > 0 && "rounded-md",
              subs.length > 0 && !focused && "hover:bg-foreground/[0.08]",
              hibernated && "opacity-40",
            )}
            style={grouped ? focusChipStyle(chipColor) : undefined}
          >
            <DetailTabRow
              tab={tab}
              workspaceId={workspaceId}
              visual={row.visual}
              focused={focused}
              grouped={grouped}
              hasSubagents={subs.length > 0}
              color={chipColor}
              prevTabId={rows[i - 1]?.tabId ?? null}
              insertSide={insert?.tabId === row.tabId ? insert.side : null}
              hibernated={hibernated}
              onActivate={onActivate}
              onWake={onWake}
              onNoteHover={handleNoteHover}
              onNoteToggle={handleNoteToggle}
            />
            {subs.length > 0 && (
              <SubagentGroup
                agent={sessions[row.tabId]?.agent}
                rows={subs}
                tone={!grouped ? "plain" : chipColor !== null ? "chip-color" : "chip"}
              />
            )}
          </div>
        );
      })}
      {previewTab && previewTab.note !== undefined && !visibleSet.has(previewTab.id) &&
        createPortal(
          <div className="pointer-events-none fixed inset-0 z-50">
            <FloatingTabNote
              key={`side-preview-${previewTab.id}`}
              tab={previewTab}
              active={false}
              preview
              dockTo="side-row"
              paneRef={viewportRef}
              tabBarRef={noBarRef}
              layoutKey=""
              onUpdateTab={onUpdateTab}
              onClose={() => {
                notePreview.close();
                onUpdateTab(previewTab.id, hideTabNote);
              }}
              onDismiss={notePreview.close}
              onPointerEnter={() => notePreview.show(previewTab.id)}
              onPointerLeave={() => notePreview.leave(previewTab.id)}
              surface={noteSurfaceKind(focusedTabId ? tabsById.get(focusedTabId) : undefined)}
            />
          </div>,
          document.body,
        )}
    </div>
  );
});
