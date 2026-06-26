import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { pathDirname } from "@/lib/pathUtils";
import { KEY_SEP } from "@/lib/platform";
import { FlashOverlay } from "@/components/FlashOverlay";
import { cn } from "@/lib/utils";
import { isCopying } from "@/modules/explorer/lib/duplicateStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { GitColorScheme } from "@/modules/settings/store";
import {
  getBindingTokens,
  SHORTCUTS_BY_ID,
  type ShortcutId,
} from "@/modules/shortcuts/shortcuts";
import { useWorkspaceDnd } from "@/modules/workspaces";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  ArrowRight01Icon,
  ClipboardIcon,
  ComputerTerminal01Icon,
  Copy01Icon,
  Copy02Icon,
  CopySlashIcon,
  DashboardSquareAddIcon,
  Delete02Icon,
  File01Icon,
  FileAddIcon,
  FolderAddIcon,
  FolderOpenIcon,
  Link01Icon,
  PencilEdit01Icon,
  PinIcon,
  Refresh01Icon,
  Scissor01Icon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useCallback, useEffect } from "react";
import { InlineInput } from "./InlineInput";
import {
  copyToClipboard,
  relativePath,
  REVEAL_LABEL,
  revealInFinder,
} from "./lib/contextActions";
import { gitignoreEntryFor } from "./lib/gitignore";
import { gitStatusHexColor } from "./lib/gitStatusColor";
import type { GitStatusCode } from "./lib/gitStatusUtils";
import { fileIconUrl, folderIconUrl } from "./lib/iconResolver";
import { COMPACT_CONTENT, COMPACT_ITEM } from "./lib/menuItemClass";

function ShortcutHint({ id }: { id: ShortcutId }) {
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const binding =
    userShortcuts[id]?.[0] ?? SHORTCUTS_BY_ID.get(id)?.defaultBindings[0];
  const tokens = getBindingTokens(binding);
  if (tokens.length === 0) return null;
  return (
    <span className="ml-auto pl-3 text-[11px] tracking-wide text-muted-foreground">
      {tokens.join(KEY_SEP)}
    </span>
  );
}

export type RowActions = {
  toggle: (path: string) => void;
  beginRename: (path: string) => void;
  commitRename: (newName: string) => void | Promise<void>;
  cancelRename: () => void;
  beginCreate: (
    parentPath: string,
    kind: "file" | "dir",
    afterPath?: string,
  ) => void;
  beginDuplicate: (sourcePath: string, kind: "file" | "dir") => void;
  deletePath: (path: string) => Promise<void>;
  requestDelete: (path: string, isDir: boolean) => void;
  copyEntry: (path: string, kind: "file" | "dir") => void;
  cutEntry: (path: string, kind: "file" | "dir") => void;
  pasteEntry: (
    targetPath: string,
    targetIsDir: boolean,
  ) => void | Promise<void>;
};

export type EntryRowProps = {
  path: string;
  name: string;
  isDir: boolean;
  isExpanded: boolean;
  depth: number;
  rootPath: string;
  actions: RowActions;
  renameInProgress: boolean;
  isSelected: boolean;
  flashToken: number;
  isRenaming: boolean;
  isExternalDropTarget?: boolean;
  gitStatusCode?: GitStatusCode | null;
  gitColorScheme?: GitColorScheme;
  gitignored?: boolean;
  onOpenFile: (path: string, pin?: boolean) => void;
  onSelectPath: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onNewWorkspaceFromFolder?: (path: string) => void;
  onSetAsRoot?: (path: string) => void;
  onAddToGitignore?: (path: string, isDir: boolean) => void;
  gitRootPath?: string | null;
  onEnterFolder?: (path: string) => void;
  editorPreviewOnClick: boolean;
  hasClipboard: boolean;
  isCutSource: boolean;
};

function EntryRowImpl(props: EntryRowProps) {
  const {
    path,
    name,
    isDir,
    isExpanded,
    depth,
    rootPath,
    actions,
    renameInProgress,
    isSelected,
    flashToken,
    isRenaming,
    isExternalDropTarget = false,
    gitStatusCode,
    gitColorScheme = "vscode",
    gitignored = false,
    onOpenFile,
    onSelectPath,
    onRevealInTerminal,
    onNewWorkspaceFromFolder,
    onSetAsRoot,
    onAddToGitignore,
    gitRootPath,
    onEnterFolder,
    editorPreviewOnClick,
    hasClipboard,
    isCutSource,
  } = props;

  const { draggingItem } = useWorkspaceDnd();
  const dragSource =
    draggingItem?.kind === "file" && !draggingItem.paneOnly
      ? draggingItem.path
      : null;

  // Files drag as `file:`, folders as `dir:`. Both can be dropped on a pane
  // (file opens an editor, folder opens a terminal) or moved within the tree.
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: isDir ? `dir:${path}` : `file:${path}`,
    data: { path },
  });

  // A folder is a valid move target unless it is the source itself, the
  // source's current parent (no-op), or a descendant of the source.
  const isValidDropTarget =
    isDir &&
    dragSource !== null &&
    dragSource !== path &&
    !path.startsWith(`${dragSource}/`) &&
    pathDirname(dragSource) !== path;

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `explorer-dir:${path}`,
    disabled: !isValidDropTarget,
  });
  const isDropTarget = isValidDropTarget && isOver;

  // A file row acts as a drop target for its parent directory: dropping onto a
  // file is equivalent to dropping onto the folder containing it.
  const fileParentDir = !isDir ? pathDirname(path) : null;
  const isFileDropValid =
    !isDir &&
    dragSource !== null &&
    fileParentDir !== null &&
    dragSource !== fileParentDir &&
    !fileParentDir.startsWith(`${dragSource}/`) &&
    pathDirname(dragSource) !== fileParentDir;

  const { setNodeRef: setFileDropRef, isOver: isFileOver } = useDroppable({
    id: `explorer-file:${path}`,
    disabled: !isFileDropValid,
  });
  const isFileDropTarget = isFileDropValid && isFileOver;

  const setRefs = useCallback(
    (node: HTMLButtonElement | null) => {
      setDragRef(node);
      setDropRef(node);
      setFileDropRef(node);
    },
    [setDragRef, setDropRef, setFileDropRef],
  );

  // Spring open a collapsed folder after hovering over it during a drag.
  useEffect(() => {
    if (!isOver || !isValidDropTarget || isExpanded) return;
    const t = setTimeout(() => actions.toggle(path), 700);
    return () => clearTimeout(t);
  }, [isOver, isValidDropTarget, isExpanded, actions, path]);

  const iconUrl = isDir ? folderIconUrl(name, isExpanded) : fileIconUrl(name);
  const createParent = isDir ? path : pathDirname(path) || rootPath;
  const createAfterPath = isDir ? undefined : path;
  const paddingLeft = 6 + depth * 12;

  const handleClick = () => {
    if (renameInProgress) return;
    onSelectPath(path);
    if (isDir) actions.toggle(path);
    else if (editorPreviewOnClick) onOpenFile(path);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {isRenaming ? (
          <div
            className="flex h-6 w-full min-w-0 items-center gap-2 px-1.5 text-[13px]"
            style={{ paddingLeft }}
          >
            <span className="size-3.5 shrink-0" />
            {iconUrl ? (
              <img src={iconUrl} alt="" className="size-4 shrink-0" />
            ) : (
              <span className="size-4 shrink-0" />
            )}
            <InlineInput
              initial={name}
              onCommit={actions.commitRename}
              onCancel={actions.cancelRename}
            />
          </div>
        ) : (
          <button
            ref={setRefs}
            type="button"
            data-fs-path={path}
            onClick={handleClick}
            onDoubleClick={() => {
              if (isDir) onEnterFolder?.(path);
              else onOpenFile(path, true);
            }}
            className={cn(
              "group relative flex h-6 w-full min-w-0 items-center gap-2 rounded-sm px-1.5 text-left text-[13px] transition-colors hover:bg-accent/70",
              isSelected
                ? "bg-accent text-foreground"
                : gitignored
                  ? "text-muted-foreground/70"
                  : "text-foreground/85",
              isDragging && "opacity-50",
              isCutSource && "opacity-50",
              (isDropTarget || isExternalDropTarget || isFileDropTarget) &&
                "bg-primary/10 ring-1 ring-primary/60",
            )}
            style={{ paddingLeft }}
            {...listeners}
            {...attributes}
          >
            <FlashOverlay token={flashToken} />
            <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
              {isDir ? (
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={12}
                  strokeWidth={2.25}
                  className={cn(
                    "transition-transform",
                    isExpanded && "rotate-90",
                  )}
                />
              ) : null}
            </span>
            {iconUrl ? (
              <img src={iconUrl} alt="" className="size-4 shrink-0" />
            ) : (
              <span className="size-4 shrink-0" />
            )}
            <span
              className="min-w-0 flex-1 truncate"
              style={
                !gitignored && gitStatusCode
                  ? {
                      color:
                        gitStatusHexColor(gitStatusCode, gitColorScheme) ??
                        undefined,
                      textDecoration:
                        gitStatusCode === "D" ? "line-through" : undefined,
                    }
                  : undefined
              }
            >
              {name}
            </span>
          </button>
        )}
      </ContextMenuTrigger>
      <ContextMenuContent
        className={COMPACT_CONTENT}
        onCloseAutoFocus={(e) => {
          if (renameInProgress) e.preventDefault();
        }}
      >
        {isDir && onSetAsRoot && (
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => onSetAsRoot(path)}
          >
            <HugeiconsIcon icon={PinIcon} size={14} strokeWidth={2} />
            Set as Workspace Root
          </ContextMenuItem>
        )}
        {isDir && onNewWorkspaceFromFolder && (
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
        {!isDir && (
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => onOpenFile(path, true)}
          >
            <HugeiconsIcon icon={File01Icon} size={14} strokeWidth={2} />
            Open File
          </ContextMenuItem>
        )}
        {onRevealInTerminal && isDir && (
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
          onSelect={() =>
            actions.beginCreate(createParent, "file", createAfterPath)
          }
        >
          <HugeiconsIcon icon={FileAddIcon} size={14} strokeWidth={2} />
          New File
        </ContextMenuItem>
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() =>
            actions.beginCreate(createParent, "dir", createAfterPath)
          }
        >
          <HugeiconsIcon icon={FolderAddIcon} size={14} strokeWidth={2} />
          New Folder
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => actions.cutEntry(path, isDir ? "dir" : "file")}
        >
          <HugeiconsIcon icon={Scissor01Icon} size={14} strokeWidth={2} />
          Cut
          <ShortcutHint id="file.cut" />
        </ContextMenuItem>
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => actions.copyEntry(path, isDir ? "dir" : "file")}
        >
          <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={2} />
          Copy
          <ShortcutHint id="file.copy" />
        </ContextMenuItem>
        <ContextMenuItem
          className={COMPACT_ITEM}
          disabled={!hasClipboard || isCopying()}
          onSelect={() => void actions.pasteEntry(path, isDir)}
        >
          <HugeiconsIcon icon={ClipboardIcon} size={14} strokeWidth={2} />
          Paste
          <ShortcutHint id="file.paste" />
        </ContextMenuItem>
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => actions.beginRename(path)}
        >
          <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={2} />
          Rename
          <ShortcutHint id="file.rename" />
        </ContextMenuItem>
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => actions.beginDuplicate(path, isDir ? "dir" : "file")}
        >
          <HugeiconsIcon icon={Copy02Icon} size={14} strokeWidth={2} />
          Duplicate
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
        {gitRootPath &&
          onAddToGitignore &&
          gitignoreEntryFor(gitRootPath, path, isDir) && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                className={COMPACT_ITEM}
                onSelect={() => onAddToGitignore(path, isDir)}
              >
                <HugeiconsIcon
                  icon={ViewOffSlashIcon}
                  size={14}
                  strokeWidth={2}
                />
                Add to .gitignore
              </ContextMenuItem>
            </>
          )}
        <ContextMenuSeparator />
        <ContextMenuItem
          className={COMPACT_ITEM}
          variant="destructive"
          onSelect={() => actions.requestDelete(path, isDir)}
        >
          <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
          Delete
          <ShortcutHint id="file.delete" />
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export const EntryRow = memo(EntryRowImpl);

export type PendingRowProps = {
  depth: number;
  kind: "file" | "dir";
  initial?: string;
  onCommit: (name: string) => void | Promise<void>;
  onCancel: () => void;
};

export function PendingRow({
  depth,
  kind,
  initial,
  onCommit,
  onCancel,
}: PendingRowProps) {
  return (
    <div
      className="flex h-6 w-full min-w-0 items-center gap-2 px-1.5 text-[13px]"
      style={{ paddingLeft: 6 + depth * 12 }}
    >
      <span className="size-3.5 shrink-0" />
      <img
        src={
          kind === "dir" ? folderIconUrl("", false) : fileIconUrl("untitled")
        }
        alt=""
        className="size-4 shrink-0 opacity-70"
      />
      <InlineInput
        initial={initial ?? ""}
        placeholder={kind === "dir" ? "New folder" : "New file"}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    </div>
  );
}

// A left-to-right mark anchors the leading "/" so the rtl-based left-truncation
// does not reorder it (otherwise "/Users/foo" renders as "Users/foo/").
const LRM = "\u200e";

export type FsRootRowProps = {
  path: string;
  isWorkspaceRoot: boolean;
  flashToken: number;
  onSetAsRoot?: (path: string) => void;
  onNewWorkspaceFromFolder?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onBeginCreate?: (parentPath: string, kind: "file" | "dir") => void;
  onRefresh?: (path: string) => void;
  onPaste?: (targetPath: string, targetIsDir: boolean) => void | Promise<void>;
  canPaste?: boolean;
};

export function FsRootRow({
  path,
  isWorkspaceRoot,
  flashToken,
  onSetAsRoot,
  onNewWorkspaceFromFolder,
  onRevealInTerminal,
  onBeginCreate,
  onRefresh,
  onPaste,
  canPaste,
}: FsRootRowProps) {
  // Drags only to open a terminal in a pane (`dir-pane:`), never an internal
  // explorer move. The workspace dnd treats it like a folder; the explorer
  // move logic ignores it (paneOnly).
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `dir-pane:${path}`,
    data: { path },
  });
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          className={cn(
            "relative flex h-6 w-full min-w-0 items-center gap-2 px-1.5 text-[13px]",
            isDragging && "opacity-50",
          )}
          style={{ paddingLeft: 6 }}
          title={path}
        >
          <FlashOverlay token={flashToken} />
          <img
            src={folderIconUrl("", true)}
            alt=""
            draggable={false}
            className="size-4 shrink-0"
          />
          <span className="min-w-0 flex-1 truncate text-left font-medium text-foreground/90 [direction:rtl]">
            {LRM + path}
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className={COMPACT_CONTENT}>
        {onSetAsRoot && (
          <ContextMenuItem
            className={COMPACT_ITEM}
            disabled={isWorkspaceRoot}
            onSelect={() => onSetAsRoot(path)}
          >
            <HugeiconsIcon icon={PinIcon} size={14} strokeWidth={2} />
            {isWorkspaceRoot
              ? "This is the Workspace Root"
              : "Set as Workspace Root"}
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
          onSelect={() => onBeginCreate?.(path, "file")}
        >
          <HugeiconsIcon icon={FileAddIcon} size={14} strokeWidth={2} />
          New File
        </ContextMenuItem>
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => onBeginCreate?.(path, "dir")}
        >
          <HugeiconsIcon icon={FolderAddIcon} size={14} strokeWidth={2} />
          New Folder
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className={COMPACT_ITEM}
          disabled={!canPaste || isCopying()}
          onSelect={() => void onPaste?.(path, true)}
        >
          <HugeiconsIcon icon={ClipboardIcon} size={14} strokeWidth={2} />
          Paste
          <ShortcutHint id="file.paste" />
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
          onSelect={() => onRefresh?.(path)}
        >
          <HugeiconsIcon icon={Refresh01Icon} size={14} strokeWidth={2} />
          Refresh
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function FsUpRow({
  path,
  onNavigateUp,
  onRevealInTerminal,
  onRefresh,
}: {
  path: string;
  onNavigateUp?: () => void;
  onRevealInTerminal?: (path: string) => void;
  onRefresh?: () => void;
}) {
  // Same as FsRootRow: drag opens a terminal at the parent dir, no internal move.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `dir-pane:${path}`,
    data: { path },
  });
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          type="button"
          onDoubleClick={() => onNavigateUp?.()}
          title="Double-click to go up one folder"
          className={cn(
            "group flex h-6 w-full min-w-0 items-center gap-2 rounded-sm px-1.5 text-left text-[13px] text-foreground/85 transition-colors hover:bg-accent/70",
            isDragging && "opacity-50",
          )}
          style={{ paddingLeft: 6 }}
        >
          <span className="size-3.5 shrink-0" />
          <img
            src={folderIconUrl("", false)}
            alt=""
            draggable={false}
            className="size-4 shrink-0"
          />
          <span className="min-w-0 flex-1 truncate">..</span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className={COMPACT_CONTENT}>
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
          onSelect={() => void copyToClipboard(path)}
        >
          <HugeiconsIcon icon={CopySlashIcon} size={14} strokeWidth={2} />
          Copy Absolute Path
        </ContextMenuItem>
        {onRefresh && (
          <ContextMenuItem className={COMPACT_ITEM} onSelect={() => onRefresh()}>
            <HugeiconsIcon icon={Refresh01Icon} size={14} strokeWidth={2} />
            Refresh
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function StatusRow({
  depth,
  message,
  tone,
}: {
  depth: number;
  message: string;
  tone: "muted" | "error";
}) {
  return (
    <div
      className={cn(
        "h-6 truncate px-2 text-[11px] leading-6",
        tone === "error" ? "text-destructive" : "text-muted-foreground",
      )}
      style={{ paddingLeft: 6 + depth * 12 + 18 }}
    >
      {message}
    </div>
  );
}
