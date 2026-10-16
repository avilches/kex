// These are curated subsets of the full explorer context menu; TreeRow.tsx (src/modules/explorer/TreeRow.tsx) is the canonical reference for the complete item order.
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  REVEAL_LABEL,
  revealInFinder,
} from "@/modules/explorer/lib/contextActions";
import {
  CopyAbsolutePathItem,
  CopyRelativePathItem,
} from "@/modules/explorer/lib/copyPathItems";
import { gitignoreEntryFor } from "@/modules/explorer/lib/gitignore";
import { COMPACT_ITEM } from "@/modules/explorer/lib/menuItemClass";
import {
  ComputerTerminal01Icon,
  Copy02Icon,
  DashboardSquareAddIcon,
  Delete02Icon,
  FolderOpenIcon,
  PencilEdit01Icon,
  PinIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export type DirSegmentMenuDeps = {
  path: string;
  workspaceRoot: string | null;
  gitRootPath: string | null;
  onSetAsRoot?: (path: string) => void;
  onNewWorkspaceFromFolder?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onAddToGitignore?: (path: string, isDir: boolean) => void;
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
      <ContextMenuSeparator />
      <CopyRelativePathItem path={path} workspaceRoot={workspaceRoot} />
      <CopyAbsolutePathItem path={path} />
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
  onFocusOnExplorer: (
    path: string,
    action?: "rename" | "duplicate" | "delete",
  ) => void;
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
        Rename
      </ContextMenuItem>
      <ContextMenuItem
        className={COMPACT_ITEM}
        onSelect={() => onFocusOnExplorer(path, "duplicate")}
      >
        <HugeiconsIcon icon={Copy02Icon} size={14} strokeWidth={2} />
        Duplicate
      </ContextMenuItem>
      <ContextMenuSeparator />
      <CopyAbsolutePathItem path={path} />
      <CopyRelativePathItem path={path} workspaceRoot={workspaceRoot} />
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
