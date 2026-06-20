import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { pathDirname } from "@/lib/pathUtils";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  ArrowRight01Icon,
  ComputerTerminal01Icon,
  Copy01Icon,
  Delete02Icon,
  File01Icon,
  FileAddIcon,
  FolderAddIcon,
  FolderOpenIcon,
  Link01Icon,
  PinIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useCallback, useEffect, useState } from "react";
import { useWorkspaceDnd } from "@/modules/workspaces";
import { InlineInput } from "./InlineInput";
import {
  copyToClipboard,
  relativePath,
  revealInFinder,
} from "./lib/contextActions";
import { fileIconUrl, folderIconUrl } from "./lib/iconResolver";
import { gitStatusHexColor } from "./lib/gitStatusColor";
import type { GitStatusCode } from "./lib/gitStatusUtils";
import type { GitColorScheme } from "@/modules/settings/store";
import { COMPACT_CONTENT, COMPACT_ITEM } from "./lib/menuItemClass";

export type RowActions = {
  toggle: (path: string) => void;
  beginRename: (path: string) => void;
  commitRename: (newName: string) => void | Promise<void>;
  cancelRename: () => void;
  beginCreate: (parentPath: string, kind: "file" | "dir") => void;
  deletePath: (path: string) => Promise<void>;
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
  isRenaming: boolean;
  isExternalDropTarget?: boolean;
  gitStatusCode?: GitStatusCode | null;
  gitColorScheme?: GitColorScheme;
  gitignored?: boolean;
  onOpenFile: (path: string, pin?: boolean) => void;
  onSelectPath: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onAttachToAgent?: (path: string) => void;
  onSetAsRoot?: (path: string) => void;
  editorPreviewOnClick: boolean;
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
    isRenaming,
    isExternalDropTarget = false,
    gitStatusCode,
    gitColorScheme = "vscode",
    gitignored = false,
    onOpenFile,
    onSelectPath,
    onRevealInTerminal,
    onAttachToAgent,
    onSetAsRoot,
    editorPreviewOnClick,
  } = props;

  const [isConfirming, setIsConfirming] = useState(false);
  const { draggingItem } = useWorkspaceDnd();
  const dragSource = draggingItem?.kind === "file" ? draggingItem.path : null;

  // Files drag as `file:` (also openable in a pane); folders as `dir:` (move
  // only, the workspace dnd ignores them for pane opening).
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
  const createTarget = isDir ? path : pathDirname(path) || rootPath;
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
            onDoubleClick={() => !isDir && onOpenFile(path, true)}
            className={cn(
              "group flex h-6 w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm px-1.5 text-left text-[13px] transition-colors hover:bg-accent/70",
              isSelected
                ? "bg-accent text-foreground"
                : gitignored
                  ? "text-muted-foreground/70"
                  : "text-foreground/85",
              isDragging && "opacity-50",
              (isDropTarget || isExternalDropTarget || isFileDropTarget) &&
                "bg-primary/10 ring-1 ring-primary/60",
            )}
            style={{ paddingLeft }}
            {...listeners}
            {...attributes}
          >
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
        {!isDir && (
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => onOpenFile(path, true)}
          >
            <HugeiconsIcon icon={File01Icon} size={14} strokeWidth={2} />
            Open
          </ContextMenuItem>
        )}
        {isDir && onRevealInTerminal && (
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
          Reveal in Finder
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => actions.beginCreate(createTarget, "file")}
        >
          <HugeiconsIcon icon={FileAddIcon} size={14} strokeWidth={2} />
          New File
        </ContextMenuItem>
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => actions.beginCreate(createTarget, "dir")}
        >
          <HugeiconsIcon icon={FolderAddIcon} size={14} strokeWidth={2} />
          New Folder
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => void copyToClipboard(path)}
        >
          <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={2} />
          Copy Path
        </ContextMenuItem>
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => void copyToClipboard(relativePath(rootPath, path))}
        >
          <HugeiconsIcon icon={Link01Icon} size={14} strokeWidth={2} />
          Copy Relative Path
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => onAttachToAgent?.(path)}
        >
          <HugeiconsIcon icon={SparklesIcon} size={14} strokeWidth={2} />
          Attach to Agent
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className={COMPACT_ITEM}
          variant="destructive"
          onSelect={(e) => {
            e.preventDefault();
            if (isConfirming) {
              void actions.deletePath(path);
            } else {
              setIsConfirming(true);
            }
          }}
          onMouseLeave={() => setTimeout(() => setIsConfirming(false), 1500)}
        >
          <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
          {isConfirming ? "Click again to confirm" : "Delete"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export const EntryRow = memo(EntryRowImpl);

export type PendingRowProps = {
  depth: number;
  kind: "file" | "dir";
  onCommit: (name: string) => void | Promise<void>;
  onCancel: () => void;
};

export function PendingRow({
  depth,
  kind,
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
        initial=""
        placeholder={kind === "dir" ? "New folder" : "New file"}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    </div>
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
