import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  copyToClipboard,
  relativePath,
  REVEAL_LABEL,
  revealInFinder,
} from "@/modules/explorer/lib/contextActions";
import { gitignoreEntryFor } from "@/modules/explorer/lib/gitignore";
import { COMPACT_ITEM } from "@/modules/explorer/lib/menuItemClass";
import {
  ComputerTerminal01Icon,
  Copy02Icon,
  CopySlashIcon,
  DashboardSquareAddIcon,
  Delete02Icon,
  FolderOpenIcon,
  Link01Icon,
  PencilEdit01Icon,
  PinIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export type DirSegmentMenuDeps = {
  path: string;
  rootPath: string;
  gitRootPath: string | null;
  onSetAsRoot?: (path: string) => void;
  onNewWorkspaceFromFolder?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onAddToGitignore?: (path: string, isDir: boolean) => void;
};

export function dirSegmentMenuItems(deps: DirSegmentMenuDeps): React.ReactNode {
  const {
    path,
    rootPath,
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
      <ContextMenuItem
        className={COMPACT_ITEM}
        onSelect={() => void copyToClipboard(relativePath(rootPath, path))}
      >
        <HugeiconsIcon icon={Link01Icon} size={14} strokeWidth={2} />
        Copy Relative Path
      </ContextMenuItem>
      <ContextMenuItem
        className={COMPACT_ITEM}
        onSelect={() => void copyToClipboard(path)}
      >
        <HugeiconsIcon icon={CopySlashIcon} size={14} strokeWidth={2} />
        Copy Absolute Path
      </ContextMenuItem>
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
  rootPath: string;
  gitRootPath: string | null;
  onFocusOnExplorer: (
    path: string,
    action?: "rename" | "duplicate" | "delete",
  ) => void;
  onAddToGitignore?: (path: string, isDir: boolean) => void;
};

export function fileLeafMenuItems(deps: FileLeafMenuDeps): React.ReactNode {
  const { path, rootPath, gitRootPath, onFocusOnExplorer, onAddToGitignore } =
    deps;

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
        onSelect={() => onFocusOnExplorer(path, "rename")}
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
      <ContextMenuItem
        className={COMPACT_ITEM}
        onSelect={() => void copyToClipboard(path)}
      >
        <HugeiconsIcon icon={CopySlashIcon} size={14} strokeWidth={2} />
        Copy Absolute Path
      </ContextMenuItem>
      <ContextMenuItem
        className={COMPACT_ITEM}
        onSelect={() => void copyToClipboard(relativePath(rootPath, path))}
      >
        <HugeiconsIcon icon={Link01Icon} size={14} strokeWidth={2} />
        Copy Relative Path
      </ContextMenuItem>
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
