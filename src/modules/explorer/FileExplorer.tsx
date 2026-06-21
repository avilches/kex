import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  ArrowDown01Icon,
  ComputerTerminal01Icon,
  Folder01Icon,
  GitBranchIcon,
  HierarchyFilesIcon,
  Home01Icon,
  PinIcon,
  PinOffIcon,
  Refresh01Icon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useDndMonitor, useDroppable } from "@dnd-kit/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { ExplorerSearch, type ExplorerSearchHandle } from "./ExplorerSearch";
import {
  EntryRow,
  FsRootRow,
  FsUpRow,
  PendingRow,
  StatusRow,
  type RowActions,
} from "./TreeRow";
import { copyToClipboard, revealInFinder } from "./lib/contextActions";
import { COMPACT_CONTENT, COMPACT_ITEM } from "./lib/menuItemClass";
import { useExplorerFileDrop } from "./lib/useExplorerFileDrop";
import { useFileTree } from "./lib/useFileTree";
import { useGitStatus } from "./lib/useGitStatus";
import type { GitStatusCode } from "./lib/gitStatusUtils";
import { cn } from "@/lib/utils";
import { pathDirname } from "@/lib/pathUtils";
import { useWorkspaceDnd } from "@/modules/workspaces";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  getBindingTokens,
  matchesShortcut,
  SHORTCUTS_BY_ID,
  type ShortcutId,
} from "@/modules/shortcuts/shortcuts";
import type { GitStatusSnapshot } from "@/lib/native";
import type { ExplorerRootMode } from "@/modules/workspaces/lib/explorerRoot";

export type FileExplorerHandle = {
  focus: () => void;
  isFocused: () => boolean;
  focusSearch: () => void;
  toggleSearch: () => void;
  refresh: (path: string) => void;
};

type Props = {
  rootPath: string | null;
  rootMode: ExplorerRootMode;
  onChangeRootMode: (mode: ExplorerRootMode) => void;
  onSetAsRoot: (path: string) => void;
  onEnterFolder?: (path: string) => void;
  onNavigateUp?: () => void;
  onFsRootMissing?: (path: string) => void;
  canNavigateUp: boolean;
  homePath: string | null;
  fsRootPath: string | null;
  terminalCwdPath: string | null;
  gitRootPath: string | null;
  workspaceRootPath: string | null;
  workspaceRootExists: boolean;
  activeFilePath?: string | null;
  onOpenFile: (path: string, pin?: boolean) => void;
  onPathRenamed?: (from: string, to: string) => void;
  onPathDeleted?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onNewWorkspaceFromFolder?: (path: string) => void;
  gitStatus?: GitStatusSnapshot | null;
  onSearchClose?: () => void;
};

const ROOT_MODES: {
  id: ExplorerRootMode;
  label: string;
  icon: typeof Search01Icon;
}[] = [
  { id: "filesystem", label: "File System", icon: HierarchyFilesIcon },
  { id: "pinned", label: "Workspace Root", icon: PinIcon },
  { id: "terminal", label: "Follow Terminal", icon: ComputerTerminal01Icon },
  { id: "git", label: "Follow Git Root", icon: GitBranchIcon },
];

const MODE_SHORTCUT: Record<string, ShortcutId> = {
  filesystem: "explorer.viewFilesystem",
  pinned: "explorer.viewPinned",
  terminal: "explorer.viewTerminal",
  git: "explorer.viewGit",
};

type RootModeContext = {
  fsRootPath: string | null;
  workspaceRootPath: string | null;
  workspaceRootExists: boolean;
  terminalCwdPath: string | null;
  gitRootPath: string | null;
};

function rootModeInfo(
  id: ExplorerRootMode,
  ctx: RootModeContext,
): { subtitle: string | null; disabled: boolean } {
  switch (id) {
    case "filesystem":
      return { subtitle: ctx.fsRootPath, disabled: false };
    case "pinned":
      if (!ctx.workspaceRootPath)
        return {
          subtitle: "Set a new workspace root in the explorer",
          disabled: true,
        };
      if (!ctx.workspaceRootExists)
        return { subtitle: "Folder not found", disabled: true };
      return { subtitle: ctx.workspaceRootPath, disabled: false };
    case "terminal":
      return { subtitle: ctx.terminalCwdPath, disabled: false };
    case "git":
      return {
        subtitle: ctx.gitRootPath ?? "No git repository in the current path",
        disabled: false,
      };
  }
}

type Row =
  | {
      kind: "entry";
      key: string;
      path: string;
      name: string;
      isDir: boolean;
      isExpanded: boolean;
      depth: number;
      gitignored: boolean;
      gitStatusCode: GitStatusCode | null;
    }
  | {
      kind: "rename";
      key: string;
      path: string;
      name: string;
      isDir: boolean;
      depth: number;
      gitignored: boolean;
      gitStatusCode: GitStatusCode | null;
    }
  | { kind: "fs-root"; key: string; path: string }
  | { kind: "fs-up"; key: string; path: string }
  | { kind: "pending"; key: string; depth: number; pendingKind: "file" | "dir" }
  | {
      kind: "status";
      key: string;
      depth: number;
      tone: "muted" | "error";
      message: string;
    };

const ROW_HEIGHT = 24;
const OVERSCAN = 8;


function buildRows(
  rootPath: string,
  tree: ReturnType<typeof useFileTree>,
  lookup: (path: string) => GitStatusCode | null,
  fsNav: { filesystem: boolean; canNavigateUp: boolean },
): { rows: Row[]; entryIndexByPath: Map<string, number> } {
  const rows: Row[] = [];
  const entryIndexByPath = new Map<string, number>();

  rows.push({ kind: "fs-root", key: `fs-root:${rootPath}`, path: rootPath });
  if (fsNav.filesystem && fsNav.canNavigateUp) {
    rows.push({ kind: "fs-up", key: "fs-up", path: pathDirname(rootPath) });
  }
  // A create-at-root pending sits below the synthetic header/".." rows, before
  // the real entries — only when there is no afterPath (afterPath means the
  // pending is inserted inline during walk(), right after the target sibling).
  if (
    tree.pendingCreate?.parentPath === rootPath &&
    !tree.pendingCreate.afterPath
  ) {
    rows.push({
      kind: "pending",
      key: `pending:${rootPath}`,
      depth: 0,
      pendingKind: tree.pendingCreate.kind,
    });
  }

  const walk = (parent: string, depth: number, parentIgnored: boolean) => {
    const node = tree.nodes[parent];
    if (!node || node.status !== "loaded") return;
    for (const entry of node.entries) {
      const path = tree.joinPath(parent, entry.name);
      const isDir = entry.kind === "dir";
      const expanded = isDir && tree.expanded.has(path);
      const isRenaming = tree.renaming === path;
      const gitignored = parentIgnored || entry.gitignored;
      const gitStatusCode = gitignored ? null : lookup(path);
      if (isRenaming) {
        rows.push({
          kind: "rename",
          key: `rename:${path}`,
          path,
          name: entry.name,
          isDir,
          depth,
          gitignored,
          gitStatusCode,
        });
      } else {
        entryIndexByPath.set(path, rows.length);
        rows.push({
          kind: "entry",
          key: path,
          path,
          name: entry.name,
          isDir,
          isExpanded: expanded,
          depth,
          gitignored,
          gitStatusCode,
        });
        // When creating a sibling after a specific file, insert the pending
        // row right here rather than at the top of the parent directory.
        if (
          tree.pendingCreate?.afterPath === path &&
          tree.pendingCreate.parentPath === parent
        ) {
          rows.push({
            kind: "pending",
            key: `pending:${parent}`,
            depth,
            pendingKind: tree.pendingCreate.kind,
          });
        }
      }
      if (isDir && expanded) {
        const child = tree.nodes[path];
        // Only insert pending as first child when there is no afterPath;
        // with afterPath the pending is placed after the sibling file above.
        if (
          tree.pendingCreate?.parentPath === path &&
          !tree.pendingCreate.afterPath
        ) {
          rows.push({
            kind: "pending",
            key: `pending:${path}`,
            depth: depth + 1,
            pendingKind: tree.pendingCreate.kind,
          });
        }
        if (child?.status === "loading") {
          rows.push({
            kind: "status",
            key: `loading:${path}`,
            depth: depth + 1,
            tone: "muted",
            message: "Loading…",
          });
        } else if (child?.status === "error") {
          rows.push({
            kind: "status",
            key: `error:${path}`,
            depth: depth + 1,
            tone: "error",
            message: child.message,
          });
        } else if (child?.status === "loaded") {
          walk(path, depth + 1, gitignored);
        }
      }
    }
  };

  walk(rootPath, 0, false);
  return { rows, entryIndexByPath };
}

export const FileExplorer = memo(
  forwardRef<FileExplorerHandle, Props>(function FileExplorer(
    {
      rootPath,
      rootMode,
      onChangeRootMode,
      onSetAsRoot,
      onEnterFolder,
      onNavigateUp,
      onFsRootMissing,
      canNavigateUp,
      homePath,
      fsRootPath,
      terminalCwdPath,
      gitRootPath,
      workspaceRootPath,
      workspaceRootExists,
      activeFilePath,
      onOpenFile,
      onPathRenamed,
      onPathDeleted,
      onRevealInTerminal,
      onNewWorkspaceFromFolder,
      gitStatus,
      onSearchClose,
    },
    ref,
  ) {
    const tree = useFileTree(rootPath, { onPathRenamed, onPathDeleted });

    // Move a dragged file/folder when dropped on a folder row. The drop target
    // is only registered for valid destinations (see TreeRow), so over here is
    // always a legal move; movePath additionally guards against name clashes.
    useDndMonitor({
      onDragEnd({ active, over }) {
        if (!over) return;
        const overId = String(over.id);
        const activeId = String(active.id);
        const from = activeId.startsWith("file:")
          ? activeId.slice(5)
          : activeId.startsWith("dir:")
            ? activeId.slice(4)
            : null;
        if (from === null) return;
        if (overId.startsWith("explorer-dir:")) {
          void tree.movePath(from, overId.slice("explorer-dir:".length));
        } else if (overId.startsWith("explorer-file:")) {
          const filePath = overId.slice("explorer-file:".length);
          void tree.movePath(from, pathDirname(filePath));
        }
      },
    });

    const gitColorScheme = usePreferencesStore((s) => s.explorerGitColorScheme);
    const userShortcuts = usePreferencesStore((s) => s.shortcuts);
    const editorPreviewOnClick = usePreferencesStore(
      (s) => s.editorPreviewOnClick,
    );
    const { lookup: lookupGitStatus } = useGitStatus(rootPath, gitStatus, true);
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isSearchActive, setIsSearchActive] = useState(false);
    const searchRef = useRef<ExplorerSearchHandle>(null);
    const closeSearch = useCallback(() => {
      setIsSearchOpen(false);
      onSearchClose?.();
    }, [onSearchClose]);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const { rows, entryIndexByPath } = useMemo(() => {
      if (!rootPath)
        return {
          rows: [] as Row[],
          entryIndexByPath: new Map<string, number>(),
        };
      return buildRows(rootPath, tree, lookupGitStatus, {
        filesystem: rootMode === "filesystem",
        canNavigateUp,
      });
      // `tree` is intentionally omitted: its identity changes every render, but
      // the listed fields are the only inputs buildRows actually reads.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      rootPath,
      rootMode,
      canNavigateUp,
      tree.nodes,
      tree.expanded,
      tree.renaming,
      tree.pendingCreate,
      lookupGitStatus,
    ]);

    const isDirAt = useCallback(
      (path: string): boolean | undefined => {
        const idx = entryIndexByPath.get(path);
        const row = idx !== undefined ? rows[idx] : undefined;
        return row?.kind === "entry" ? row.isDir : undefined;
      },
      [entryIndexByPath, rows],
    );

    // OS file drops (copy from Finder/Explorer). Coexists with the terminal's
    // own drop listener: each acts only on its own DOM region by hit-testing.
    const { externalTargetDir } = useExplorerFileDrop({
      rootPath,
      isDir: isDirAt,
      onCopied: tree.refresh,
    });

    // Internal dnd-kit drop target for the root directory (empty space below rows).
    // The id uses the same "explorer-dir:" prefix so onDragEnd handles it automatically.
    const { draggingItem } = useWorkspaceDnd();
    const internalDragSource =
      draggingItem?.kind === "file" && !draggingItem.paneOnly
        ? draggingItem.path
        : null;
    const isRootInternalDropValid =
      rootPath !== null &&
      internalDragSource !== null &&
      pathDirname(internalDragSource) !== rootPath;
    const { setNodeRef: setRootDropRef, isOver: isRootInternalOver } =
      useDroppable({
        id: rootPath ? `explorer-dir:${rootPath}` : "explorer-dir:__none__",
        disabled: !isRootInternalDropValid,
      });

    const rootIsDropTarget =
      (externalTargetDir != null && externalTargetDir === rootPath) ||
      (isRootInternalDropValid && isRootInternalOver);

    // OS drops bypass @dnd-kit, so the per-row spring-open in TreeRow never
    // fires for them; expand the hovered folder here instead.
    useEffect(() => {
      if (!externalTargetDir || externalTargetDir === rootPath) return;
      if (tree.expanded.has(externalTargetDir)) return;
      const id = window.setTimeout(() => tree.expand(externalTargetDir), 700);
      return () => window.clearTimeout(id);
    }, [externalTargetDir, rootPath, tree.expanded, tree.expand]);

    const rowActions = useMemo<RowActions>(
      () => ({
        toggle: tree.toggle,
        beginRename: tree.beginRename,
        commitRename: tree.commitRename,
        cancelRename: tree.cancelRename,
        beginCreate: tree.beginCreate,
        deletePath: tree.deletePath,
      }),
      [
        tree.toggle,
        tree.beginRename,
        tree.commitRename,
        tree.cancelRename,
        tree.beginCreate,
        tree.deletePath,
      ],
    );
    const renameInProgress =
      tree.renaming !== null || tree.pendingCreate !== null;

    const entryPaths = useMemo<string[]>(() => {
      const out: string[] = [];
      for (const row of rows) if (row.kind === "entry") out.push(row.path);
      return out;
    }, [rows]);

    useEffect(() => {
      if (selectedPath && !entryIndexByPath.has(selectedPath)) {
        setSelectedPath(null);
      }
    }, [entryIndexByPath, selectedPath]);

    const virtualizer = useVirtualizer({
      count: rows.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => ROW_HEIGHT,
      overscan: OVERSCAN,
      getItemKey: (index) => rows[index]?.key ?? index,
    });

    const scrollEntryIntoView = useCallback(
      (path: string) => {
        const index = entryIndexByPath.get(path);
        if (index === undefined) return;
        virtualizer.scrollToIndex(index, { align: "auto" });
      },
      [entryIndexByPath, virtualizer],
    );

    const lastSyncedActivePathRef = useRef<string | null>(null);
    useEffect(() => {
      if (
        !activeFilePath ||
        activeFilePath === lastSyncedActivePathRef.current
      ) {
        return;
      }
      if (!entryIndexByPath.has(activeFilePath)) return;
      lastSyncedActivePathRef.current = activeFilePath;
      setSelectedPath(activeFilePath);
      requestAnimationFrame(() => scrollEntryIntoView(activeFilePath));
    }, [activeFilePath, entryIndexByPath, scrollEntryIntoView]);

    // A create-at-root pending is a virtualized row near the top; if the list is
    // scrolled away its InlineInput never mounts (and never autofocuses). Bring
    // it into view once when it appears. `align: "auto"` is a no-op if visible.
    const pendingParent = tree.pendingCreate?.parentPath ?? null;
    const lastPendingScrollRef = useRef<string | null>(null);
    useEffect(() => {
      if (!pendingParent) {
        lastPendingScrollRef.current = null;
        return;
      }
      if (lastPendingScrollRef.current === pendingParent) return;
      const idx = rows.findIndex((r) => r.kind === "pending");
      if (idx >= 0) {
        lastPendingScrollRef.current = pendingParent;
        virtualizer.scrollToIndex(idx, { align: "auto", behavior: "smooth" });
      }
    }, [pendingParent, rows, virtualizer]);

    // When the File System root no longer exists on disk (e.g. it was deleted
    // from under us), climb to the nearest existing ancestor instead of showing
    // a dead-end. The actual resolution lives in App (it needs fs access).
    const rootStatus = rootPath ? tree.nodes[rootPath]?.status : undefined;
    useEffect(() => {
      if (rootMode === "filesystem" && rootStatus === "error" && rootPath) {
        onFsRootMissing?.(rootPath);
      }
    }, [rootMode, rootStatus, rootPath, onFsRootMissing]);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          containerRef.current?.focus();
          if (!selectedPath && entryPaths.length > 0) {
            const first = entryPaths[0];
            setSelectedPath(first);
            requestAnimationFrame(() => scrollEntryIntoView(first));
          }
        },
        isFocused: () => {
          const c = containerRef.current;
          if (!c) return false;
          const active = document.activeElement;
          return active instanceof Node && c.contains(active);
        },
        focusSearch: () => {
          setIsSearchOpen(true);
          searchRef.current?.focus();
        },
        toggleSearch: () => {
          if (searchRef.current?.isFocused()) {
            closeSearch();
          } else {
            setIsSearchOpen(true);
            searchRef.current?.focus();
          }
        },
        refresh: (path: string) => tree.refresh(path),
      }),
      [entryPaths, scrollEntryIntoView, selectedPath],
    );

    if (!rootPath) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <HugeiconsIcon
            icon={Folder01Icon}
            size={24}
            strokeWidth={1.5}
            className="text-muted-foreground"
          />
          <div className="text-xs text-muted-foreground">
            No current directory
          </div>
        </div>
      );
    }

    const root = tree.nodes[rootPath];
    const activeMode =
      ROOT_MODES.find((m) => m.id === rootMode) ?? ROOT_MODES[0];

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (tree.renaming || tree.pendingCreate || isSearchOpen) return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;
      if (entryPaths.length === 0) return;

      const currentIdx = selectedPath ? entryPaths.indexOf(selectedPath) : -1;

      if (matchesShortcut(e.nativeEvent, "file.rename", userShortcuts)) {
        if (currentIdx < 0) return;
        e.preventDefault();
        rowActions.beginRename(entryPaths[currentIdx]);
        return;
      }

      const move = (next: number) => {
        const clamped = Math.max(0, Math.min(entryPaths.length - 1, next));
        const path = entryPaths[clamped];
        setSelectedPath(path);
        requestAnimationFrame(() => scrollEntryIntoView(path));
      };

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          move(currentIdx < 0 ? 0 : currentIdx + 1);
          break;
        case "ArrowUp":
          e.preventDefault();
          move(currentIdx < 0 ? entryPaths.length - 1 : currentIdx - 1);
          break;
        case "ArrowRight": {
          if (currentIdx < 0) return;
          e.preventDefault();
          const path = entryPaths[currentIdx];
          const idx = entryIndexByPath.get(path);
          if (idx === undefined) break;
          const row = rows[idx];
          if (row.kind !== "entry") break;
          if (row.isDir) {
            if (!row.isExpanded) tree.toggle(row.path);
            else move(currentIdx + 1);
          }
          break;
        }
        case "ArrowLeft": {
          if (currentIdx < 0) return;
          e.preventDefault();
          const path = entryPaths[currentIdx];
          const idx = entryIndexByPath.get(path);
          if (idx === undefined) break;
          const row = rows[idx];
          if (row.kind !== "entry") break;
          if (row.isDir && row.isExpanded) {
            tree.toggle(row.path);
          } else {
            const parent = pathDirname(row.path);
            if (parent && parent !== rootPath) setSelectedPath(parent);
          }
          break;
        }
        case "Enter": {
          if (currentIdx < 0) return;
          e.preventDefault();
          const path = entryPaths[currentIdx];
          const idx = entryIndexByPath.get(path);
          if (idx === undefined) break;
          const row = rows[idx];
          if (row.kind !== "entry") break;
          if (row.isDir) tree.toggle(row.path);
          else if (editorPreviewOnClick) onOpenFile(row.path);
          break;
        }
      }
    };

    const renderRow = (row: Row) => {
      switch (row.kind) {
        case "entry":
        case "rename": {
          return (
            <EntryRow
              path={row.path}
              name={row.name}
              isDir={row.isDir}
              isExpanded={row.kind === "entry" ? row.isExpanded : false}
              depth={row.depth}
              rootPath={rootPath}
              actions={rowActions}
              renameInProgress={renameInProgress}
              isSelected={selectedPath === row.path}
              isRenaming={row.kind === "rename"}
              isExternalDropTarget={externalTargetDir === row.path}
              gitStatusCode={row.gitStatusCode}
              gitColorScheme={gitColorScheme}
              gitignored={row.gitignored}
              onOpenFile={onOpenFile}
              onSelectPath={setSelectedPath}
              onRevealInTerminal={onRevealInTerminal}
              onNewWorkspaceFromFolder={onNewWorkspaceFromFolder}
              onSetAsRoot={onSetAsRoot}
              onEnterFolder={onEnterFolder}
              editorPreviewOnClick={editorPreviewOnClick}
            />
          );
        }
        case "fs-root":
          return (
            <FsRootRow
              path={row.path}
              isWorkspaceRoot={rootMode === "pinned"}
              onSetAsRoot={onSetAsRoot}
              onNewWorkspaceFromFolder={onNewWorkspaceFromFolder}
              onRevealInTerminal={onRevealInTerminal}
              onBeginCreate={tree.beginCreate}
              onRefresh={tree.refresh}
            />
          );
        case "fs-up":
          return <FsUpRow path={row.path} onNavigateUp={onNavigateUp} />;
        case "pending":
          return (
            <PendingRow
              depth={row.depth}
              kind={row.pendingKind}
              onCommit={tree.commitCreate}
              onCancel={tree.cancelCreate}
            />
          );
        case "status":
          return (
            <StatusRow
              depth={row.depth}
              message={row.message}
              tone={row.tone}
            />
          );
      }
    };

    return (
      <div
        ref={containerRef}
        className="flex h-full flex-col outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/60 px-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                title={rootPath ?? undefined}
              >
                <HugeiconsIcon
                  icon={activeMode.icon}
                  size={13}
                  strokeWidth={2}
                  className="shrink-0 text-primary"
                />
                <span className="truncate">{activeMode.label}</span>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  size={12}
                  strokeWidth={2}
                  className="shrink-0"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-auto min-w-56 max-w-[90vw]"
            >
              {ROOT_MODES.map((m) => {
                const info = rootModeInfo(m.id, {
                  fsRootPath,
                  workspaceRootPath,
                  workspaceRootExists,
                  terminalCwdPath,
                  gitRootPath,
                });
                return (
                  <DropdownMenuItem
                    key={m.id}
                    disabled={info.disabled}
                    onSelect={() => onChangeRootMode(m.id)}
                    className="flex items-start gap-2.5"
                  >
                    <HugeiconsIcon
                      icon={m.icon}
                      size={14}
                      strokeWidth={2}
                      className="mt-0.5 shrink-0 text-primary"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-xs font-medium">{m.label}</span>
                      {info.subtitle && (
                        <span className="break-all text-[11px] text-muted-foreground">
                          {info.subtitle}
                        </span>
                      )}
                    </span>
                    {(() => {
                      const scId = MODE_SHORTCUT[m.id];
                      const sc = scId
                        ? (userShortcuts[scId] ?? (SHORTCUTS_BY_ID.get(scId)?.defaultBindings ?? []))
                        : [];
                      const tokens = getBindingTokens(sc[0]);
                      return tokens.length > 0 ? (
                        <KbdGroup className="ml-auto shrink-0">
                          {tokens.map((t, i) => (
                            <Kbd key={i}>{t}</Kbd>
                          ))}
                        </KbdGroup>
                      ) : null;
                    })()}
                    {rootMode === m.id && (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        size={13}
                        strokeWidth={2}
                        className="mt-0.5 shrink-0 text-primary"
                      />
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {rootMode === "filesystem" && homePath && (
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => onEnterFolder?.(homePath)}
              title="Go to home"
              aria-label="Go to home"
            >
              <HugeiconsIcon icon={Home01Icon} size={13} strokeWidth={2} />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setIsSearchOpen((v) => !v)}
            title="Search files"
            aria-label="Search files"
          >
            <HugeiconsIcon icon={Search01Icon} size={13} strokeWidth={2} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => tree.refresh(rootPath)}
            title="Refresh"
          >
            <HugeiconsIcon icon={Refresh01Icon} size={12} strokeWidth={2} />
          </Button>
        </div>

        {rootMode === "pinned" &&
        (workspaceRootPath === null || root?.status === "error") ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
            <HugeiconsIcon
              icon={PinOffIcon}
              size={26}
              strokeWidth={1.8}
              className="text-muted-foreground"
            />
            <div className="text-sm font-medium text-foreground">
              {workspaceRootPath === null
                ? "No workspace root set"
                : "Folder not found"}
            </div>
            <div className="break-all text-[11px] text-muted-foreground">
              {workspaceRootPath ?? "Set a new workspace root in the explorer"}
            </div>
            <div className="mt-2 flex w-full flex-col gap-2">
              <button
                type="button"
                onClick={() => onChangeRootMode("terminal")}
                className="flex items-start gap-2 rounded-md border border-border/60 px-3 py-2 text-left text-xs transition-colors hover:bg-card"
              >
                <HugeiconsIcon
                  icon={ComputerTerminal01Icon}
                  size={14}
                  strokeWidth={2}
                  className="mt-0.5 shrink-0 text-primary"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">Follow Terminal</span>
                  {terminalCwdPath && (
                    <span className="break-all text-[10px] text-muted-foreground">
                      {terminalCwdPath}
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onChangeRootMode("git")}
                className="flex items-start gap-2 rounded-md border border-border/60 px-3 py-2 text-left text-xs transition-colors hover:bg-card"
              >
                <HugeiconsIcon
                  icon={GitBranchIcon}
                  size={14}
                  strokeWidth={2}
                  className="mt-0.5 shrink-0 text-primary"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">Follow Git Root</span>
                  <span className="break-all text-[10px] text-muted-foreground">
                    {gitRootPath ?? "No git repository in the current path"}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onChangeRootMode("filesystem")}
                className="flex items-start gap-2 rounded-md border border-border/60 px-3 py-2 text-left text-xs transition-colors hover:bg-card"
              >
                <HugeiconsIcon
                  icon={Home01Icon}
                  size={14}
                  strokeWidth={2}
                  className="mt-0.5 shrink-0 text-primary"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">File System</span>
                  {homePath && (
                    <span className="break-all text-[10px] text-muted-foreground">
                      {homePath}
                    </span>
                  )}
                </span>
              </button>
            </div>
          </div>
        ) : rootMode === "filesystem" && root?.status === "error" ? (
          <div className="flex flex-1 items-center justify-center px-4 py-10 text-center text-[11px] text-muted-foreground">
            Locating nearest existing folder…
          </div>
        ) : (
          <>
            <ExplorerSearch
              ref={searchRef}
              rootPath={rootPath}
              onOpenFile={onOpenFile}
              open={isSearchOpen}
              onRequestClose={closeSearch}
              onActiveChange={setIsSearchActive}
              onRevealInTerminal={onRevealInTerminal}
            />

            {!isSearchActive ? (
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div
                    ref={(node: HTMLDivElement | null) => {
                      scrollRef.current = node;
                      setRootDropRef(node);
                    }}
                    data-explorer-drop=""
                    className={cn(
                      "min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]",
                      rootIsDropTarget &&
                        "rounded-sm ring-1 ring-inset ring-primary/50",
                    )}
                  >
                    {root?.status === "loading" && (
                      <div className="px-3 py-2 text-[11px] text-muted-foreground">
                        Loading…
                      </div>
                    )}
                    {root?.status === "error" && (
                      <div className="px-3 py-2 text-[11px] text-destructive">
                        {root.message}
                      </div>
                    )}
                    {root?.status === "loaded" ? (
                      <div
                        style={{
                          height: virtualizer.getTotalSize(),
                          position: "relative",
                          width: "100%",
                        }}
                      >
                        {virtualizer.getVirtualItems().map((virtualRow) => {
                          const row = rows[virtualRow.index];
                          if (!row) return null;
                          return (
                            <div
                              key={virtualRow.key}
                              data-virtual-row-index={virtualRow.index}
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                height: virtualRow.size,
                                transform: `translateY(${virtualRow.start}px)`,
                              }}
                            >
                              {renderRow(row)}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent
                  className={COMPACT_CONTENT}
                  onCloseAutoFocus={(e) => {
                    if (tree.renaming || tree.pendingCreate) e.preventDefault();
                  }}
                >
                  {onRevealInTerminal && (
                    <ContextMenuItem
                      className={COMPACT_ITEM}
                      onSelect={() => onRevealInTerminal(rootPath)}
                    >
                      Open in Terminal
                    </ContextMenuItem>
                  )}
                  <ContextMenuItem
                    className={COMPACT_ITEM}
                    onSelect={() => void revealInFinder(rootPath)}
                  >
                    Reveal in Finder
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className={COMPACT_ITEM}
                    onSelect={() => tree.beginCreate(rootPath, "file")}
                  >
                    New File
                  </ContextMenuItem>
                  <ContextMenuItem
                    className={COMPACT_ITEM}
                    onSelect={() => tree.beginCreate(rootPath, "dir")}
                  >
                    New Folder
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className={COMPACT_ITEM}
                    onSelect={() => void copyToClipboard(rootPath)}
                  >
                    Copy Path
                  </ContextMenuItem>
                  <ContextMenuItem
                    className={COMPACT_ITEM}
                    onSelect={() => tree.refresh(rootPath)}
                  >
                    Refresh
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ) : null}
          </>
        )}
      </div>
    );
  }),
);
