// These are curated subsets of the full explorer context menu; TreeRow.tsx (src/modules/explorer/TreeRow.tsx) is the canonical reference for the complete item order.
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  OPEN_EXTERNAL_LABEL,
  REVEAL_LABEL,
  openWithDefaultApp,
  revealInFinder,
} from "@/modules/explorer/lib/contextActions";
import {
  CopyPathMenu,
} from "@/modules/explorer/lib/copyPathItems";
import { gitignoreEntryFor } from "@/modules/explorer/lib/gitignore";
import { COMPACT_ITEM } from "@/modules/explorer/lib/menuItemClass";
import type { RevealAction } from "@/modules/explorer/lib/pendingAction";
import { ShortcutHint } from "@/modules/shortcuts/ShortcutHint";
import {
  ComputerTerminal01Icon,
  Copy02Icon,
  CrosshairIcon,
  DashboardSquareAddIcon,
  Delete02Icon,
  FolderOpenIcon,
  LinkSquare02Icon,
  PencilEdit01Icon,
  PinIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export type { RevealAction };

export type DirSegmentMenuDeps = {
  path: string;
  workspaceRoot: string | null;
  gitRootPath: string | null;
  onSetAsRoot?: (path: string) => void;
  onNewWorkspaceFromFolder?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onAddToGitignore?: (path: string, isDir: boolean) => void;
  onFocusOnExplorer?: (path: string, action?: RevealAction) => void;
};

export function dirSegmentMenuItems(deps: DirSegmentMenuDeps): React.ReactNode {
  const {
    path,
    workspaceRoot,
    gitRootPath,
    onSetAsRoot,
    onNewWorkspaceFromFolder,
    onRevealInTerminal,
    onAddToGitignore,
    onFocusOnExplorer,
  } = deps;

  const gitignoreEntry =
    gitRootPath && onAddToGitignore
      ? gitignoreEntryFor(gitRootPath, path, true)
      : null;

  return (
    <>
      {onSetAsRoot && (
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => onSetAsRoot(path)}
        >
          <HugeiconsIcon icon={PinIcon} size={14} strokeWidth={2} />
          Set as Workspace Root
        </ContextMenuItem>
      )}
      {onNewWorkspaceFromFolder && (
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => onNewWorkspaceFromFolder(path)}
        >
          <HugeiconsIcon
            icon={DashboardSquareAddIcon}
            size={14}
            strokeWidth={2}
          />
          New Workspace from Folder
        </ContextMenuItem>
      )}
      {onRevealInTerminal && (
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => onRevealInTerminal(path)}
        >
          <HugeiconsIcon
            icon={ComputerTerminal01Icon}
            size={14}
            strokeWidth={2}
          />
          Open in Terminal
        </ContextMenuItem>
      )}
      <ContextMenuItem
        className={COMPACT_ITEM}
        onSelect={() => void revealInFinder(path)}
      >
        <HugeiconsIcon icon={FolderOpenIcon} size={14} strokeWidth={2} />
        {REVEAL_LABEL}
      </ContextMenuItem>
      {onFocusOnExplorer && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => onFocusOnExplorer(path)}
          >
            <HugeiconsIcon icon={CrosshairIcon} size={14} strokeWidth={2} />
            Focus on Sidebar
          </ContextMenuItem>
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => onFocusOnExplorer(path, "rename")}
          >
            <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={2} />
            Rename Folder
            <ShortcutHint id="file.rename" />
          </ContextMenuItem>
        </>
      )}
      <ContextMenuSeparator />
      <CopyPathMenu path={path} isDir workspaceRoot={workspaceRoot} repoRoot={gitRootPath} />
      {gitignoreEntry && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => onAddToGitignore!(path, true)}
          >
            <HugeiconsIcon icon={ViewOffSlashIcon} size={14} strokeWidth={2} />
            Add to .gitignore
          </ContextMenuItem>
        </>
      )}
    </>
  );
}

export type FileLeafMenuDeps = {
  path: string;
  workspaceRoot: string | null;
  gitRootPath: string | null;
  onFocusOnExplorer: (path: string, action?: RevealAction) => void;
  // When set, Rename edits the name inline here instead of focusing the explorer.
  onRename?: () => void;
  onAddToGitignore?: (path: string, isDir: boolean) => void;
};

export function fileLeafMenuItems(deps: FileLeafMenuDeps): React.ReactNode {
  const {
    path,
    workspaceRoot,
    gitRootPath,
    onFocusOnExplorer,
    onRename,
    onAddToGitignore,
  } = deps;

  const gitignoreEntry =
    gitRootPath && onAddToGitignore
      ? gitignoreEntryFor(gitRootPath, path, false)
      : null;

  return (
    <>
      <ContextMenuItem
        className={COMPACT_ITEM}
        onSelect={() => void openWithDefaultApp(path)}
      >
        <HugeiconsIcon icon={LinkSquare02Icon} size={14} strokeWidth={2} />
        {OPEN_EXTERNAL_LABEL}
      </ContextMenuItem>
      <ContextMenuItem
        className={COMPACT_ITEM}
        onSelect={() => void revealInFinder(path)}
      >
        <HugeiconsIcon icon={FolderOpenIcon} size={14} strokeWidth={2} />
        {REVEAL_LABEL}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        className={COMPACT_ITEM}
        onSelect={() =>
          onRename ? onRename() : onFocusOnExplorer(path, "rename")
        }
      >
        <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={2} />
        Rename File
        <ShortcutHint id="file.rename" />
      </ContextMenuItem>
      <ContextMenuItem
        className={COMPACT_ITEM}
        onSelect={() => onFocusOnExplorer(path, "duplicate")}
      >
        <HugeiconsIcon icon={Copy02Icon} size={14} strokeWidth={2} />
        Duplicate
      </ContextMenuItem>
      <ContextMenuSeparator />
      <CopyPathMenu path={path} isDir={false} workspaceRoot={workspaceRoot} repoRoot={gitRootPath} />
      {gitignoreEntry && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => onAddToGitignore!(path, false)}
          >
            <HugeiconsIcon icon={ViewOffSlashIcon} size={14} strokeWidth={2} />
            Add to .gitignore
          </ContextMenuItem>
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem
        className={COMPACT_ITEM}
        variant="destructive"
        onSelect={() => onFocusOnExplorer(path, "delete")}
      >
        <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
        Delete
      </ContextMenuItem>
    </>
  );
}
