import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { pathBasename } from "@/lib/pathUtils";
import { IS_MAC } from "@/lib/platform";
import { cn } from "@/lib/utils";
import {
  copyToClipboard,
  revealInFinder,
} from "@/modules/explorer/lib/contextActions";
import { fileIconUrl, folderIconUrl } from "@/modules/explorer/lib/iconResolver";
import {
  COMPACT_CONTENT,
  COMPACT_ITEM,
} from "@/modules/explorer/lib/menuItemClass";
import { joinPath } from "@/modules/explorer/lib/useFileTree";
import { gitStatusHexColor } from "@/modules/explorer/lib/gitStatusColor";
import type { GitStatusCode } from "@/modules/explorer/lib/gitStatusUtils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setScmViewMode } from "@/modules/settings/store";
import {
  Add01Icon,
  Alert02Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  CopySlashIcon,
  File01Icon,
  FileDiffIcon,
  FolderOpenIcon,
  FolderTreeIcon,
  Cancel01Icon,
  GitBranchIcon,
  Link01Icon,
  ListViewIcon,
  MinusSignIcon,
  PlusSignIcon,
  Refresh01Icon,
  RemoveSquareIcon,
  SquareArrowDown02Icon,
  SquareArrowDown03Icon,
  SquareArrowUp02Icon,
  UnfoldLessIcon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { invoke } from "@tauri-apps/api/core";
import { currentWorkspaceEnv } from "@/modules/workspace";
import { HugeiconsIcon } from "@hugeicons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { SourceControlSummary } from "./useSourceControl";
import {
  useSourceControlPanel,
  type DiffSelection,
  type SourceControlEntry,
} from "./useSourceControlPanel";
import { BranchPicker } from "./BranchPicker";
import { RemoteSection } from "./RemoteSection";
import { WorktreePicker } from "./WorktreePicker";
import {
  buildScmTree,
  collectDirKeys,
  flattenScmTree,
  type ScmDirNode,
} from "./scmTree";

type Props = {
  open: boolean;
  sourceControl: SourceControlSummary;
  pushOnCommit: boolean;
  onPushOnCommitChange: (enabled: boolean) => void;
  gitWorkspaceId: string | null;
  savedCommitMessage: string;
  onCommitMessagePersist: (workspaceId: string, message: string) => void;
  onOpenDiff: (input: {
    path: string;
    repoRoot: string;
    mode: "+" | "-";
    originalPath: string | null;
    title?: string;
  }) => void;
  onOpenFile?: (absolutePath: string, pin?: boolean) => void;
  onNavigateToWorktree?: (path: string) => void;
  workspaceCwd?: string | null;
};

const ROW_HEIGHTS = {
  banner: 32,
  header: 30,
  entry: 24,
} as const;

type RowDescriptor =
  | { kind: "banner-diverged"; key: string }
  | { kind: "staged-header"; key: string; count: number }
  | { kind: "staged-entry"; key: string; entry: SourceControlEntry }
  | { kind: "changes-header"; key: string; count: number }
  | { kind: "changes-entry"; key: string; entry: SourceControlEntry }
  | {
      kind: "tree-dir";
      key: string;
      collapseKey: string;
      depth: number;
      node: ScmDirNode;
      section: "staged" | "changes";
    }
  | { kind: "tree-file"; key: string; depth: number; entry: SourceControlEntry };

function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

function dirname(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return "";
  return normalized.slice(0, index);
}

function entriesUnderFolder(
  fullPath: string,
  entries: SourceControlEntry[],
): SourceControlEntry[] {
  const prefix = `${fullPath}/`;
  return entries.filter((entry) => {
    const normalized = entry.path.replace(/\\/g, "/");
    return normalized.startsWith(prefix);
  });
}


function statusTextClass(code: string): string {
  switch (code) {
    case "A": return "text-emerald-500/85";
    case "U": return "text-teal-500/85";
    case "M": return "text-amber-500/85";
    case "D": return "text-rose-500/85";
    case "R": return "text-sky-500/85";
    default: return "text-muted-foreground/60";
  }
}


export const SourceControlPanel = memo(function SourceControlPanel({
  open,
  sourceControl,
  pushOnCommit,
  onPushOnCommitChange,
  gitWorkspaceId,
  savedCommitMessage,
  onCommitMessagePersist,
  onOpenDiff,
  onOpenFile,
  onNavigateToWorktree,
  workspaceCwd,
}: Props) {
  const scm = useSourceControlPanel(open, sourceControl, onOpenDiff, {
    workspaceId: gitWorkspaceId,
    savedCommitMessage,
    onPersist: onCommitMessagePersist,
  });
  const refreshAnimationRef = useRef<number | null>(null);
  const [refreshAnimating, setRefreshAnimating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusedRowKey, setFocusedRowKey] = useState<string | null>(null);
  const [stagedCollapsed, setStagedCollapsed] = useState(false);
  const [changesCollapsed, setChangesCollapsed] = useState(false);
  const scmViewMode = usePreferencesStore((s) => s.scmViewMode);
  const [treeCollapsed, setTreeCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggleTreeDir = useCallback((fullPath: string) => {
    setTreeCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(fullPath)) next.delete(fullPath);
      else next.add(fullPath);
      return next;
    });
  }, []);

  const handleStageFolder = useCallback(
    (node: ScmDirNode) => {
      void scm.stageEntries(
        entriesUnderFolder(node.fullPath, scm.unstagedEntries),
      );
    },
    [scm],
  );

  const handleUnstageFolder = useCallback(
    (node: ScmDirNode) => {
      void scm.unstageEntries(
        entriesUnderFolder(node.fullPath, scm.stagedEntries),
      );
    },
    [scm],
  );

  const handleDiscardFolder = useCallback(
    (node: ScmDirNode) => {
      scm.requestDiscardEntries(
        entriesUnderFolder(node.fullPath, scm.unstagedEntries),
      );
    },
    [scm],
  );

  useEffect(() => {
    return () => {
      if (refreshAnimationRef.current) {
        window.clearTimeout(refreshAnimationRef.current);
      }
    };
  }, []);

  const isRefreshing = scm.panelState === "loading";
  const repoLabel = useMemo(() => {
    if (!scm.status) return "Source Control";
    return scm.status.isDetached ? "detached" : scm.status.branch;
  }, [scm.status]);

  const commitShortcut = IS_MAC ? "⌘↩" : "Ctrl+Enter";
  const canCommit =
    scm.stagedEntries.length > 0 &&
    scm.commitMessage.trim().length > 0 &&
    !scm.actionBusy;
  const commitDisabledReason = scm.actionBusy
    ? "Wait for the current Git action to finish."
    : scm.stagedEntries.length === 0
      ? "Stage changes to enable commit."
      : scm.commitMessage.trim().length === 0
        ? "Enter a commit message to enable commit."
        : null;
  const commitHint = canCommit
    ? `Commit with ${commitShortcut}.`
    : (commitDisabledReason ?? `Commit with ${commitShortcut}.`);
  const pushHint = scm.pushHint ?? "Push is unavailable right now.";
  const pushDisabledReason = scm.actionBusy
    ? "Wait for the current Git action to finish."
    : pushHint;
  const stagedCount = scm.stagedEntries.length;
  const unstagedCount = scm.unstagedEntries.length;
  const changesSummary =
    stagedCount === 0 && unstagedCount === 0
      ? "No changes"
      : [
          unstagedCount > 0 ? `${unstagedCount} changed` : null,
          stagedCount > 0 ? `${stagedCount} staged` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const allTreeDirKeys = useMemo(
    () =>
      scmViewMode === "tree"
        ? [
            ...collectDirKeys(buildScmTree(scm.stagedEntries), "staged/"),
            ...collectDirKeys(buildScmTree(scm.unstagedEntries), "changes/"),
          ]
        : [],
    [scmViewMode, scm.stagedEntries, scm.unstagedEntries],
  );
  const allFoldersCollapsed =
    allTreeDirKeys.length > 0 &&
    allTreeDirKeys.every((key) => treeCollapsed.has(key));
  const toggleCollapseAll = useCallback(() => {
    setTreeCollapsed(
      allFoldersCollapsed ? new Set<string>() : new Set(allTreeDirKeys),
    );
  }, [allFoldersCollapsed, allTreeDirKeys]);

  const pushStatusLabel = useMemo(() => {
    const upstream = scm.status?.upstream;
    if (!upstream) return "No upstream";
    const remote = scm.selectedRemote;
    if (!remote) return upstream;
    const slashIdx = upstream.indexOf("/");
    const branch = slashIdx >= 0 ? upstream.slice(slashIdx + 1) : upstream;
    return `${remote}/${branch}`;
  }, [scm.status?.upstream, scm.selectedRemote]);
  const hasUpstream = !!scm.status?.upstream;
  const isDiverged =
    !!scm.status && scm.status.ahead > 0 && scm.status.behind > 0;

  const canPull =
    hasUpstream &&
    !!scm.status &&
    scm.status.behind > 0 &&
    !isDiverged &&
    !scm.actionBusy &&
    !sourceControl.busyAction;
  const canFetch = hasUpstream && !scm.actionBusy && !sourceControl.busyAction;

  const footerFeedback = useMemo(() => {
    if (scm.actionError)
      return { tone: "error", message: scm.actionError } as const;
    if (scm.remoteError)
      return { tone: "error", message: scm.remoteError } as const;
    if (scm.actionMessage)
      return { tone: "success", message: scm.actionMessage } as const;
    return null;
  }, [scm.actionError, scm.actionMessage, scm.remoteError]);

  const handleCommitShortcut = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      canCommit
    ) {
      event.preventDefault();
      void scm.commit();
      return;
    }
  };

  const handleRefresh = useCallback(() => {
    setRefreshAnimating(true);
    if (refreshAnimationRef.current) {
      window.clearTimeout(refreshAnimationRef.current);
    }
    void scm.refresh().finally(() => {
      refreshAnimationRef.current = window.setTimeout(() => {
        setRefreshAnimating(false);
        refreshAnimationRef.current = null;
      }, 450);
    });
  }, [scm]);

  const handleFetch = useCallback(() => {
    void sourceControl.runRemoteAction("fetch", {
      remote: scm.selectedRemote ?? undefined,
    });
  }, [sourceControl, scm.selectedRemote]);

  const handlePull = useCallback(() => {
    void sourceControl.runRemoteAction("pull");
  }, [sourceControl]);

  const rows = useMemo<RowDescriptor[]>(() => {
    const result: RowDescriptor[] = [];
    if (isDiverged) {
      result.push({ kind: "banner-diverged", key: "banner-diverged" });
    }
    if (scmViewMode === "tree") {
      const pushTree = (
        entries: SourceControlEntry[],
        prefix: string,
        section: "staged" | "changes",
      ) => {
        for (const r of flattenScmTree(buildScmTree(entries), treeCollapsed, prefix)) {
          if (r.type === "dir") {
            result.push({ kind: "tree-dir", key: r.key, collapseKey: r.collapseKey, depth: r.depth, node: r.node, section });
          } else {
            result.push({ kind: "tree-file", key: r.key, depth: r.depth, entry: r.entry });
          }
        }
      };
      if (scm.stagedEntries.length > 0) {
        result.push({ kind: "staged-header", key: "staged-header", count: scm.stagedEntries.length });
        if (!stagedCollapsed) pushTree(scm.stagedEntries, "staged/", "staged");
      }
      if (scm.unstagedEntries.length > 0) {
        result.push({ kind: "changes-header", key: "changes-header", count: scm.unstagedEntries.length });
        if (!changesCollapsed) pushTree(scm.unstagedEntries, "changes/", "changes");
      }
      return result;
    }
    if (scm.stagedEntries.length > 0) {
      result.push({
        kind: "staged-header",
        key: "staged-header",
        count: scm.stagedEntries.length,
      });
      if (!stagedCollapsed) {
        for (const entry of scm.stagedEntries) {
          result.push({ kind: "staged-entry", key: entry.key, entry });
        }
      }
    }
    if (scm.unstagedEntries.length > 0) {
      result.push({
        kind: "changes-header",
        key: "changes-header",
        count: scm.unstagedEntries.length,
      });
      if (!changesCollapsed) {
        for (const entry of scm.unstagedEntries) {
          result.push({ kind: "changes-entry", key: entry.key, entry });
        }
      }
    }
    return result;
  }, [
    scmViewMode,
    isDiverged,
    scm.stagedEntries,
    scm.unstagedEntries,
    treeCollapsed,
    stagedCollapsed,
    changesCollapsed,
  ]);

  const rowKeyToIndex = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, index) => map.set(row.key, index));
    return map;
  }, [rows]);

  useEffect(() => {
    if (!focusedRowKey) return;
    if (!rowKeyToIndex.has(focusedRowKey)) {
      setFocusedRowKey(null);
    }
  }, [focusedRowKey, rowKeyToIndex]);

  const estimateSize = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return ROW_HEIGHTS.entry;
      switch (row.kind) {
        case "banner-diverged": return ROW_HEIGHTS.banner;
        case "staged-header":
        case "changes-header": return ROW_HEIGHTS.header;
        case "staged-entry":
        case "changes-entry":
        case "tree-dir":
        case "tree-file": return ROW_HEIGHTS.entry;
      }
    },
    [rows],
  );

  const focusableIndices = useMemo(() => {
    const out: number[] = [];
    rows.forEach((row, index) => {
      if (
        row.kind === "staged-entry" ||
        row.kind === "changes-entry" ||
        row.kind === "tree-dir" ||
        row.kind === "tree-file"
      )
        out.push(index);
    });
    return out;
  }, [rows]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan: 12,
    getItemKey: (index) => rows[index]?.key ?? index,
  });

  const moveFocus = useCallback(
    (direction: 1 | -1) => {
      if (focusableIndices.length === 0) return;
      const currentIndex =
        focusedRowKey === null ? -1 : (rowKeyToIndex.get(focusedRowKey) ?? -1);
      let pos = focusableIndices.findIndex((i) => i === currentIndex);
      if (pos === -1) pos = direction > 0 ? -1 : focusableIndices.length;
      let nextPos = pos + direction;
      if (nextPos < 0) nextPos = 0;
      if (nextPos > focusableIndices.length - 1)
        nextPos = focusableIndices.length - 1;
      const targetRowIndex = focusableIndices[nextPos];
      const target = rows[targetRowIndex];
      if (!target) return;
      setFocusedRowKey(target.key);
      virtualizer.scrollToIndex(targetRowIndex, { align: "auto" });
    },
    [focusableIndices, focusedRowKey, rowKeyToIndex, rows, virtualizer],
  );

  const focusedEntry = useCallback((): SourceControlEntry | null => {
    if (!focusedRowKey) return null;
    const index = rowKeyToIndex.get(focusedRowKey);
    if (index === undefined) return null;
    const row = rows[index];
    return row &&
      (row.kind === "staged-entry" ||
        row.kind === "changes-entry" ||
        row.kind === "tree-file")
      ? row.entry
      : null;
  }, [focusedRowKey, rowKeyToIndex, rows]);

  const handlePanelKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.closest("button"))
      ) {
        return;
      }
      const meta = event.metaKey || event.ctrlKey;
      if (meta && (event.key === "r" || event.key === "R")) {
        event.preventDefault();
        handleRefresh();
        return;
      }
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          moveFocus(1);
          break;
        case "ArrowUp":
          event.preventDefault();
          moveFocus(-1);
          break;
        case "ArrowRight":
        case "ArrowLeft": {
          if (!focusedRowKey) break;
          const idx = rowKeyToIndex.get(focusedRowKey);
          if (idx === undefined) break;
          const row = rows[idx];
          if (row?.kind === "tree-dir") {
            const collapsed = treeCollapsed.has(row.collapseKey);
            const wantCollapse = event.key === "ArrowLeft";
            if (collapsed !== wantCollapse) {
              event.preventDefault();
              toggleTreeDir(row.collapseKey);
            }
          }
          break;
        }
        case "Enter": {
          if (focusedRowKey) {
            const idx = rowKeyToIndex.get(focusedRowKey);
            const row = idx === undefined ? null : rows[idx];
            if (row?.kind === "tree-dir") {
              event.preventDefault();
              toggleTreeDir(row.collapseKey);
              break;
            }
          }
          const entry = focusedEntry();
          if (entry) {
            event.preventDefault();
            void scm.selectEntry(entry);
          }
          break;
        }
        case " ":
        case "s":
        case "S": {
          if (meta) break;
          if (!focusedRowKey) break;
          const idx = rowKeyToIndex.get(focusedRowKey);
          if (idx === undefined) break;
          const row = rows[idx];
          if (row?.kind === "staged-entry") {
            event.preventDefault();
            void scm.unstageEntry(row.entry);
          } else if (row?.kind === "changes-entry") {
            event.preventDefault();
            void scm.stageEntry(row.entry);
          } else if (row?.kind === "tree-file") {
            event.preventDefault();
            if (row.entry.mode === "+") void scm.unstageEntry(row.entry);
            else void scm.stageEntry(row.entry);
          }
          break;
        }
        case "d":
        case "D": {
          if (meta) break;
          if (!focusedRowKey) break;
          const idx = rowKeyToIndex.get(focusedRowKey);
          if (idx === undefined) break;
          const row = rows[idx];
          if (row?.kind === "changes-entry") {
            event.preventDefault();
            scm.requestDiscardEntry(row.entry);
          } else if (row?.kind === "tree-file" && row.entry.mode === "-") {
            event.preventDefault();
            scm.requestDiscardEntry(row.entry);
          }
          break;
        }
      }
    },
    [focusedEntry, focusedRowKey, handleRefresh, moveFocus, rowKeyToIndex, rows, scm, treeCollapsed, toggleTreeDir],
  );

  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneRunning, setCloneRunning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneElapsed, setCloneElapsed] = useState(0);
  const [initRunning, setInitRunning] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const cloneInputRef = useRef<HTMLInputElement>(null);
  const cloneBgHandleRef = useRef<number | null>(null);
  const clonePollRef = useRef<number | null>(null);
  const cloneCancelledRef = useRef(false);

  useEffect(() => {
    if (!cloneRunning) { setCloneElapsed(0); return; }
    const t = window.setInterval(() => setCloneElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [cloneRunning]);

  useEffect(() => {
    return () => {
      if (clonePollRef.current !== null) window.clearInterval(clonePollRef.current);
    };
  }, []);

  const handleGitInit = useCallback(async () => {
    if (!workspaceCwd) return;
    setInitRunning(true);
    setInitError(null);
    try {
      await invoke("shell_run_command", {
        command: "git init .",
        cwd: workspaceCwd,
        workspace: currentWorkspaceEnv(),
      });
      await scm.refresh();
    } catch (e) {
      setInitError(typeof e === "string" ? e : "git init failed");
    } finally {
      setInitRunning(false);
    }
  }, [workspaceCwd, scm]);

  const handleGitClone = useCallback(async () => {
    const url = cloneUrl.trim();
    if (!url || !workspaceCwd) return;
    setCloneError(null);

    try {
      const entries = await invoke<{ name: string }[]>("fs_read_dir", {
        path: workspaceCwd,
        showHidden: true,
        workspace: currentWorkspaceEnv(),
      });
      if (entries.length > 0) {
        setCloneError("The directory is not empty. Remove all files before cloning.");
        return;
      }
    } catch {
      // if we can't check, let git report the error
    }

    setCloneRunning(true);
    cloneCancelledRef.current = false;

    let handle: number;
    try {
      handle = await invoke<number>("shell_bg_spawn", {
        command: `git clone ${url} .`,
        cwd: workspaceCwd,
        workspace: currentWorkspaceEnv(),
      });
      cloneBgHandleRef.current = handle;
    } catch (e) {
      setCloneError(typeof e === "string" ? e : "Clone failed");
      setCloneRunning(false);
      return;
    }

    type BgLogsResult = { bytes: string; exited: boolean; exit_code: number | null };
    clonePollRef.current = window.setInterval(async () => {
      if (cloneCancelledRef.current) return;
      try {
        const result = await invoke<BgLogsResult>("shell_bg_logs", { handle, since_offset: 0 });
        if (!result.exited || cloneCancelledRef.current) return;
        window.clearInterval(clonePollRef.current!);
        clonePollRef.current = null;
        cloneBgHandleRef.current = null;
        setCloneRunning(false);
        if (result.exit_code === 0) {
          setCloneOpen(false);
          setCloneUrl("");
          void scm.refresh();
        } else {
          const lines = result.bytes.trim().split("\n").filter(Boolean);
          setCloneError(lines.slice(-3).join("\n") || `Clone failed (exit ${result.exit_code ?? "?"})`);
        }
      } catch (e) {
        if (cloneCancelledRef.current) return;
        window.clearInterval(clonePollRef.current!);
        clonePollRef.current = null;
        cloneBgHandleRef.current = null;
        setCloneRunning(false);
        setCloneError(typeof e === "string" ? e : "Clone failed");
      }
    }, 500);
  }, [cloneUrl, workspaceCwd, scm]);

  const handleCancelClone = useCallback(async () => {
    cloneCancelledRef.current = true;
    if (clonePollRef.current !== null) {
      window.clearInterval(clonePollRef.current);
      clonePollRef.current = null;
    }
    const handle = cloneBgHandleRef.current;
    cloneBgHandleRef.current = null;
    setCloneRunning(false);
    setCloneOpen(false);
    setCloneUrl("");
    setCloneError(null);
    if (handle !== null) {
      try { await invoke("shell_bg_kill", { handle }); } catch { /* best effort */ }
    }
  }, []);

  if (!open) return null;

  const fetchBusy = sourceControl.busyAction === "fetch";
  const pullBusy = sourceControl.busyAction === "pull";
  const pushBusy = sourceControl.busyAction === "push";

  const fetchLabel = fetchBusy
    ? "Fetching…"
    : !hasUpstream
      ? "No upstream configured"
      : "Fetch from remote";

  const pullLabel = pullBusy
    ? "Pulling…"
    : isDiverged
      ? "Branch diverged — resolve in terminal"
      : !hasUpstream
        ? "No upstream configured"
        : (scm.status?.behind ?? 0) === 0
          ? "Already up to date"
          : `Pull ${scm.status?.behind ?? 0} commits (fast-forward)`;

  const pushLabel = pushBusy ? "Pushing…" : pushDisabledReason;

  return (
    <TooltipProvider delayDuration={800} skipDelayDuration={300}>
      <aside className="flex h-full min-w-0 flex-col bg-sidebar [contain:layout_style]">
        <header className="flex shrink-0 items-start gap-1 border-b border-border/60 px-1.5 py-1">
          {scm.repo ? (
            <div className="flex flex-1 min-w-0 flex-col gap-1">
              <div className="flex h-6 min-w-0 items-center gap-1.5">
                <BranchPicker
                  currentBranch={repoLabel}
                  isDetached={scm.status?.isDetached ?? false}
                  disabled={!scm.repo || !!scm.actionBusy}
                  onFetchBranches={scm.fetchBranches}
                  onCheckout={scm.checkout}
                  onCreateBranch={scm.createBranch}
                />
                <div className="flex shrink-0 items-center gap-0.5">
                  <RemoteActionButton
                    label={fetchLabel}
                    disabled={!canFetch}
                    onClick={handleFetch}
                  >
                    {fetchBusy ? (
                      <Spinner className="size-3" />
                    ) : (
                      <HugeiconsIcon icon={SquareArrowDown03Icon} size={17} strokeWidth={1.85} />
                    )}
                  </RemoteActionButton>
                  <RemoteActionButton
                    label={pullLabel}
                    disabled={!canPull}
                    onClick={handlePull}
                  >
                    {pullBusy ? (
                      <Spinner className="size-3" />
                    ) : (
                      <span className={cn(
                        "inline-flex items-center gap-1",
                        (scm.status?.behind ?? 0) > 0 && "text-blue-600 dark:text-blue-400",
                      )}>
                        <HugeiconsIcon icon={SquareArrowDown02Icon} size={17} strokeWidth={1.9} />
                        {(scm.status?.behind ?? 0) > 0 && (
                          <span className="text-[10px] font-semibold tabular-nums">
                            {scm.status?.behind}
                          </span>
                        )}
                      </span>
                    )}
                  </RemoteActionButton>
                  <RemoteActionButton
                    label={pushLabel}
                    disabled={!scm.canPush || !!scm.actionBusy}
                    onClick={() => void scm.push()}
                  >
                    {pushBusy ? (
                      <Spinner className="size-3" />
                    ) : (
                      <span className={cn(
                        "inline-flex items-center gap-1",
                        (scm.status?.ahead ?? 0) > 0 && "text-emerald-600 dark:text-emerald-400",
                      )}>
                        <HugeiconsIcon icon={SquareArrowUp02Icon} size={17} strokeWidth={1.9} />
                        {(scm.status?.ahead ?? 0) > 0 && (
                          <span className="text-[10px] font-semibold tabular-nums">
                            {scm.status?.ahead}
                          </span>
                        )}
                      </span>
                    )}
                  </RemoteActionButton>
                </div>
                <div className="ml-auto shrink-0">
                  <RemoteSection
                    remotes={scm.remotes}
                    selectedRemote={scm.selectedRemote}
                    busy={!!scm.actionBusy || !!sourceControl.busyAction}
                    onSelectRemote={scm.setSelectedRemote}
                    onAddRemote={scm.addRemote}
                  />
                </div>
              </div>
              {scm.worktreeCount > 1 && onNavigateToWorktree ? (
                <div className="w-fit">
                  <WorktreePicker
                    label={
                      scm.repo.isWorktree
                        ? `Worktree: ${pathBasename(scm.repo.repoRoot)}`
                        : "Main worktree"
                    }
                    onFetchWorktrees={scm.fetchWorktrees}
                    onSelect={onNavigateToWorktree}
                  />
                </div>
              ) : (
                <span
                  title={scm.repo.repoRoot}
                  className="inline-flex w-fit max-w-full min-w-0 items-center gap-1 rounded bg-muted/55 px-1.5 py-0.5 text-[11.5px] font-medium text-muted-foreground"
                >
                  <span className="truncate">{pathBasename(scm.repo.repoRoot)}</span>
                </span>
              )}
            </div>
          ) : (
            <span className="flex h-6 items-center px-1 text-[12px] font-medium text-muted-foreground">
              Source Control
            </span>
          )}
        </header>

        {scm.panelState === "loading" ? (
          <PanelCenter title="Loading repository" />
        ) : null}

        {scm.panelState === "no-repo" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex size-10 items-center justify-center rounded-full border border-border/55 text-muted-foreground">
              <HugeiconsIcon icon={GitBranchIcon} size={18} strokeWidth={1.6} />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[12px] font-medium">No repository</span>
              <span className="text-[11px] text-muted-foreground">
                Initialize or clone a repository to start tracking changes.
              </span>
              {workspaceCwd && (
                <span
                  title={workspaceCwd}
                  className="mt-1 inline-block max-w-full truncate rounded bg-muted/55 px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground"
                >
                  {workspaceCwd}
                </span>
              )}
            </div>
            <div className="flex w-full flex-col gap-2">
              {!cloneOpen ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1.5 text-[12px]"
                    onClick={() => {
                      setCloneOpen(true);
                      setCloneError(null);
                      window.setTimeout(() => cloneInputRef.current?.focus(), 0);
                    }}
                  >
                    <HugeiconsIcon icon={GitBranchIcon} size={13} strokeWidth={2} />
                    Clone
                  </Button>
                  {workspaceCwd && (
                    <div className="flex flex-col gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-1.5 text-[12px]"
                        disabled={initRunning}
                        onClick={() => void handleGitInit()}
                      >
                        <HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} />
                        {initRunning ? "Initializing..." : "Init"}
                      </Button>
                      {initError && (
                        <p className="text-[11px] text-destructive">{initError}</p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <input
                      ref={cloneInputRef}
                      type="text"
                      value={cloneUrl}
                      disabled={cloneRunning}
                      onChange={(e) => setCloneUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !cloneRunning) void handleGitClone();
                      }}
                      placeholder="https://github.com/user/repo.git"
                      className="h-8 w-full rounded border border-border bg-transparent px-2.5 pr-7 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                      spellCheck={false}
                    />
                    {!cloneRunning && (
                      <button
                        type="button"
                        title="Clear"
                        className="absolute right-1 top-1/2 flex size-[22px] -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
                        onClick={() => void handleCancelClone()}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                  {!cloneRunning ? (
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        className="gap-1.5 text-[12px]"
                        disabled={!cloneUrl.trim()}
                        onClick={() => void handleGitClone()}
                      >
                        <HugeiconsIcon icon={GitBranchIcon} size={13} strokeWidth={2} />
                        Clone
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="flex flex-1 items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Spinner className="size-3 shrink-0" />
                        Cloning{cloneElapsed > 0 ? ` (${cloneElapsed}s)` : "..."}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-[12px]"
                        onClick={() => void handleCancelClone()}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                  {cloneError && (
                    <p className="text-[11px] text-destructive">{cloneError}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {scm.panelState === "error" ? (
          <PanelCenter
            title="Source control error"
            body={scm.statusError ?? "Unknown source control error"}
            action={
              <Button size="sm" onClick={() => void scm.refresh()}>
                Retry
              </Button>
            }
          />
        ) : null}

        {scm.panelState === "ready" && scm.status ? (
          <>
            <div className="relative shrink-0 space-y-2 border-b border-border/40 bg-gradient-to-b from-card/65 to-card/30 px-2.5 pb-2.5 pt-2.5">
              <div
                className={cn(
                  "relative rounded-lg border bg-background/95 shadow-sm transition-colors",
                  scm.commitMessage.length > 0
                    ? "border-border/70"
                    : "border-border/45",
                  "focus-within:border-primary/45 focus-within:shadow-md focus-within:shadow-primary/5",
                )}
              >
                <Textarea
                  value={scm.commitMessage}
                  onChange={(event) => scm.setCommitMessage(event.target.value)}
                  onKeyDown={handleCommitShortcut}
                  placeholder="Commit message"
                  rows={3}
                  className={cn(
                    "min-h-[72px] border-border resize-none rounded-lg bg-transparent px-3 pb-7 pt-2.5 text-[12.5px] leading-snug shadow-none placeholder:text-muted-foreground/65 focus-visible:ring-0 focus:border-0",
                  )}
                />
                <div className="pointer-events-none absolute inset-x-3 bottom-1.5 flex items-center justify-between p-1 gap-2 text-[10px] tabular-nums text-muted-foreground/55">
                  {scm.commitMessage.length > 0 ? (
                    <span>Ch: {scm.commitMessage.length}</span>
                  ) : (
                    <span className="flex gap-2 items-center">
                      {commitShortcut} <p>to commit</p>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex min-w-0 items-center gap-1.5 text-[10.5px] text-muted-foreground">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full transition-colors",
                    canCommit
                      ? "bg-foreground/80"
                      : stagedCount > 0
                        ? "bg-muted-foreground/60"
                        : "bg-muted-foreground/30",
                  )}
                />
                <span className="truncate font-medium text-foreground/85">
                  {stagedCount === 0
                    ? "Nothing staged"
                    : `${stagedCount} ${stagedCount === 1 ? "file" : "files"} staged`}
                </span>
                <span className="ml-auto shrink-0 truncate text-muted-foreground/65">
                  {pushStatusLabel}
                </span>
              </div>

              <div className="flex w-full items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="xs"
                      className="h-7 flex-1 text-[11.5px] font-semibold tracking-tight shadow-sm disabled:cursor-not-allowed disabled:shadow-none"
                      disabled={!canCommit}
                      onClick={() => {
                        if (pushOnCommit) {
                          void scm.commitAndPush();
                        } else {
                          void scm.commit();
                        }
                      }}
                    >
                      {scm.actionBusy === "commit"
                        ? "Committing…"
                        : scm.actionBusy === "push"
                          ? "Pushing…"
                          : pushOnCommit
                            ? "Commit & Push"
                            : "Commit"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-[10.5px]">
                    {commitHint}
                  </TooltipContent>
                </Tooltip>
                <label
                  title={
                    scm.canPush
                      ? "Push to remote after committing"
                      : pushDisabledReason
                  }
                  className="flex h-7 shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-md px-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Checkbox
                    checked={pushOnCommit}
                    onCheckedChange={(value) =>
                      onPushOnCommitChange(value === true)
                    }
                    aria-label="Push after commit"
                  />
                  Push
                </label>
              </div>

              <CommitFeedback
                feedback={footerFeedback}
                onDismiss={scm.dismissFeedback}
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-b border-border/40 px-2">
                <span className="min-w-0 truncate text-[10.5px] font-medium text-muted-foreground">
                  {changesSummary}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  {scmViewMode === "tree" ? (
                    <IconActionButton
                      label={
                        allFoldersCollapsed ? "Expand all" : "Collapse all"
                      }
                      disabled={allTreeDirKeys.length === 0}
                      onClick={toggleCollapseAll}
                    >
                      <HugeiconsIcon
                        icon={
                          allFoldersCollapsed ? UnfoldMoreIcon : UnfoldLessIcon
                        }
                        size={14}
                        strokeWidth={1.85}
                      />
                    </IconActionButton>
                  ) : null}
                  <IconActionButton
                    label={
                      scmViewMode === "tree" ? "View as list" : "View as tree"
                    }
                    onClick={() =>
                      void setScmViewMode(
                        scmViewMode === "tree" ? "list" : "tree",
                      )
                    }
                  >
                    <HugeiconsIcon
                      icon={scmViewMode === "tree" ? ListViewIcon : FolderTreeIcon}
                      size={14}
                      strokeWidth={1.85}
                    />
                  </IconActionButton>
                  <IconActionButton
                    label="Refresh source control"
                    disabled={isRefreshing || !!scm.actionBusy}
                    onClick={handleRefresh}
                  >
                    {isRefreshing ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <HugeiconsIcon
                        icon={Refresh01Icon}
                        size={14}
                        strokeWidth={1.9}
                        className={cn(refreshAnimating && "animate-spin")}
                      />
                    )}
                  </IconActionButton>
                </div>
              </div>
              {scm.allClean ? (
                <CleanTreeHint repoLabel={repoLabel} />
              ) : (
                <div
                  ref={containerRef}
                  tabIndex={0}
                  role="listbox"
                  aria-label="Changed files"
                  aria-activedescendant={
                    focusedRowKey ? `scm-row-${focusedRowKey}` : undefined
                  }
                  onKeyDown={handlePanelKeyDown}
                  className="relative min-h-0 flex-1 outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
                >
                  <div
                    ref={scrollRef}
                    className="thin-scrollbar h-full overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]"
                  >
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
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: virtualRow.size,
                              transform: `translateY(${virtualRow.start}px)`,
                            }}
                          >
                            <RowRenderer
                              row={row}
                              focused={focusedRowKey === row.key}
                              selected={scm.selected}
                              actionBusy={scm.actionBusy}
                              repoRoot={scm.repo?.repoRoot ?? null}
                              stagedCollapsed={stagedCollapsed}
                              changesCollapsed={changesCollapsed}
                              treeCollapsed={treeCollapsed}
                              onFocusRow={setFocusedRowKey}
                              onToggleStagedCollapsed={() => setStagedCollapsed((v) => !v)}
                              onToggleChangesCollapsed={() => setChangesCollapsed((v) => !v)}
                              onToggleTreeDir={toggleTreeDir}
                              onStageFolder={handleStageFolder}
                              onUnstageFolder={handleUnstageFolder}
                              onDiscardFolder={handleDiscardFolder}
                              onSelectEntry={scm.selectEntry}
                              onStageEntry={scm.stageEntry}
                              onUnstageEntry={scm.unstageEntry}
                              onDiscardEntry={scm.requestDiscardEntry}
                              onStageAll={scm.stageAllEntries}
                              onUnstageAll={scm.unstageAllEntries}
                              onDiscardAll={scm.requestDiscardAll}
                              onOpenFile={onOpenFile}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}
      </aside>

      <AlertDialog
        open={scm.pendingDiscard !== null}
        onOpenChange={(o) => {
          if (!o) scm.cancelPendingDiscard();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {scm.pendingDiscard?.scope === "all"
                ? "Discard all changes?"
                : scm.pendingDiscard?.untracked
                  ? "Delete untracked file?"
                  : "Discard changes?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {scm.pendingDiscard?.scope === "all" ? (
                scm.pendingDiscard.untrackedCount > 0 ? (
                  <>
                    All {scm.pendingDiscard.count} unstaged changes will be
                    discarded, including{" "}
                    {scm.pendingDiscard.untrackedCount === 1
                      ? "1 untracked file"
                      : `${scm.pendingDiscard.untrackedCount} untracked files`}{" "}
                    that will be permanently deleted from disk. This can&apos;t
                    be undone.
                  </>
                ) : (
                  `All ${scm.pendingDiscard.count} unstaged changes will be discarded. This can't be undone.`
                )
              ) : scm.pendingDiscard?.untracked ? (
                `"${basename(scm.pendingDiscard.label)}" is not tracked by git. It will be removed from disk. This can't be undone.`
              ) : scm.pendingDiscard ? (
                `Your edits to "${basename(scm.pendingDiscard.label)}" will be lost. This can't be undone.`
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => scm.cancelPendingDiscard()}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => void scm.confirmPendingDiscard()}>
              {scm.pendingDiscard?.scope === "all"
                ? "Discard all"
                : scm.pendingDiscard?.untracked
                  ? "Delete"
                  : "Discard"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
});

function PanelCenter({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="text-sm font-medium">{title}</div>
      {body ? (
        <div className="max-w-64 text-[11px] leading-relaxed text-muted-foreground">
          {body}
        </div>
      ) : null}
      {action}
    </div>
  );
}

function CleanTreeHint({ repoLabel }: { repoLabel: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-4 text-center">
      <div className="flex size-8 items-center justify-center rounded-full border border-border/55 text-muted-foreground">
        <HugeiconsIcon
          icon={CheckmarkCircle01Icon}
          size={16}
          strokeWidth={1.6}
        />
      </div>
      <div className="text-[12px] font-medium text-foreground">
        Working tree clean
      </div>
      <div className="text-[10.5px] leading-snug text-muted-foreground">
        on <span className="font-mono text-foreground/80">{repoLabel}</span>
      </div>
    </div>
  );
}

type RowRendererProps = {
  row: RowDescriptor;
  focused: boolean;
  selected: DiffSelection | null;
  actionBusy: string | null;
  repoRoot: string | null;
  stagedCollapsed: boolean;
  changesCollapsed: boolean;
  treeCollapsed: ReadonlySet<string>;
  onFocusRow: (key: string | null) => void;
  onToggleStagedCollapsed: () => void;
  onToggleChangesCollapsed: () => void;
  onToggleTreeDir: (fullPath: string) => void;
  onStageFolder: (node: ScmDirNode) => void;
  onUnstageFolder: (node: ScmDirNode) => void;
  onDiscardFolder: (node: ScmDirNode) => void;
  onSelectEntry: (entry: SourceControlEntry) => Promise<void>;
  onStageEntry: (entry: SourceControlEntry) => Promise<void>;
  onUnstageEntry: (entry: SourceControlEntry) => Promise<void>;
  onDiscardEntry: (entry: SourceControlEntry) => void;
  onStageAll: () => Promise<void>;
  onUnstageAll: () => Promise<void>;
  onDiscardAll: () => void;
  onOpenFile?: (absolutePath: string, pin?: boolean) => void;
};

const RowRenderer = memo(function RowRenderer(props: RowRendererProps) {
  const { row } = props;
  switch (row.kind) {
    case "banner-diverged":
      return <DivergedBanner />;
    case "staged-header":
      return <StagedSectionHeader {...props} row={row} />;
    case "changes-header":
      return <ChangesSectionHeader {...props} row={row} />;
    case "staged-entry":
    case "changes-entry":
    case "tree-file":
      return <EntryRow {...props} row={row} />;
    case "tree-dir":
      return <TreeDirRow {...props} row={row} />;
  }
});

function DivergedBanner() {
  return (
    <div className="mx-2 mt-1 flex h-7 items-center gap-1.5 rounded-md border border-border/60 bg-foreground/[0.04] px-2 text-[10.5px] leading-none text-muted-foreground">
      <HugeiconsIcon
        icon={Alert02Icon}
        size={11}
        strokeWidth={1.9}
        className="shrink-0"
      />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium text-foreground/85">
          Diverged from upstream
        </span>
        <span className="ml-1 opacity-75">- resolve in terminal</span>
      </span>
    </div>
  );
}

function StagedSectionHeader({
  row,
  actionBusy,
  stagedCollapsed,
  onToggleStagedCollapsed,
  onUnstageAll,
}: RowRendererProps & {
  row: Extract<RowDescriptor, { kind: "staged-header" }>;
}) {
  return (
    <div
      role="button"
      tabIndex={-1}
      className="group flex h-[30px] select-none items-center gap-2 px-2 hover:bg-accent/20"
      onClick={onToggleStagedCollapsed}
    >
      <HugeiconsIcon
        icon={stagedCollapsed ? ArrowRight01Icon : ArrowDown01Icon}
        size={10}
        strokeWidth={2.3}
        className="shrink-0 text-muted-foreground"
      />
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/85">
        Staged Changes
      </span>
      <div
        className="ml-auto flex shrink-0 items-center opacity-70 transition-opacity group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <IconActionButton
          label="Unstage all"
          disabled={actionBusy !== null}
          onClick={() => void onUnstageAll()}
        >
          <HugeiconsIcon icon={MinusSignIcon} size={11} strokeWidth={1.9} />
        </IconActionButton>
      </div>
      <span className="flex w-5 shrink-0 items-center justify-center">
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-border/60 px-1 text-[9.5px] font-semibold tabular-nums text-muted-foreground">
          {row.count}
        </span>
      </span>
    </div>
  );
}

function ChangesSectionHeader({
  row,
  actionBusy,
  changesCollapsed,
  onToggleChangesCollapsed,
  onStageAll,
  onDiscardAll,
}: RowRendererProps & {
  row: Extract<RowDescriptor, { kind: "changes-header" }>;
}) {
  return (
    <div
      role="button"
      tabIndex={-1}
      className="group flex h-[30px] select-none items-center gap-2 px-2 hover:bg-accent/20"
      onClick={onToggleChangesCollapsed}
    >
      <HugeiconsIcon
        icon={changesCollapsed ? ArrowRight01Icon : ArrowDown01Icon}
        size={10}
        strokeWidth={2.3}
        className="shrink-0 text-muted-foreground"
      />
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/85">
        Changes
      </span>
      <div
        className="ml-auto flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <IconActionButton
          label="Discard all changes"
          disabled={actionBusy !== null}
          onClick={() => onDiscardAll()}
        >
          <HugeiconsIcon icon={RemoveSquareIcon} size={11} strokeWidth={1.9} />
        </IconActionButton>
        <IconActionButton
          label="Stage all changes"
          disabled={actionBusy !== null}
          onClick={() => void onStageAll()}
        >
          <HugeiconsIcon icon={Add01Icon} size={11} strokeWidth={1.9} />
        </IconActionButton>
      </div>
      <span className="flex w-5 shrink-0 items-center justify-center">
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-border/60 px-1 text-[9.5px] font-semibold tabular-nums text-muted-foreground">
          {row.count}
        </span>
      </span>
    </div>
  );
}

function TreeDirRow({
  row,
  focused,
  actionBusy,
  treeCollapsed,
  onFocusRow,
  onToggleTreeDir,
  onStageFolder,
  onUnstageFolder,
  onDiscardFolder,
}: RowRendererProps & {
  row: Extract<RowDescriptor, { kind: "tree-dir" }>;
}) {
  const node = row.node;
  const collapsed = treeCollapsed.has(row.collapseKey);
  return (
    <div
      id={`scm-row-${row.key}`}
      role="button"
      tabIndex={-1}
      data-focused={focused || undefined}
      onMouseDown={() => onFocusRow(row.key)}
      onClick={() => onToggleTreeDir(row.collapseKey)}
      style={{ paddingLeft: 6 + row.depth * 12 }}
      className={cn(
        "group flex h-6 select-none items-center gap-2 rounded-sm pr-2 text-[13px] transition-colors",
        focused ? "bg-accent/60" : "hover:bg-accent/30",
      )}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={12}
          strokeWidth={2.25}
          className={cn("transition-transform", !collapsed && "rotate-90")}
        />
      </span>
      {(() => {
        const folderLeaf = node.name.split("/").pop() ?? node.name;
        return (
          <img src={folderIconUrl(folderLeaf, !collapsed)} alt="" className="size-4 shrink-0" />
        );
      })()}
      <span className="min-w-0 flex-1 truncate font-medium text-foreground/90">
        {node.name}
      </span>
      <div
        className="hidden shrink-0 items-center gap-0.5 group-hover:flex"
        onClick={(e) => e.stopPropagation()}
      >
        {row.section === "staged" ? (
          <IconActionButton
            label="Unstage folder"
            disabled={actionBusy !== null}
            onClick={() => onUnstageFolder(node)}
          >
            <HugeiconsIcon icon={MinusSignIcon} size={11} strokeWidth={1.9} />
          </IconActionButton>
        ) : (
          <>
            <IconActionButton
              label="Discard folder changes"
              disabled={actionBusy !== null}
              onClick={() => onDiscardFolder(node)}
            >
              <HugeiconsIcon icon={RemoveSquareIcon} size={11} strokeWidth={1.9} />
            </IconActionButton>
            <IconActionButton
              label="Stage folder"
              disabled={actionBusy !== null}
              onClick={() => onStageFolder(node)}
            >
              <HugeiconsIcon icon={Add01Icon} size={11} strokeWidth={1.9} />
            </IconActionButton>
          </>
        )}
      </div>
    </div>
  );
}

const EntryRow = memo(function EntryRow({
  row,
  focused,
  selected,
  actionBusy,
  repoRoot,
  onFocusRow,
  onSelectEntry,
  onStageEntry,
  onUnstageEntry,
  onDiscardEntry,
  onOpenFile,
}: RowRendererProps & {
  row: Extract<
    RowDescriptor,
    { kind: "staged-entry" } | { kind: "changes-entry" } | { kind: "tree-file" }
  >;
}) {
  const entry = row.entry;
  const isStaged = entry.mode === "+";
  const depth = row.kind === "tree-file" ? row.depth : 0;
  const showDirname = row.kind !== "tree-file";
  const isSelected =
    selected?.path === entry.path && selected?.mode === entry.mode;
  const fileName = basename(entry.path);
  const iconUrl = fileIconUrl(fileName);
  const pathLabel = entry.originalPath
    ? `${entry.originalPath} → ${entry.path}`
    : showDirname
      ? dirname(entry.path)
      : null;
  const isStageBusy = actionBusy === `stage:${entry.path}`;
  const isUnstageBusy = actionBusy === `unstage:${entry.path}`;
  const isDiscardBusy = actionBusy === `discard:${entry.path}`;
  const disabled = actionBusy !== null;
  const gitColorScheme = usePreferencesStore((s) => s.explorerGitColorScheme);
  const previewOnClick = usePreferencesStore((s) => s.previewOnClick);
  const statusHex = gitStatusHexColor(
    entry.statusCode as GitStatusCode,
    gitColorScheme,
  );
  const absolutePath = repoRoot
    ? joinPath(repoRoot.replace(/\\/g, "/"), entry.path.replace(/\\/g, "/"))
    : null;
  const isDeleted = entry.statusCode === "D";
  const revealLabel = IS_MAC ? "Reveal in Finder" : "Reveal in File Manager";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          id={`scm-row-${row.key}`}
          data-focused={focused || undefined}
          data-selected={isSelected || undefined}
          role="option"
          aria-selected={isSelected}
          onMouseDown={() => onFocusRow(row.key)}
          style={{ paddingLeft: 6 + depth * 12 }}
          className={cn(
            "group flex h-6 items-center gap-2 rounded-sm pr-2 text-[13px] transition-colors",
            focused
              ? "bg-accent/60"
              : isSelected
                ? "bg-accent/55 text-foreground"
                : "hover:bg-accent/30",
          )}
        >
          <span className="flex size-3.5 shrink-0 items-center justify-center" />
          <button
            type="button"
            onClick={() => {
              onFocusRow(row.key);
              if (previewOnClick) void onSelectEntry(entry);
            }}
            onDoubleClick={() => {
              if (!previewOnClick) void onSelectEntry(entry);
            }}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            {iconUrl ? (
              <img src={iconUrl} alt="" className="size-4 shrink-0" />
            ) : (
              <span className="size-4 shrink-0" />
            )}
            <div className="flex min-w-0 flex-1 items-baseline gap-1.5 leading-none">
              <span
                className={cn(
                  "truncate text-[13px] leading-tight",
                  isSelected || focused
                    ? "font-semibold text-foreground"
                    : "font-medium text-foreground/95",
                  pathLabel ? "max-w-[58%] shrink-0" : "min-w-0 flex-1",
                )}
                style={{
                  color: statusHex ?? undefined,
                  textDecoration: isDeleted ? "line-through" : undefined,
                }}
              >
                {fileName}
              </span>
              {pathLabel ? (
                <span className="min-w-0 flex-1 truncate text-[10.5px] leading-tight text-muted-foreground/75">
                  {pathLabel}
                </span>
              ) : null}
            </div>
          </button>
          <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex group-data-[focused=true]:flex group-data-[selected=true]:flex">
            {isStaged ? (
              <IconActionButton
                label={`Unstage ${entry.path}`}
                disabled={disabled}
                onClick={() => void onUnstageEntry(entry)}
              >
                {isUnstageBusy ? (
                  <Spinner className="size-3" />
                ) : (
                  <HugeiconsIcon
                    icon={MinusSignIcon}
                    size={11}
                    strokeWidth={1.9}
                  />
                )}
              </IconActionButton>
            ) : (
              <>
                <IconActionButton
                  label={`Discard ${entry.path}`}
                  disabled={disabled}
                  onClick={() => onDiscardEntry(entry)}
                >
                  {isDiscardBusy ? (
                    <Spinner className="size-3" />
                  ) : (
                    <HugeiconsIcon
                      icon={RemoveSquareIcon}
                      size={11}
                      strokeWidth={1.9}
                    />
                  )}
                </IconActionButton>
                <IconActionButton
                  label={`Stage ${entry.path}`}
                  disabled={disabled}
                  onClick={() => void onStageEntry(entry)}
                >
                  {isStageBusy ? (
                    <Spinner className="size-3" />
                  ) : (
                    <HugeiconsIcon icon={Add01Icon} size={11} strokeWidth={1.9} />
                  )}
                </IconActionButton>
              </>
            )}
          </div>
          <span
            className={cn(
              "w-5 shrink-0 text-center text-[11px] font-bold font-mono leading-none",
              !statusHex && statusTextClass(entry.statusCode),
            )}
            style={statusHex ? { color: statusHex } : undefined}
          >
            {entry.statusCode}
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className={COMPACT_CONTENT}>
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => {
            onFocusRow(row.key);
            void onSelectEntry(entry);
          }}
        >
          <HugeiconsIcon icon={FileDiffIcon} size={14} strokeWidth={2} />
          Open Diff
        </ContextMenuItem>
        {!isDeleted && onOpenFile && absolutePath ? (
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => onOpenFile(absolutePath, true)}
          >
            <HugeiconsIcon icon={File01Icon} size={14} strokeWidth={2} />
            Open File
          </ContextMenuItem>
        ) : null}
        {!isDeleted && absolutePath ? (
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => void revealInFinder(absolutePath)}
          >
            <HugeiconsIcon icon={FolderOpenIcon} size={14} strokeWidth={2} />
            {revealLabel}
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        {isStaged ? (
          <ContextMenuItem
            className={COMPACT_ITEM}
            disabled={disabled}
            onSelect={() => void onUnstageEntry(entry)}
          >
            <HugeiconsIcon icon={MinusSignIcon} size={14} strokeWidth={2} />
            Unstage
          </ContextMenuItem>
        ) : (
          <>
            <ContextMenuItem
              className={COMPACT_ITEM}
              disabled={disabled}
              onSelect={() => void onStageEntry(entry)}
            >
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
              Stage
            </ContextMenuItem>
            <ContextMenuItem
              className={COMPACT_ITEM}
              disabled={disabled}
              onSelect={() => onDiscardEntry(entry)}
            >
              <HugeiconsIcon icon={RemoveSquareIcon} size={14} strokeWidth={2} />
              Discard
            </ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => void copyToClipboard(entry.path.replace(/\\/g, "/"), "Copied relative path")}
        >
          <HugeiconsIcon icon={Link01Icon} size={14} strokeWidth={2} />
          Copy Relative Path
        </ContextMenuItem>
        {absolutePath ? (
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => void copyToClipboard(absolutePath, "Copied absolute path")}
          >
            <HugeiconsIcon icon={CopySlashIcon} size={14} strokeWidth={2} />
            Copy Absolute Path
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
});

function RemoteActionButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-6 min-w-6 items-center justify-center gap-1 rounded-md px-1.5 text-muted-foreground transition-colors",
        disabled
          ? "cursor-default opacity-40"
          : "hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function IconActionButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      className="size-6 p-3 rounded-md text-muted-foreground hover:text-foreground disabled:cursor-not-allowed"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function CommitFeedback({
  feedback,
  onDismiss,
}: {
  feedback: { tone: "error" | "success"; message: string } | null;
  onDismiss: () => void;
}) {
  const [visibleFeedback, setVisibleFeedback] = useState(feedback);
  const [isVisible, setIsVisible] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!feedback) {
      setIsVisible(false);
      return;
    }
    setVisibleFeedback(feedback);
    setIsVisible(true);
    const hideTimer = window.setTimeout(() => setIsVisible(false), 3600);
    const clearTimer = window.setTimeout(() => {
      setVisibleFeedback((current) =>
        current?.message === feedback.message && current.tone === feedback.tone
          ? null
          : current,
      );
      // Consume the source state so the toast never re-fires when the panel or
      // tab is shown again after it has run its course.
      onDismissRef.current();
    }, 3900);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [feedback]);

  if (!visibleFeedback) return null;

  const isError = visibleFeedback.tone === "error";
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-3 top-[calc(100%-0.25rem)] z-20 flex min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] leading-snug shadow-lg shadow-black/15 backdrop-blur transition-all duration-200",
        isVisible ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
        isError
          ? "border-destructive/30 bg-card/95 text-destructive"
          : "border-border/70 bg-card/95 text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          isError ? "bg-destructive" : "bg-foreground/70",
        )}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          isError ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {visibleFeedback.message}
      </span>
    </div>
  );
}
