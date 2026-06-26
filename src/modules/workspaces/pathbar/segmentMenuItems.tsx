// These are curated subsets of the full explorer context menu; TreeRow.tsx (src/modules/explorer/TreeRow.tsx) is the canonical reference for the complete item order.
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

function isInsideRoot(path: string, workspaceRoot: string | null): boolean {
  return (
    workspaceRoot != null &&
    (path === workspaceRoot || path.startsWith(`${workspaceRoot}/`))
  );
}

const SUBPATH_CLASS = "max-w-[240px] truncate text-[10px] text-muted-foreground";

// Copy Relative Path: disabled (greyed) when the path is above the workspace
// root or there is no root, since a relative path is meaningless there.
function copyRelativeItem(path: string, workspaceRoot: string | null) {
  const inRoot = isInsideRoot(path, workspaceRoot);
  const relText = inRoot ? relativePath(workspaceRoot as string, path) : null;
  return (
    <ContextMenuItem
      className={COMPACT_ITEM}
      disabled={!inRoot}
      onSelect={() => {
        if (relText != null) void copyToClipboard(relText);
      }}
    >
      <HugeiconsIcon icon={Link01Icon} size={14} strokeWidth={2} />
      <span className="flex min-w-0 flex-col">
        <span>Copy Relative Path</span>
        {relText != null && (
          <span className={SUBPATH_CLASS} title={relText}>
            {relText}
          </span>
        )}
      </span>
    </ContextMenuItem>
  );
}

function copyAbsoluteItem(path: string) {
  return (
    <ContextMenuItem
      className={COMPACT_ITEM}
      onSelect={() => void copyToClipboard(path)}
    >
      <HugeiconsIcon icon={CopySlashIcon} size={14} strokeWidth={2} />
      <span className="flex min-w-0 flex-col">
        <span>Copy Absolute Path</span>
        <span className={SUBPATH_CLASS} title={path}>
          {path}
        </span>
      </span>
    </ContextMenuItem>
  );
}

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
      {copyRelativeItem(path, workspaceRoot)}
      {copyAbsoluteItem(path)}
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
  onAddToGitignore?: (path: string, isDir: boolean) => void;
};

export function fileLeafMenuItems(deps: FileLeafMenuDeps): React.ReactNode {
  const {
    path,
    workspaceRoot,
    gitRootPath,
    onFocusOnExplorer,
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
      {copyAbsoluteItem(path)}
      {copyRelativeItem(path, workspaceRoot)}
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
