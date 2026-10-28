import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  ArrowReloadHorizontalIcon,
  ArrowRight01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  Image01Icon,
  PaintBoardIcon,
  LockKeyIcon,
  FloppyDiskIcon,
  PencilEdit01Icon,
  SleepingIcon,
  SquareUnlock02Icon,
  StickyNote03Icon,
  UploadCircle01Icon,
} from "@hugeicons/core-free-icons";
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import type { ShortcutId } from "@/modules/shortcuts/shortcuts";
import { useShortcutLabel } from "@/modules/shortcuts/useShortcutLabel";
import { toggleTabLock } from "./lib/tabLock";
import { isTabNoteOpen, removeTabNote, toggleTabNote } from "./lib/tabNote";
import { type RenameOrigin, useTabRenameStore } from "./lib/tabRenameStore";
import type { Tab } from "./lib/types";
import { RestoreCommandMenu } from "@/modules/terminal/RestoreCommandMenu";
import { IconPaletteGrid } from "./IconPaletteGrid";
import { ColorPaletteGrid } from "./ColorPaletteGrid";
import { CopyTabIdItem, TabAgentMenuItems } from "./TabAgentMenuItems";
import { TabProcessMenuItems } from "./TabProcessMenuItems";
import { TabCopyPathItems } from "./TabCopyPathItems";
import { WorkspaceMark } from "./WorkspaceMark";
import { useSidebarTabMenu } from "./SidebarTabMenuContext";
import { RowActionsMenu } from "@/modules/actions/RowActionsMenu";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { useWorkspaceMove } from "./WorkspaceMoveContext";
import { tabFilePath } from "./lib/tabPath";

type Props = {
  tab: Tab;
  workspaceId: string;
  paneTabCount: number;
  renameOrigin: RenameOrigin;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
  onRenameTab?: (tabId: string, title: string | undefined) => void;
  onUpdateTab?: (tabId: string, updater: (p: Tab) => Tab) => void;
};

function Shortcut({ id }: { id: ShortcutId }) {
  const label = useShortcutLabel(id);
  return label ? <ContextMenuShortcut>{label}</ContextMenuShortcut> : null;
}

// Body of the tab context menu shared by the pane tab strip and the sidebar
// rows. The close actions act on the pane that holds the tab; callers resolve
// that pane, so this component only needs how many tabs it has.
export function TabContextMenuItems({
  tab,
  workspaceId,
  paneTabCount,
  renameOrigin,
  onActivate,
  onClose,
  onCloseOtherTabs,
  onRenameTab,
  onUpdateTab,
}: Props) {
  const { targets, moveTab } = useWorkspaceMove();
  const startRename = useTabRenameStore((s) => s.startRename);
  const otherTargets = targets.filter((t) => t.id !== workspaceId);
  const { onSaveTab, onToggleHibernate } = useSidebarTabMenu();
  const isLocked = tab.locked ?? false;
  const canSave = (tab.kind === "editor" || tab.kind === "markdown") && tab.dirty;
  const focusFilePath = tabFilePath(tab);
  const worktree = useAgentStore((s) => s.sessions[tab.id]?.meta?.worktreeCwd ?? null);
  const restoreCommand =
    tab.kind === "terminal" && onUpdateTab ? (
      <RestoreCommandMenu tab={tab} onUpdateTab={onUpdateTab} />
    ) : null;
  const rowActions =
    tab.kind === "terminal" ? (
      <RowActionsMenu kind="folder" path={worktree ?? tab.cwd ?? ""} />
    ) : focusFilePath ? (
      <RowActionsMenu kind="file" path={focusFilePath} />
    ) : null;

  return (
    <>
      {rowActions}
      {canSave && (
        <>
          <ContextMenuItem onSelect={() => onSaveTab(tab.id)}>
            <HugeiconsIcon icon={FloppyDiskIcon} size={14} strokeWidth={2} />
            Save
            <Shortcut id="editor.save" />
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      {onRenameTab && (
        <>
          <ContextMenuItem onSelect={() => startRename(tab.id, renameOrigin)}>
            <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={2} />
            Rename Tab
            <Shortcut id="tab.rename" />
          </ContextMenuItem>
          {tab.title && (
            <ContextMenuItem onSelect={() => onRenameTab(tab.id, undefined)}>
              <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={14} strokeWidth={2} />
              Reset Tab Name
            </ContextMenuItem>
          )}
          {onUpdateTab && (
            <ContextMenuItem
              onSelect={() => {
                if (!isTabNoteOpen(tab)) onActivate(tab.id);
                onUpdateTab(tab.id, toggleTabNote);
              }}
            >
              <HugeiconsIcon icon={StickyNote03Icon} size={14} strokeWidth={2} />
              {isTabNoteOpen(tab) ? "Hide Note" : tab.note !== undefined ? "Show Note" : "Add Note"}
              <Shortcut id="tab.note" />
            </ContextMenuItem>
          )}
          {onUpdateTab && tab.note !== undefined && (
            <ContextMenuItem onSelect={() => onUpdateTab(tab.id, removeTabNote)}>
              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
              Remove Note
            </ContextMenuItem>
          )}
          {onUpdateTab && (
            <ContextMenuSub>
              <ContextMenuSubTrigger className="gap-2">
                <HugeiconsIcon icon={PaintBoardIcon} size={14} strokeWidth={2} />
                Color
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-[232px] p-2">
                <ColorPaletteGrid
                  value={tab.color}
                  displayColor={tab.color ?? null}
                  noneSelected={tab.color === undefined}
                  onSelect={(color) =>
                    onUpdateTab(tab.id, (p) => {
                      const { color: _drop, ...rest } = p;
                      return (color ? { ...rest, color } : rest) as Tab;
                    })
                  }
                />
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          {onUpdateTab && (
            <ContextMenuSub>
              <ContextMenuSubTrigger className="gap-2">
                <HugeiconsIcon icon={Image01Icon} size={14} strokeWidth={2} />
                Icon
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="max-h-[320px] w-[288px] overflow-y-auto p-2">
                <IconPaletteGrid
                  value={tab.icon}
                  onSelect={(icon) =>
                    onUpdateTab(tab.id, (p) => {
                      const { icon: _drop, ...rest } = p;
                      return (icon ? { ...rest, icon } : rest) as Tab;
                    })
                  }
                />
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          <TabCopyPathItems tab={tab} workspaceId={workspaceId} />
          <ContextMenuSub>
            <ContextMenuSubTrigger className="gap-2">
              <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
              Move to Workspace
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="max-h-[420px] overflow-y-auto">
              <ContextMenuItem onSelect={() => moveTab(workspaceId, tab.id, { kind: "new" })}>
                <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
                New
              </ContextMenuItem>
              {otherTargets.length > 0 && <ContextMenuSeparator />}
              {otherTargets.map((t) => (
                <ContextMenuItem
                  key={t.id}
                  onSelect={() => moveTab(workspaceId, tab.id, { kind: "auto", workspaceId: t.id })}
                >
                  <WorkspaceMark id={t.id} color={t.color} icon={t.icon} />
                  <span className="truncate">{t.title}</span>
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
        </>
      )}
      <TabAgentMenuItems
        tabId={tab.id}
        process={<TabProcessMenuItems tab={tab} />}
      >
        {restoreCommand}
      </TabAgentMenuItems>
      <CopyTabIdItem tabId={tab.id} />
      {tab.kind === "terminal" && (
        <ContextMenuItem onSelect={() => onToggleHibernate(tab.id)}>
          <HugeiconsIcon icon={tab.hibernation ? UploadCircle01Icon : SleepingIcon} size={14} strokeWidth={2} />
          {tab.hibernation ? "Restore" : "Hibernate"}
          <Shortcut id="tab.hibernate" />
        </ContextMenuItem>
      )}
      <ContextMenuItem
        // preventDefault keeps the menu open: the point of Lock/Unlock from the
        // menu is toggling in place, so the item flips to Unlock Tab and stays.
        onSelect={(e) => {
          e.preventDefault();
          onUpdateTab?.(tab.id, toggleTabLock);
        }}
      >
        <HugeiconsIcon icon={isLocked ? SquareUnlock02Icon : LockKeyIcon} size={14} strokeWidth={2} />
        {isLocked ? "Unlock Tab" : "Lock Tab"}
        <Shortcut id="tab.lock" />
      </ContextMenuItem>
      <ContextMenuItem disabled={isLocked} onSelect={() => onClose(tab.id)}>
        <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
        Close Tab
        {!isLocked && <Shortcut id="tab.close" />}
      </ContextMenuItem>
      <ContextMenuItem disabled={paneTabCount <= 1} onSelect={() => onCloseOtherTabs(tab.id)}>
        <HugeiconsIcon icon={CancelCircleIcon} size={14} strokeWidth={2} />
        Close Other Tabs
      </ContextMenuItem>
    </>
  );
}
