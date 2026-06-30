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
  ClipboardIcon,
  ComputerTerminal01Icon,
  CopySlashIcon,
  DashboardSquareAddIcon,
  FileAddIcon,
  Folder01Icon,
  FolderAddIcon,
  FolderOpenIcon,
  HierarchyFilesIcon,
  Home01Icon,
  PinIcon,
  PinOffIcon,
  Refresh01Icon,
  Search01Icon,
  Tick02Icon,
  ViewIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { DeleteEntryModal } from "./DeleteEntryModal";
import { ExplorerSearch, type ExplorerSearchHandle } from "./ExplorerSearch";
import {
  EntryRow,
  FsRootRow,
  FsUpRow,
  PendingRow,
  StatusRow,
  type RowActions,
} from "./TreeRow";
import {
  copyToClipboard,
  REVEAL_LABEL,
  revealInFinder,
} from "./lib/contextActions";
import { COMPACT_CONTENT, COMPACT_ITEM } from "./lib/menuItemClass";
import { useExplorerFileDrop } from "./lib/useExplorerFileDrop";
import { useFileTree } from "./lib/useFileTree";
import { useGitStatus } from "./lib/useGitStatus";
import type { GitStatusCode } from "./lib/gitStatusUtils";
import { cn } from "@/lib/utils";
import { IS_MAC } from "@/lib/platform";
import { pathBasename, pathDirname } from "@/lib/pathUtils";
import { useWorkspaceDnd } from "@/modules/workspaces";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  getBindingTokens,
  matchesShortcut,
  SHORTCUTS_BY_ID,
  type ShortcutId,
} from "@/modules/shortcuts/shortcuts";
import type { GitStatusSnapshot } from "@/lib/native";
import {
  ancestorsToExpand,
  isUnder,
  type ExplorerRootMode,
} from "@/modules/workspaces/lib/explorerRoot";
import { dispatchRevealAction, type RevealAction } from "./lib/pendingAction";

export type RevealRequest = { path: string; nonce: number; pendingAction?: RevealAction };

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
  showHidden: boolean;
  onToggleShowHidden: () => void;
  onSetAsRoot: (path: string) => void;
  onEnterFolder?: (path: string) => void;
  onNavigateUp?: () => void;
  onFsRootMissing?: (path: string) => void;
  canNavigateUp: boolean;
  homePath: string | null;
  fsRootPath: string | null;
  gitRootPath: string | null;
  workspaceRootPath: string | null;
  workspaceRootExists: boolean;
  revealRequest?: RevealRequest | null;
  onOpenFile: (path: string, pin?: boolean) => void;
  onPathRenamed?: (from: string, to: string) => void;
  onPathDeleted?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onNewWorkspaceFromFolder?: (path: string) => void;
  onAddToGitignore?: (path: string, isDir: boolean) => void;
  onOpenWorkspaceProperties?: () => void;
  gitStatus?: GitStatusSnapshot | null;
  onSearchClose?: () => void;
  active?: boolean;
};

const ROOT_MODES: {
  id: ExplorerRootMode;
  label: string;
  icon: typeof Search01Icon;
}[] = [
  { id: "filesystem", label: "File System", icon: HierarchyFilesIcon },
  { id: "workspace", label: "Workspace Root", icon: PinIcon },
];

// Both modes surface Cmd+E, the key that cycles the explorer root between them.
const MODE_SHORTCUT: Record<string, ShortcutId> = {
  filesystem: "sidebar.showExplorer",
  workspace: "sidebar.showExplorer",
};

type RootModeContext = {
  fsRootPath: string | null;
  workspaceRootPath: string | null;
  workspaceRootExists: boolean;
};

function rootModeInfo(
  id: ExplorerRootMode,
  ctx: RootModeContext,
): { subtitle: string | null; disabled: boolean } {
  switch (id) {
    case "filesystem":
      return { subtitle: ctx.fsRootPath, disabled: false };
    case "workspace":
      if (!ctx.workspaceRootPath)
        return {
          subtitle: "No workspace defined yet. Set a new one in the explorer",
          disabled: true,
        };
      if (!ctx.workspaceRootExists)
        return { subtitle: "Folder not found", disabled: true };
      return { subtitle: ctx.workspaceRootPath, disabled: false };
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
  | { kind: "duplicate"; key: string; depth: number; dupKind: "file" | "dir"; initial: string }
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
        if (tree.pendingDuplicate?.sourcePath === path) {
          rows.push({
            kind: "duplicate",
            key: `dup:${path}`,
            depth,
            dupKind: tree.pendingDuplicate.kind,
            initial: tree.pendingDuplicate.suggestedName,
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
      showHidden,
      onToggleShowHidden,
      onSetAsRoot,
      onEnterFolder,
      onNavigateUp,
      onFsRootMissing,
      canNavigateUp,
      homePath,
      fsRootPath,
      gitRootPath,
      workspaceRootPath,
      workspaceRootExists,
      revealRequest,
      onOpenFile,
      onPathRenamed,
      onPathDeleted,
      onRevealInTerminal,
      onNewWorkspaceFromFolder,
      onAddToGitignore,
      onOpenWorkspaceProperties,
      gitStatus,
      onSearchClose,
      active = true,
    },
    ref,
  ) {
    const tree = useFileTree(rootPath, {
      onPathRenamed,
      onPathDeleted,
      showHidden,
    });

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
    const previewOnClick = usePreferencesStore((s) => s.previewOnClick);
    const { lookup: lookupGitStatus } = useGitStatus(rootPath, gitStatus, true);
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    // Drives the attention flash on the just-revealed row. The token bumps on
    // every reveal so revealing the same path again replays the animation.
    const [flash, setFlash] = useState<{ path: string; token: number }>({
      path: "",
      token: 0,
    });
    const [pendingDelete, setPendingDelete] = useState<{
      path: string;
      isDir: boolean;
    } | null>(null);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isSearchActive, setIsSearchActive] = useState(false);
    const searchRef = useRef<ExplorerSearchHandle>(null);
    const closeSearch = useCallback(() => {
      setIsSearchOpen(false);
      onSearchClose?.();
    }, [onSearchClose]);
    const [searchReveal, setSearchReveal] = useState<RevealRequest | null>(null);
    const searchRevealNonce = useRef(0);
    const revealInExplorer = useCallback(
      (path: string) => {
        searchRevealNonce.current += 1;
        setSearchReveal({ path, nonce: searchRevealNonce.current });
        closeSearch();
      },
      [closeSearch],
    );
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    // When a reveal target is a dotfile (or under a hidden dir) and showHidden
    // is off, we toggle it and wait for the tree to reload. We track which path
    // triggered the toggle so we keep returning "pending" during the async
    // refetch window (nodes stay "loaded" with old entries until Rust responds).
    const showHiddenToggledForRef = useRef<string | null>(null);

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
      tree.pendingDuplicate,
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
        beginDuplicate: tree.beginDuplicate,
        deletePath: tree.deletePath,
        requestDelete: (path, isDir) => setPendingDelete({ path, isDir }),
        copyEntry: tree.copyEntry,
        cutEntry: tree.cutEntry,
        pasteEntry: tree.pasteEntry,
      }),
      [
        tree.toggle,
        tree.beginRename,
        tree.commitRename,
        tree.cancelRename,
        tree.beginCreate,
        tree.beginDuplicate,
        tree.deletePath,
        tree.copyEntry,
        tree.cutEntry,
        tree.pasteEntry,
      ],
    );
    const renameInProgress =
      tree.renaming !== null || tree.pendingCreate !== null || tree.pendingDuplicate !== null;

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
      (path: string, opts?: { topRatio?: number }) => {
        const index = entryIndexByPath.get(path);
        if (index === undefined) return;
        // topRatio anchors the row at a fixed fraction down the viewport instead
        // of just nudging it into view, so a deep target is not left at the very
        // bottom. Falls back to "auto" if the row has not been measured yet.
        if (opts?.topRatio !== undefined) {
          const measured = virtualizer.getOffsetForIndex(index, "start");
          if (measured) {
            const viewport = scrollRef.current?.clientHeight ?? 0;
            virtualizer.scrollToOffset(
              Math.max(0, measured[0] - viewport * opts.topRatio),
              { align: "start" },
            );
            return;
          }
        }
        virtualizer.scrollToIndex(index, { align: "auto" });
      },
      [entryIndexByPath, virtualizer],
    );

    // A pending rename/create/duplicate must not outlive its inline input being
    // interactable: while one is active, renameInProgress blocks every click in
    // the tree. The input commits on blur, but hiding the explorer (visibility)
    // or navigating away does not always fire blur, leaving the state stuck and
    // the tree unclickable with no visible input. Discard it on those handoffs.
    const discardPending = useCallback(() => {
      tree.cancelRename();
      tree.cancelCreate();
      tree.cancelDuplicate();
    }, [tree.cancelRename, tree.cancelCreate, tree.cancelDuplicate]);

    // Switching the right panel to Git/History keeps the explorer mounted but
    // hidden (CSS), so the pending state would survive and block clicks on return.
    useEffect(() => {
      if (!active) discardPending();
    }, [active, discardPending]);

    // Focus-on-Explorer (F4) navigates to a file; a half-typed rename is stale.
    const revealNonce = revealRequest?.nonce;
    useEffect(() => {
      if (revealNonce != null) discardPending();
    }, [revealNonce, discardPending]);

    // null = parent not loaded (existence unknown); false = parent loaded and
    // the entry is gone.
    const pathPresence = useCallback(
      (p: string): boolean | null => {
        const node = tree.nodes[pathDirname(p)];
        if (node?.status !== "loaded") return null;
        const base = pathBasename(p);
        return node.entries.some((e) => e.name === base);
      },
      [tree.nodes],
    );

    // A pending whose target was deleted or moved out from under us (an external
    // fs change refreshed the parent) loses its row and its input unmounts, yet
    // the state would persist and keep the tree unclickable. Drop it once the
    // parent is loaded and the target is confirmed gone. Create-at-root is exempt:
    // its parent is the root, whose own parent is never loaded.
    useEffect(() => {
      if (tree.renaming && pathPresence(tree.renaming) === false) {
        tree.cancelRename();
      }
      if (
        tree.pendingDuplicate &&
        pathPresence(tree.pendingDuplicate.sourcePath) === false
      ) {
        tree.cancelDuplicate();
      }
      if (
        tree.pendingCreate &&
        tree.pendingCreate.parentPath !== rootPath &&
        pathPresence(tree.pendingCreate.parentPath) === false
      ) {
        tree.cancelCreate();
      }
    }, [
      tree.renaming,
      tree.pendingCreate,
      tree.pendingDuplicate,
      pathPresence,
      rootPath,
      tree.cancelRename,
      tree.cancelCreate,
      tree.cancelDuplicate,
    ]);

    // Reveal a file or folder on demand. Root/mode changes reload the tree
    // asynchronously, so callers re-run as nodes/expanded settle: "pending" means
    // ancestors are still loading and the caller should retry on the next settle.
    const applyRevealTarget = useCallback(
      (file: string): "pending" | "done" => {
        // Hold the reveal until the explorer is the visible tab: selecting and
        // scrolling while hidden lands off-screen, so the highlight would only
        // show after a second request. Re-runs once `active` flips true.
        if (!active) return "pending";
        if (!rootPath || !isUnder(file, rootPath)) return "pending";
        if (tree.nodes[rootPath]?.status !== "loaded") return "pending";
        // The focused folder became the explorer root (a re-root): the root has
        // no tree entry to select, so flash the root row instead.
        if (isUnder(rootPath, file)) {
          setFlash((f) => ({ path: rootPath, token: f.token + 1 }));
          return "done";
        }
        let loading = false;
        for (const dir of ancestorsToExpand(rootPath, file)) {
          if (!tree.expanded.has(dir)) {
            tree.expand(dir);
            loading = true;
          } else if (tree.nodes[dir]?.status !== "loaded") {
            loading = true;
          }
        }
        if (loading) return "pending";
        // When the reveal target is itself a folder, expand it so its contents are
        // visible, not just its row. The parent ancestor is now loaded, so isDirAt
        // is reliable here; files report false and are left untouched.
        if (isDirAt(file) === true && !tree.expanded.has(file)) {
          tree.expand(file);
        }
        // Ancestors are settled. If the target is not in the visible tree and
        // showHidden is off, it might be a dotfile or under a hidden directory.
        // Enable hidden files and wait for the tree to reload with them visible.
        if (!entryIndexByPath.has(file)) {
          if (!showHidden && showHiddenToggledForRef.current !== file) {
            const rel = file.slice(rootPath.length);
            const hasDotSegment = rel
              .split(/[\\/]/)
              .some((s) => s.startsWith(".") && s !== "." && s !== "..");
            if (hasDotSegment) {
              showHiddenToggledForRef.current = file;
              onToggleShowHidden();
              return "pending";
            }
          }
          // Either showHidden is already on (tree is still reloading after the
          // toggle above) or the file genuinely isn't representable. Keep
          // returning "pending" while the reload is in flight; once entryIndexByPath
          // stabilises without the file we stay pending but no new trigger fires.
          if (showHiddenToggledForRef.current === file) return "pending";
          return "done";
        }
        showHiddenToggledForRef.current = null;
        // Skip the flash when the target is already selected: opening a file
        // from the sidebar selects it on click, and the autofocus tab would
        // otherwise re-reveal that same file in a circular flash.
        const alreadySelected = selectedPath === file;
        setSelectedPath(file);
        requestAnimationFrame(() => {
          scrollEntryIntoView(file, { topRatio: 0.2 });
          if (!alreadySelected) {
            setFlash((f) => ({ path: file, token: f.token + 1 }));
          }
        });
        return "done";
      },
      [
        active,
        rootPath,
        tree.nodes,
        tree.expanded,
        tree.expand,
        entryIndexByPath,
        isDirAt,
        scrollEntryIntoView,
        selectedPath,
        showHidden,
        onToggleShowHidden,
      ],
    );

    // Focus on Explorer: reveal a file or folder requested by the app (without
    // stealing focus).
    const revealConsumedRef = useRef<number | null>(null);
    useEffect(() => {
      if (!revealRequest) return;
      if (revealConsumedRef.current === revealRequest.nonce) return;
      if (applyRevealTarget(revealRequest.path) === "pending") return;
      revealConsumedRef.current = revealRequest.nonce;
      if (revealRequest.pendingAction && entryIndexByPath.has(revealRequest.path)) {
        dispatchRevealAction(
          revealRequest.pendingAction,
          revealRequest.path,
          isDirAt(revealRequest.path) === true,
          {
            beginRename: rowActions.beginRename,
            beginDuplicate: rowActions.beginDuplicate,
            requestDelete: rowActions.requestDelete,
          },
        );
      }
    }, [revealRequest, applyRevealTarget, entryIndexByPath, isDirAt, rowActions]);

    // Reveal a search result in the tree (from the search context menu).
    const searchRevealConsumedRef = useRef<number | null>(null);
    useEffect(() => {
      if (!searchReveal) return;
      if (searchRevealConsumedRef.current === searchReveal.nonce) return;
      if (applyRevealTarget(searchReveal.path) === "pending") return;
      searchRevealConsumedRef.current = searchReveal.nonce;
    }, [searchReveal, applyRevealTarget]);

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
      if (
        tree.renaming ||
        tree.pendingCreate ||
        tree.pendingDuplicate ||
        isSearchOpen ||
        pendingDelete
      )
        return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;
      if (matchesShortcut(e.nativeEvent, "file.paste", userShortcuts)) {
        e.preventDefault();
        if (selectedPath) {
          void rowActions.pasteEntry(selectedPath, isDirAt(selectedPath) === true);
        } else {
          void rowActions.pasteEntry(rootPath, true);
        }
        return;
      }

      if (entryPaths.length === 0) return;

      const currentIdx = selectedPath ? entryPaths.indexOf(selectedPath) : -1;

      if (matchesShortcut(e.nativeEvent, "file.rename", userShortcuts)) {
        if (currentIdx < 0) return;
        e.preventDefault();
        rowActions.beginRename(entryPaths[currentIdx]);
        return;
      }
      if (matchesShortcut(e.nativeEvent, "file.delete", userShortcuts)) {
        if (currentIdx < 0) return;
        e.preventDefault();
        const path = entryPaths[currentIdx];
        const isDir = isDirAt(path);
        if (isDir === undefined) return;
        setPendingDelete({ path, isDir });
        return;
      }
      if (matchesShortcut(e.nativeEvent, "file.copy", userShortcuts)) {
        if (currentIdx < 0) return;
        e.preventDefault();
        const path = entryPaths[currentIdx];
        const isDir = isDirAt(path);
        if (isDir === undefined) return;
        rowActions.copyEntry(path, isDir ? "dir" : "file");
        return;
      }
      if (matchesShortcut(e.nativeEvent, "file.cut", userShortcuts)) {
        if (currentIdx < 0) return;
        e.preventDefault();
        const path = entryPaths[currentIdx];
        const isDir = isDirAt(path);
        if (isDir === undefined) return;
        rowActions.cutEntry(path, isDir ? "dir" : "file");
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
          else if (previewOnClick) onOpenFile(row.path);
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
              flashToken={flash.path === row.path ? flash.token : 0}
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
              onAddToGitignore={onAddToGitignore}
              gitRootPath={gitRootPath}
              onEnterFolder={onEnterFolder}
              previewOnClick={previewOnClick}
              hasClipboard={tree.clipboard !== null}
              isCutSource={
                tree.clipboard?.mode === "cut" && tree.clipboard.path === row.path
              }
            />
          );
        }
        case "fs-root":
          return (
            <FsRootRow
              path={row.path}
              isWorkspaceRoot={rootMode === "workspace"}
              flashToken={flash.path === row.path ? flash.token : 0}
              onSetAsRoot={onSetAsRoot}
              onNewWorkspaceFromFolder={onNewWorkspaceFromFolder}
              onRevealInTerminal={onRevealInTerminal}
              onBeginCreate={tree.beginCreate}
              onRefresh={tree.refresh}
              onPaste={tree.pasteEntry}
              canPaste={tree.clipboard !== null}
            />
          );
        case "fs-up":
          return (
            <FsUpRow
              path={row.path}
              onNavigateUp={onNavigateUp}
              onRevealInTerminal={onRevealInTerminal}
              onRefresh={() => tree.refresh(rootPath)}
            />
          );
        case "pending":
          return (
            <PendingRow
              depth={row.depth}
              kind={row.pendingKind}
              onCommit={tree.commitCreate}
              onCancel={tree.cancelCreate}
            />
          );
        case "duplicate":
          return (
            <PendingRow
              depth={row.depth}
              kind={row.dupKind}
              initial={row.initial}
              onCommit={tree.commitDuplicate}
              onCancel={tree.cancelDuplicate}
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
        <div className="flex h-8 shrink-0 items-center gap-1 px-1.5">
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
                });
                const isSetWorkspaceRoot =
                  m.id === "workspace" && workspaceRootPath === null;
                return (
                  <DropdownMenuItem
                    key={m.id}
                    disabled={info.disabled && !isSetWorkspaceRoot}
                    onSelect={() => {
                      if (isSetWorkspaceRoot) {
                        onOpenWorkspaceProperties?.();
                      } else {
                        onChangeRootMode(m.id);
                      }
                    }}
                    className="flex items-start gap-2.5"
                  >
                    <HugeiconsIcon
                      icon={m.icon}
                      size={14}
                      strokeWidth={2}
                      className="mt-0.5 shrink-0 text-primary"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-xs font-medium">
                        {isSetWorkspaceRoot ? "Set Workspace root" : m.label}
                      </span>
                      {!isSetWorkspaceRoot && info.subtitle && (
                        <span className="break-all text-[11px] text-muted-foreground">
                          {info.subtitle}
                        </span>
                      )}
                    </span>
                    {rootMode === m.id && !isSetWorkspaceRoot && (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        size={13}
                        strokeWidth={2}
                        className="mt-0.5 ml-auto shrink-0 text-primary"
                      />
                    )}
                    {!isSetWorkspaceRoot && (() => {
                      const scId = MODE_SHORTCUT[m.id];
                      const sc = scId
                        ? (userShortcuts[scId] ??
                          (SHORTCUTS_BY_ID.get(scId)?.defaultBindings ?? []))
                        : [];
                      const tokens = getBindingTokens(sc[0]);
                      if (tokens.length === 0) return null;
                      const text = IS_MAC ? tokens.join("") : tokens.join("+");
                      return (
                        <span
                          className={cn(
                            "mt-0.5 shrink-0 text-[11px] tracking-wide text-muted-foreground",
                            rootMode !== m.id && "ml-auto",
                          )}
                        >
                          {text}
                        </span>
                      );
                    })()}
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
            onClick={onToggleShowHidden}
            title={showHidden ? "Hide hidden files" : "Show hidden files"}
            aria-label="Toggle hidden files"
          >
            <HugeiconsIcon
              icon={showHidden ? ViewIcon : ViewOffSlashIcon}
              size={13}
              strokeWidth={2}
            />
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

        {rootMode === "workspace" &&
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
              {workspaceRootPath ?? "No workspace defined yet. Set a new one in the explorer"}
            </div>
            <div className="mt-2 flex w-full flex-col gap-2">
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
              showHidden={showHidden}
              onOpenFile={onOpenFile}
              open={isSearchOpen}
              onRequestClose={closeSearch}
              onActiveChange={setIsSearchActive}
              onRevealInTerminal={onRevealInTerminal}
              onRevealInExplorer={revealInExplorer}
              onSetAsRoot={onSetAsRoot}
              onNewWorkspaceFromFolder={onNewWorkspaceFromFolder}
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
                      "thin-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]",
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
                    if (tree.renaming || tree.pendingCreate || tree.pendingDuplicate) e.preventDefault();
                  }}
                >
                  {onSetAsRoot && (
                    <ContextMenuItem
                      className={COMPACT_ITEM}
                      disabled={rootMode === "workspace"}
                      onSelect={() => onSetAsRoot(rootPath)}
                    >
                      <HugeiconsIcon icon={PinIcon} size={14} strokeWidth={2} />
                      {rootMode === "workspace"
                        ? "This is the Workspace Root"
                        : "Set as Workspace Root"}
                    </ContextMenuItem>
                  )}
                  {onNewWorkspaceFromFolder && (
                    <ContextMenuItem
                      className={COMPACT_ITEM}
                      onSelect={() => onNewWorkspaceFromFolder(rootPath)}
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
                      onSelect={() => onRevealInTerminal(rootPath)}
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
                    onSelect={() => void revealInFinder(rootPath)}
                  >
                    <HugeiconsIcon
                      icon={FolderOpenIcon}
                      size={14}
                      strokeWidth={2}
                    />
                    {REVEAL_LABEL}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className={COMPACT_ITEM}
                    onSelect={() => tree.beginCreate(rootPath, "file")}
                  >
                    <HugeiconsIcon icon={FileAddIcon} size={14} strokeWidth={2} />
                    New File
                  </ContextMenuItem>
                  <ContextMenuItem
                    className={COMPACT_ITEM}
                    onSelect={() => tree.beginCreate(rootPath, "dir")}
                  >
                    <HugeiconsIcon
                      icon={FolderAddIcon}
                      size={14}
                      strokeWidth={2}
                    />
                    New Folder
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className={COMPACT_ITEM}
                    disabled={tree.clipboard === null}
                    onSelect={() => void tree.pasteEntry(rootPath, true)}
                  >
                    <HugeiconsIcon
                      icon={ClipboardIcon}
                      size={14}
                      strokeWidth={2}
                    />
                    Paste
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className={COMPACT_ITEM}
                    onSelect={() => void copyToClipboard(rootPath, "Copied absolute path")}
                  >
                    <HugeiconsIcon icon={CopySlashIcon} size={14} strokeWidth={2} />
                    Copy Absolute Path
                  </ContextMenuItem>
                  <ContextMenuItem
                    className={COMPACT_ITEM}
                    onSelect={() => tree.refresh(rootPath)}
                  >
                    <HugeiconsIcon
                      icon={Refresh01Icon}
                      size={14}
                      strokeWidth={2}
                    />
                    Refresh
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ) : null}
          </>
        )}
        {pendingDelete && (
          <DeleteEntryModal
            open
            name={pathBasename(pendingDelete.path)}
            isDir={pendingDelete.isDir}
            onCancel={() => setPendingDelete(null)}
            onDelete={() => {
              void tree.deletePath(pendingDelete.path);
              setPendingDelete(null);
            }}
            onTrash={() => {
              void tree.trashPath(pendingDelete.path);
              setPendingDelete(null);
            }}
          />
        )}
      </div>
    );
  }),
);
