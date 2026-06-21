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
import { IS_MAC } from "@/lib/platform";
import { cn } from "@/lib/utils";
import {
  copyToClipboard,
  revealInFinder,
} from "@/modules/explorer/lib/contextActions";
import { fileIconUrl } from "@/modules/explorer/lib/iconResolver";
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
  ArrowUp01Icon,
  CheckmarkCircle01Icon,
  Copy01Icon,
  Download01Icon,
  File01Icon,
  FileDiffIcon,
  Folder01Icon,
  FolderCloudIcon,
  FolderGitTwoIcon,
  FolderOpenIcon,
  GitBranchIcon,
  Link01Icon,
  ListViewIcon,
  MinusSignIcon,
  Refresh01Icon,
  RemoveSquareIcon,
  StructureFolderIcon,
} from "@hugeicons/core-free-icons";
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
import {
  buildScmTree,
  flattenScmTree,
  type ScmDirNode,
} from "./scmTree";

type Props = {
  open: boolean;
  sourceControl: SourceControlSummary;
  onOpenGitGraph?: () => void;
  onOpenDiff: (input: {
    path: string;
    repoRoot: string;
    mode: "+" | "-";
    originalPath: string | null;
    title?: string;
  }) => void;
  onOpenFile?: (absolutePath: string) => void;
};

const SOURCE_CONTROL_TOOLTIP_CLASS =
  "border border-border/70 bg-zinc-950 text-zinc-100 shadow-lg shadow-black/30 dark:border-border/60 dark:bg-zinc-950 dark:text-zinc-100";

const ROW_HEIGHTS = {
  banner: 32,
  header: 30,
  entry: 30,
} as const;

type RowDescriptor =
  | { kind: "banner-diverged"; key: string }
  | { kind: "staged-header"; key: string; count: number }
  | { kind: "staged-entry"; key: string; entry: SourceControlEntry }
  | { kind: "changes-header"; key: string; count: number }
  | { kind: "changes-entry"; key: string; entry: SourceControlEntry }
  | { kind: "tree-dir"; key: string; depth: number; node: ScmDirNode }
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

function upstreamBadgeLabel(upstream: string | null | undefined): string {
  if (!upstream) return "No upstream";
  return upstream;
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

function statusAccentClass(code: string): string {
  switch (code) {
    case "A":
      return "bg-emerald-500/85";
    case "U":
      return "bg-teal-500/85";
    case "M":
      return "bg-amber-500/85";
    case "D":
      return "bg-rose-500/85";
    case "R":
      return "bg-sky-500/85";
    default:
      return "bg-muted-foreground/40";
  }
}


export const SourceControlPanel = memo(function SourceControlPanel({
  open,
  sourceControl,
  onOpenGitGraph,
  onOpenDiff,
  onOpenFile,
}: Props) {
  const scm = useSourceControlPanel(open, sourceControl, onOpenDiff);
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
  const pushStatusLabel = upstreamBadgeLabel(scm.status?.upstream);
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
    void sourceControl.runRemoteAction("fetch");
  }, [sourceControl]);

  const handlePull = useCallback(() => {
    void sourceControl.runRemoteAction("pull");
  }, [sourceControl]);

  const rows = useMemo<RowDescriptor[]>(() => {
    const result: RowDescriptor[] = [];
    if (isDiverged) {
      result.push({ kind: "banner-diverged", key: "banner-diverged" });
    }
    if (scmViewMode === "tree") {
      const tree = buildScmTree([
        ...scm.stagedEntries,
        ...scm.unstagedEntries,
      ]);
      for (const row of flattenScmTree(tree, treeCollapsed)) {
        if (row.type === "dir") {
          result.push({
            kind: "tree-dir",
            key: row.key,
            depth: row.depth,
            node: row.node,
          });
        } else {
          result.push({
            kind: "tree-file",
            key: row.key,
            depth: row.depth,
            entry: row.entry,
          });
        }
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
            const collapsed = treeCollapsed.has(row.node.fullPath);
            const wantCollapse = event.key === "ArrowLeft";
            if (collapsed !== wantCollapse) {
              event.preventDefault();
              toggleTreeDir(row.node.fullPath);
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
              toggleTreeDir(row.node.fullPath);
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

  if (!open) return null;

  const fetchBusy = sourceControl.busyAction === "fetch";
  const pullBusy = sourceControl.busyAction === "pull";

  return (
    <TooltipProvider delayDuration={800} skipDelayDuration={300}>
      <aside className="flex h-full min-w-0 flex-col bg-sidebar [contain:layout_style]">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3 pb-2.5 pt-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-foreground/5 px-2 py-1 text-[11.5px] font-medium leading-none text-foreground transition-colors hover:bg-foreground/10">
              <HugeiconsIcon
                icon={FolderGitTwoIcon}
                size={12}
                strokeWidth={1.9}
                className="shrink-0 text-muted-foreground"
              />
              <span className="max-w-[140px] truncate">{repoLabel}</span>
            </div>
            {scm.status && (scm.status.ahead > 0 || scm.status.behind > 0) ? (
              <div className="flex shrink-0 items-center gap-0.5 text-[10px] font-semibold tabular-nums leading-none text-muted-foreground">
                {scm.status.ahead > 0 ? (
                  <span className="inline-flex items-center gap-0.5 rounded-md border border-border/60 px-1 py-0.5">
                    <HugeiconsIcon
                      icon={ArrowUp01Icon}
                      size={9}
                      strokeWidth={2.2}
                    />
                    {scm.status.ahead}
                  </span>
                ) : null}
                {scm.status.behind > 0 ? (
                  <span className="inline-flex items-center gap-0.5 rounded-md border border-border/60 px-1 py-0.5">
                    <HugeiconsIcon
                      icon={ArrowDown01Icon}
                      size={9}
                      strokeWidth={2.2}
                    />
                    {scm.status.behind}
                  </span>
                ) : null}
              </div>
            ) : null}
            {scm.status?.isDetached ? (
              <span className="rounded bg-muted/55 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                detached
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <IconActionButton
              label={
                scmViewMode === "tree" ? "Show as list" : "Group by directory"
              }
              onClick={() =>
                void setScmViewMode(scmViewMode === "tree" ? "list" : "tree")
              }
              side="bottom"
            >
              <HugeiconsIcon
                icon={scmViewMode === "tree" ? ListViewIcon : StructureFolderIcon}
                size={14}
                strokeWidth={1.85}
              />
            </IconActionButton>
            {scmViewMode === "tree" &&
            scm.panelState === "ready" &&
            !scm.allClean ? (
              <>
                <IconActionButton
                  label="Stage all changes"
                  disabled={
                    scm.unstagedEntries.length === 0 || !!scm.actionBusy
                  }
                  onClick={() => void scm.stageAllEntries()}
                  side="bottom"
                >
                  <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.85} />
                </IconActionButton>
                <IconActionButton
                  label="Unstage all"
                  disabled={scm.stagedEntries.length === 0 || !!scm.actionBusy}
                  onClick={() => void scm.unstageAllEntries()}
                  side="bottom"
                >
                  <HugeiconsIcon
                    icon={MinusSignIcon}
                    size={14}
                    strokeWidth={1.85}
                  />
                </IconActionButton>
                <IconActionButton
                  label="Discard all changes"
                  disabled={
                    scm.unstagedEntries.length === 0 || !!scm.actionBusy
                  }
                  onClick={() => scm.requestDiscardAll()}
                  side="bottom"
                >
                  <HugeiconsIcon
                    icon={RemoveSquareIcon}
                    size={14}
                    strokeWidth={1.85}
                  />
                </IconActionButton>
              </>
            ) : null}
            <IconActionButton
              label={fetchBusy ? "Fetching…" : "Fetch from remote"}
              disabled={!canFetch}
              onClick={handleFetch}
              side="bottom"
            >
              {fetchBusy ? (
                <Spinner className="size-3" />
              ) : (
                <HugeiconsIcon
                  icon={FolderCloudIcon}
                  size={14}
                  strokeWidth={1.85}
                />
              )}
            </IconActionButton>
            <IconActionButton
              label={
                pullBusy
                  ? "Pulling…"
                  : isDiverged
                    ? "Branch diverged — resolve in terminal"
                    : !hasUpstream
                      ? "No upstream configured"
                      : (scm.status?.behind ?? 0) === 0
                        ? "Already up to date"
                        : `Pull ${scm.status?.behind ?? 0} commits (fast-forward)`
              }
              disabled={!canPull}
              onClick={handlePull}
              side="bottom"
            >
              {pullBusy ? (
                <Spinner className="size-3" />
              ) : (
                <HugeiconsIcon
                  icon={Download01Icon}
                  size={14}
                  strokeWidth={1.9}
                />
              )}
            </IconActionButton>
            <IconActionButton
              label="Refresh source control"
              disabled={isRefreshing || !!scm.actionBusy}
              onClick={handleRefresh}
              side="bottom"
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
        </header>

        {onOpenGitGraph ? (
          <button
            type="button"
            onClick={() => onOpenGitGraph()}
            className="group flex shrink-0 items-center gap-2 border-b border-border/40 px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
          >
            <HugeiconsIcon
              icon={GitBranchIcon}
              size={13}
              strokeWidth={1.85}
              className="shrink-0"
            />
            <span className="flex-1 text-[12px] font-medium">Commit Graph</span>
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={12}
              strokeWidth={2}
              className="shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5"
            />
          </button>
        ) : null}

        {scm.panelState === "loading" ? (
          <PanelCenter title="Loading repository" />
        ) : null}

        {scm.panelState === "no-repo" ? (
          <PanelCenter
            title="No repository"
            body="The active workspace is not inside a Git repository."
          />
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

              <div className="grid w-full grid-cols-2 gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="xs"
                      className="h-7 text-[11.5px] font-semibold tracking-tight shadow-sm disabled:cursor-not-allowed disabled:shadow-none"
                      disabled={!canCommit}
                      onClick={() => void scm.commit()}
                    >
                      {scm.actionBusy === "commit" ? "Committing…" : "Commit"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className={cn(
                      SOURCE_CONTROL_TOOLTIP_CLASS,
                      "text-[10.5px]",
                    )}
                  >
                    {commitHint}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="xs"
                      variant="secondary"
                      className="h-7 text-[11.5px] font-medium disabled:cursor-not-allowed"
                      disabled={!scm.canPush || !!scm.actionBusy}
                      onClick={() => void scm.push()}
                    >
                      {scm.actionBusy === "push" ? "Pushing…" : "Push"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className={cn(
                      SOURCE_CONTROL_TOOLTIP_CLASS,
                      "max-w-64 text-[10.5px]",
                    )}
                  >
                    {pushDisabledReason}
                  </TooltipContent>
                </Tooltip>
              </div>

              <CommitFeedback feedback={footerFeedback} />
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
                  className="h-full overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]"
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
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              {scm.pendingDiscard?.scope === "all"
                ? `This will discard ${scm.pendingDiscard.label} and cannot be undone.`
                : scm.pendingDiscard
                  ? `Discard changes in "${scm.pendingDiscard.label}"? This cannot be undone.`
                  : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => scm.cancelPendingDiscard()}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => void scm.confirmPendingDiscard()}>
              Discard
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
  onSelectEntry: (entry: SourceControlEntry) => Promise<void>;
  onStageEntry: (entry: SourceControlEntry) => Promise<void>;
  onUnstageEntry: (entry: SourceControlEntry) => Promise<void>;
  onDiscardEntry: (entry: SourceControlEntry) => void;
  onStageAll: () => Promise<void>;
  onUnstageAll: () => Promise<void>;
  onDiscardAll: () => void;
  onOpenFile?: (absolutePath: string) => void;
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
          side="bottom"
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
          side="bottom"
          onClick={() => onDiscardAll()}
        >
          <HugeiconsIcon icon={RemoveSquareIcon} size={11} strokeWidth={1.9} />
        </IconActionButton>
        <IconActionButton
          label="Stage all changes"
          disabled={actionBusy !== null}
          side="bottom"
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
  treeCollapsed,
  onFocusRow,
  onToggleTreeDir,
}: RowRendererProps & {
  row: Extract<RowDescriptor, { kind: "tree-dir" }>;
}) {
  const node = row.node;
  const collapsed = treeCollapsed.has(node.fullPath);
  return (
    <div
      id={`scm-row-${row.key}`}
      role="button"
      tabIndex={-1}
      data-focused={focused || undefined}
      onMouseDown={() => onFocusRow(row.key)}
      onClick={() => onToggleTreeDir(node.fullPath)}
      style={{ paddingLeft: 8 + row.depth * 12 }}
      className={cn(
        "group flex h-[30px] select-none items-center gap-1.5 rounded-md pr-2 transition-colors",
        focused ? "bg-accent/60" : "hover:bg-accent/30",
      )}
    >
      <HugeiconsIcon
        icon={collapsed ? ArrowRight01Icon : ArrowDown01Icon}
        size={10}
        strokeWidth={2.3}
        className="shrink-0 text-muted-foreground"
      />
      <HugeiconsIcon
        icon={collapsed ? Folder01Icon : FolderOpenIcon}
        size={13}
        strokeWidth={1.85}
        className="shrink-0 text-muted-foreground/80"
      />
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground/90">
        {node.name}
      </span>
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/55">
        {node.fileCount}
      </span>
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
  const previewOnClick = usePreferencesStore((s) => s.editorPreviewOnClick);
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
          style={{ paddingLeft: 8 + depth * 12 }}
          className={cn(
            "group relative flex h-[30px] items-center gap-2 rounded-md pr-2 transition-all duration-100",
            focused
              ? "bg-accent/60"
              : isSelected
                ? "bg-accent/55 text-foreground"
                : "hover:bg-accent/30",
          )}
        >
          <span
            className={cn(
              "pointer-events-none absolute inset-y-1 left-0 w-[2px] rounded-full transition-opacity",
              statusHex ? undefined : statusAccentClass(entry.statusCode),
              isSelected || focused
                ? "opacity-100"
                : "opacity-55 group-hover:opacity-95",
            )}
            style={statusHex ? { backgroundColor: statusHex } : undefined}
            aria-hidden
          />
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
                  "truncate text-[12px] leading-tight",
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
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-data-[focused=true]:opacity-100 group-data-[selected=true]:opacity-100">
            {isStaged ? (
              <IconActionButton
                label={`Unstage ${entry.path}`}
                disabled={disabled}
                side="top"
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
                  side="top"
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
                  side="top"
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
            onSelect={() => onOpenFile(absolutePath)}
          >
            <HugeiconsIcon icon={File01Icon} size={14} strokeWidth={2} />
            Open File
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
          onSelect={() => void copyToClipboard(entry.path.replace(/\\/g, "/"))}
        >
          <HugeiconsIcon icon={Link01Icon} size={14} strokeWidth={2} />
          Copy Relative Path
        </ContextMenuItem>
        {absolutePath ? (
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => void copyToClipboard(absolutePath)}
          >
            <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={2} />
            Copy Absolute Path
          </ContextMenuItem>
        ) : null}
        {!isDeleted && absolutePath ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              className={COMPACT_ITEM}
              onSelect={() => void revealInFinder(absolutePath)}
            >
              <HugeiconsIcon icon={FolderOpenIcon} size={14} strokeWidth={2} />
              {revealLabel}
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
});

function IconActionButton({
  label,
  disabled,
  side = "left",
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  side?: "left" | "top" | "right" | "bottom";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-6 p-3 rounded-md text-muted-foreground hover:text-foreground disabled:cursor-not-allowed"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        className={cn(SOURCE_CONTROL_TOOLTIP_CLASS, "text-[10.5px]")}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function CommitFeedback({
  feedback,
}: {
  feedback: { tone: "error" | "success"; message: string } | null;
}) {
  const [visibleFeedback, setVisibleFeedback] = useState(feedback);
  const [isVisible, setIsVisible] = useState(false);

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
