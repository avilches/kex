import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  ArrowReloadHorizontalIcon,
  ArrowRight01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  CancelSquareIcon,
  CrosshairIcon,
  Image01Icon,
  PaintBoardIcon,
  LockKeyIcon,
  FloppyDiskIcon,
  PencilEdit01Icon,
  SleepingIcon,
  SquareUnlock02Icon,
  StickyNote03Icon,
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
import { isTabNoteOpen, removeTabNote, toggleTabNote } from "./lib/tabNote";
import { type RenameOrigin, useTabRenameStore } from "./lib/tabRenameStore";
import { type Tab, isAutofocusTab } from "./lib/types";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { RunOnStartMenu } from "@/modules/terminal/RunOnStartMenu";
import { IconPaletteGrid } from "./IconPaletteGrid";
import { ColorPaletteGrid } from "./ColorPaletteGrid";
import { WorkspaceMark } from "./WorkspaceMark";
import { useSidebarTabMenu } from "./SidebarTabMenuContext";
import { useWorkspaceMove } from "./WorkspaceMoveContext";

type Props = {
  tab: Tab;
  workspaceId: string;
  paneTabCount: number;
  renameOrigin: RenameOrigin;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
  onCloseAllTabs: (tabId: string) => void;
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
  onCloseAllTabs,
  onRenameTab,
  onUpdateTab,
}: Props) {
  const autofocusMode = usePreferencesStore((s) => s.autofocusMode);
  const { targets, moveTab } = useWorkspaceMove();
  const startRename = useTabRenameStore((s) => s.startRename);
  const otherTargets = targets.filter((t) => t.id !== workspaceId);
  const { onSaveTab } = useSidebarTabMenu();
  const isLocked = tab.locked ?? false;
  const canSave = (tab.kind === "editor" || tab.kind === "markdown") && tab.dirty;

  return (
    <>
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
              <ContextMenuSubContent className="w-[288px] p-2">
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
          {isAutofocusTab(tab) && autofocusMode !== "always" && (
            <ContextMenuItem
              onSelect={() =>
                onUpdateTab?.(tab.id, (p) =>
                  isAutofocusTab(p) ? { ...p, autofocus: !p.autofocus } : p,
                )
              }
            >
              <HugeiconsIcon
                icon={CrosshairIcon}
                size={14}
                strokeWidth={2}
                className={tab.autofocus ? "text-primary" : undefined}
              />
              Autofocus Sidebar
              <Shortcut id="tab.toggleAutofocus" />
            </ContextMenuItem>
          )}
          {tab.kind === "terminal" && onUpdateTab && (
            <RunOnStartMenu tab={tab} onUpdateTab={onUpdateTab} />
          )}
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
                  {t.hibernated && (
                    <HugeiconsIcon
                      icon={SleepingIcon}
                      size={13}
                      strokeWidth={1.75}
                      className="ml-auto shrink-0 text-muted-foreground opacity-60"
                    />
                  )}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
        </>
      )}
      <ContextMenuItem
        onSelect={() =>
          onUpdateTab?.(tab.id, (p) => {
            const newLocked = !isLocked;
            return {
              ...p,
              locked: newLocked,
              ...(newLocked && (p.kind === "editor" || p.kind === "git-diff" || p.kind === "git-commit-file")
                ? { preview: false }
                : {}),
            };
          })
        }
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
      <ContextMenuItem disabled={isLocked} onSelect={() => onCloseAllTabs(tab.id)}>
        <HugeiconsIcon icon={CancelSquareIcon} size={14} strokeWidth={2} />
        Close All Tabs
      </ContextMenuItem>
    </>
  );
}
