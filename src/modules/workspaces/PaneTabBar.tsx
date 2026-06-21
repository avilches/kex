import { useDraggable, useDroppable, useDndMonitor } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { panelIcon, panelTitle } from "./lib/panelTitle";
import type { Panel } from "./lib/types";
import { usePreferencesStore } from "@/modules/settings/preferences";
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { subscribeToRunningCommands, getRunningCommandsSnapshot } from "./lib/terminalEphemeralStore";
import { subscribe as subscribeOscTitles, getSnapshot as getOscTitlesSnapshot } from "@/modules/terminal/lib/oscTitleStore";
import { subscribeLockFlash, getLockFlashSnapshot } from "./lib/lockFlashStore";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { getShortcutLabel } from "@/modules/shortcuts/shortcuts";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useTabRenameStore } from "./lib/tabRenameStore";
import { useFileRenameStore } from "./lib/fileRenameStore";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { AgentSession } from "@/modules/agents/lib/types";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, ArrowReloadHorizontalIcon, BrowserIcon, Cancel01Icon, CancelCircleIcon, CancelSquareIcon, ComputerTerminal01Icon, Copy01Icon, CrosshairIcon, LayoutBottomIcon, LayoutRightIcon, LinkSquare02Icon, LockKeyIcon, PencilEdit01Icon, SquareUnlock02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { pathBasename, pathDirname } from "@/lib/pathUtils";
import { panelFilePath } from "./lib/panelPath";
import { native } from "@/lib/native";
import type { GitStatusSnapshot } from "@/lib/native";
import type { GitColorScheme } from "@/modules/settings/store";
import { buildGitStatusMap, lookupGitStatus, type GitStatusCode } from "@/modules/explorer/lib/gitStatusUtils";
import { gitStatusHexColor } from "@/modules/explorer/lib/gitStatusColor";

function HoverTable({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1.5 text-[12px]">
      {children}
    </div>
  );
}

function HoverRow({
  label,
  value,
  copy,
  action,
  valueClassName,
  valueSuffix,
}: {
  label: string;
  value: string;
  copy?: string;
  action?: { icon: ReactNode; label: string; onClick: () => void };
  valueClassName?: string;
  valueSuffix?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <>
      <span className="whitespace-nowrap text-muted-foreground">{label}</span>
      <span className="group/row flex min-w-0 items-start gap-1">
        <span className={cn("min-w-0 break-words", valueClassName ?? "text-foreground")}>
          {value}
          {valueSuffix}
        </span>
        {copy !== undefined && (
          <button
            type="button"
            title={`Copy ${label.toLowerCase()}`}
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard
                .writeText(copy)
                .then(() => setCopied(true))
                .catch(() => {});
            }}
            className="flex size-[20px] shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition group-hover/row:opacity-100 hover:text-foreground"
          >
            <HugeiconsIcon
              icon={copied ? Tick02Icon : Copy01Icon}
              size={14}
              strokeWidth={1.9}
            />
          </button>
        )}
        {action && (
          <button
            type="button"
            title={action.label}
            onClick={(e) => {
              e.stopPropagation();
              action.onClick();
            }}
            className="flex size-[20px] shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition group-hover/row:opacity-100 hover:text-foreground"
          >
            {action.icon}
          </button>
        )}
      </span>
    </>
  );
}

function FilePathLines({
  absPath,
  repoRoot,
  repoRel,
  onRename,
  isRenaming,
  fileRenameRef,
  onRenameCommit,
  onRenameCancel,
  children,
}: {
  absPath: string;
  repoRoot: string | null;
  repoRel: string | null;
  onRename?: () => void;
  isRenaming?: boolean;
  fileRenameRef?: React.Ref<HTMLInputElement>;
  onRenameCommit?: () => void;
  onRenameCancel?: () => void;
  children?: ReactNode;
}) {
  const filename = pathBasename(absPath);
  return (
    <HoverTable>
      {isRenaming ? (
        <>
          <span className="whitespace-nowrap text-muted-foreground">Rename file</span>
          <input
            ref={fileRenameRef}
            autoFocus
            defaultValue={filename}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onRenameCommit?.(); }
              if (e.key === "Escape") { e.preventDefault(); onRenameCancel?.(); }
            }}
            onBlur={() => onRenameCancel?.()}
            onPointerDown={(e) => e.stopPropagation()}
            className="min-w-0 rounded border border-input bg-transparent px-1.5 py-0.5 text-[12px] font-medium text-foreground outline-none focus:border-ring"
          />
        </>
      ) : (
        <HoverRow
          label="File name"
          value={filename}
          copy={filename}
          valueClassName="font-medium text-foreground"
          action={
            onRename
              ? {
                  icon: <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={1.9} />,
                  label: "Rename file",
                  onClick: onRename,
                }
              : undefined
          }
        />
      )}
      {repoRoot && <HoverRow label="Repo root" value={repoRoot} copy={repoRoot} />}
      {repoRel && <HoverRow label="Relative to repo" value={repoRel} copy={repoRel} />}
      <HoverRow label="Absolute path" value={absPath} copy={absPath} />
      {children}
    </HoverTable>
  );
}

function useGitRepoRoot(dir: string | undefined): string | null {
  const [root, setRoot] = useState<string | null>(null);

  useEffect(() => {
    if (!dir) {
      setRoot(null);
      return;
    }
    let cancelled = false;
    setRoot(null);
    native
      .gitResolveRepo(dir)
      .then((info) => {
        if (cancelled || !info) return;
        setRoot(info.repoRoot.replace(/\\/g, "/").replace(/\/$/, ""));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dir]);

  return root;
}

function EditorHoverContent({
  absPath,
  panelLocked,
  lockShortcut,
  onLockToggle,
  onRename,
  isRenaming,
  fileRenameRef,
  onRenameCommit,
  onRenameCancel,
}: {
  absPath: string;
  panelLocked?: boolean;
  lockShortcut?: string | null;
  onLockToggle?: () => void;
  onRename?: () => void;
  isRenaming?: boolean;
  fileRenameRef?: React.Ref<HTMLInputElement>;
  onRenameCommit?: () => void;
  onRenameCancel?: () => void;
}) {
  const root = useGitRepoRoot(pathDirname(absPath));
  const abs = absPath.replace(/\\/g, "/");
  const repoRel =
    root && abs !== root && abs.startsWith(`${root}/`)
      ? abs.slice(root.length + 1)
      : null;

  return (
    <div className="space-y-1.5 text-[12px]">
      <FilePathLines
        absPath={absPath}
        repoRoot={root}
        repoRel={repoRel}
        onRename={onRename}
        isRenaming={isRenaming}
        fileRenameRef={fileRenameRef}
        onRenameCommit={onRenameCommit}
        onRenameCancel={onRenameCancel}
      />
      {onLockToggle !== undefined && (
        <div className="mt-1.5 border-t border-border/40 pt-1.5">
          <label className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-accent">
            <input
              type="checkbox"
              className="size-3 accent-primary"
              checked={panelLocked ?? false}
              onChange={onLockToggle}
            />
            <span className="text-muted-foreground">Lock tab (prevent close)</span>
            {lockShortcut && (
              <span className="ml-auto shrink-0 text-[12px] text-muted-foreground/60">
                {lockShortcut}
              </span>
            )}
          </label>
        </div>
      )}
    </div>
  );
}

function GitFileHoverContent({
  repoRoot,
  path,
  originalPath,
  sha,
}: {
  repoRoot: string;
  path: string;
  originalPath: string | null;
  sha?: string;
}) {
  const root = repoRoot.replace(/\\/g, "/").replace(/\/$/, "");
  const absPath = `${root}/${path}`;
  return (
    <FilePathLines absPath={absPath} repoRoot={root} repoRel={path}>
      {originalPath && originalPath !== path && (
        <HoverRow label="Renamed" value={originalPath} copy={originalPath} />
      )}
      {sha && (
        <HoverRow
          label="Commit"
          value={sha.slice(0, 8)}
          copy={sha}
          valueClassName="font-mono text-foreground"
        />
      )}
    </FilePathLines>
  );
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function AgentHoverCardContent({
  agentSession,
  cwd,
  tabTitle,
  panelRestoreOnRestart,
  onUpdatePanel,
}: {
  agentSession: AgentSession;
  cwd: string | undefined;
  tabTitle: string;
  panelRestoreOnRestart: boolean;
  onUpdatePanel: (updater: (p: Panel) => Panel) => void;
}) {
  const elapsed = formatElapsed(Date.now() - agentSession.startedAt);
  const sessionId = agentSession.meta?.sessionId;
  const directory = cwd ?? agentSession.meta?.cwdLaunch;
  const repoRoot = useGitRepoRoot(directory);
  const transcriptPath = agentSession.meta?.transcriptPath;
  const [transcriptExists, setTranscriptExists] = useState<boolean | null>(null);

  useEffect(() => {
    if (!transcriptPath) {
      setTranscriptExists(null);
      return;
    }
    let cancelled = false;
    setTranscriptExists(null);
    native
      .fsStat(transcriptPath)
      .then(() => { if (!cancelled) setTranscriptExists(true); })
      .catch(() => { if (!cancelled) setTranscriptExists(false); });
    return () => { cancelled = true; };
  }, [transcriptPath]);

  return (
    <div className="space-y-1.5 text-[12px]">
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-foreground">{tabTitle}</span>
        {agentSession.status === "working" ? (
          <span className="size-[7px] shrink-0 animate-spin rounded-full border border-transparent border-t-foreground/70" />
        ) : agentSession.status === "waiting" ? (
          <span className="inline-block size-[6px] shrink-0 rounded-full bg-amber-400" />
        ) : null}
      </div>
      <HoverTable>
        {directory && <HoverRow label="Path" value={directory} copy={directory} />}
        {repoRoot && <HoverRow label="Repo root" value={repoRoot} copy={repoRoot} />}
        {sessionId && (
          <HoverRow label="Session" value={sessionId} copy={sessionId} valueClassName="font-mono text-foreground" />
        )}
        {transcriptPath && (
          <HoverRow
            label="Transcript"
            value={transcriptPath}
            copy={transcriptPath}
            valueClassName="font-mono text-foreground"
            valueSuffix={
              transcriptExists === false ? (
                <span className="ml-1.5 font-sans text-muted-foreground">not created yet</span>
              ) : undefined
            }
          />
        )}
        <HoverRow label="Started" value={`${elapsed} ago`} />
      </HoverTable>
      {agentSession.restoreError && (
        <div className="break-words text-destructive">
          {agentSession.restoreErrorReason ?? "unknown error"}
        </div>
      )}
      <div className="mt-1.5 border-t border-border/40 pt-1.5">
        <label className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-accent">
          <input
            type="checkbox"
            className="size-3 accent-primary"
            checked={panelRestoreOnRestart}
            onChange={(e) => {
              const checked = e.target.checked;
              onUpdatePanel((p) => ({ ...p, restoreOnRestart: checked }));
            }}
          />
          <span className="text-muted-foreground">Run on start</span>
        </label>
      </div>
    </div>
  );
}

function TerminalHoverCardContent({
  customTitle,
  cwd,
  runningCommand,
  panelLocked,
  panelRestoreOnRestart,
  panelPersistentCommand,
  lockShortcut,
  onUpdatePanel,
}: {
  customTitle: string | undefined;
  cwd: string | undefined;
  runningCommand: string | null;
  panelLocked: boolean;
  panelRestoreOnRestart: boolean;
  panelPersistentCommand: string | undefined;
  lockShortcut: string | null;
  onUpdatePanel: (updater: (p: Panel) => Panel) => void;
}) {
  const repoRoot = useGitRepoRoot(cwd);
  return (
    <div className="space-y-1.5 text-[12px]">
      {customTitle && (
        <div className="font-medium text-foreground">{customTitle}</div>
      )}
      <HoverTable>
        {cwd && <HoverRow label="Path" value={cwd} copy={cwd} />}
        {repoRoot && <HoverRow label="Repo root" value={repoRoot} copy={repoRoot} />}
        {runningCommand && (
          <HoverRow label="Running" value={runningCommand} valueClassName="font-mono text-foreground" />
        )}
      </HoverTable>
      <div className="mt-1.5 space-y-1 border-t border-border/40 pt-1.5">
        <label className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-accent">
          <input
            type="checkbox"
            className="size-3 accent-primary"
            checked={panelRestoreOnRestart}
            onChange={(e) => {
              const checked = e.target.checked;
              onUpdatePanel((p) => ({
                ...p,
                restoreOnRestart: checked,
                persistentCommand: checked
                  ? (panelPersistentCommand ?? runningCommand ?? "")
                  : undefined,
              }));
            }}
          />
          <span className="text-muted-foreground">Run on start</span>
        </label>
        {panelRestoreOnRestart && (
          <input
            type="text"
            placeholder="command to run (e.g. lazygit)"
            defaultValue={panelPersistentCommand ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              onUpdatePanel((p) => ({ ...p, persistentCommand: v || undefined }));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              e.stopPropagation();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="h-6 w-full rounded border border-border/60 bg-background px-1.5 text-[11px] text-foreground outline-none focus:border-primary"
          />
        )}
        <label className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-accent">
          <input
            type="checkbox"
            className="size-3 accent-primary"
            checked={panelLocked}
            onChange={(e) => {
              onUpdatePanel((p) => ({ ...p, locked: e.target.checked }));
            }}
          />
          <span className="text-muted-foreground">Lock tab (prevent close)</span>
          {lockShortcut && (
            <span className="ml-auto shrink-0 text-[12px] text-muted-foreground/60">
              {lockShortcut}
            </span>
          )}
        </label>
      </div>
    </div>
  );
}

type Props = {
  panels: Panel[];
  activePanelId: string | null;
  paneFocused: boolean;
  workspaceId: string;
  isWorkspaceActive: boolean;
  onActivate: (panelId: string) => void;
  onClose: (panelId: string) => void;
  onNewTerminal: () => void;
  onCloseOtherPanels: (panelId: string) => void;
  onCloseAllPanels: () => void;
  onSplitTerminalRight: () => void;
  onSplitTerminalDown: () => void;
  onNewBrowser: () => void;
  onSplitBrowserRight: () => void;
  onSplitBrowserDown: () => void;
  onDetachAgent: (panelId: string) => void;
  onRenamePanel?: (panelId: string, title: string | undefined) => void;
  onUpdatePanel?: (panelId: string, updater: (p: Panel) => Panel) => void;
  onRenameFile?: (panelId: string, newName: string) => void;
  onFocusOnExplorer?: (filePath: string) => void;
  gitStatus?: GitStatusSnapshot | null;
  gitColorScheme?: GitColorScheme;
};

function DraggableTab({
  panel,
  activePanelId,
  paneFocused,
  workspaceId,
  isWorkspaceActive,
  insertionBefore,
  insertionAfter,
  panelsCount,
  onActivate,
  onClose,
  onCloseOtherPanels,
  onCloseAllPanels,
  onNewTerminal,
  onSplitTerminalRight,
  onSplitTerminalDown,
  onNewBrowser,
  onSplitBrowserRight,
  onSplitBrowserDown,
  onDetachAgent,
  shortcutLabels,
  onRenamePanel,
  onUpdatePanel,
  onRenameFile,
  onFocusOnExplorer,
  onHoverChange,
  onSnapIntoView,
  closeHoverToken,
  gitStatusMap,
  gitStatus,
  gitColorScheme,
}: {
  panel: Panel;
  activePanelId: string | null;
  paneFocused: boolean;
  workspaceId: string;
  isWorkspaceActive: boolean;
  insertionBefore: boolean;
  insertionAfter: boolean;
  panelsCount: number;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onCloseOtherPanels: (panelId: string) => void;
  onCloseAllPanels: () => void;
  onNewTerminal: () => void;
  onSplitTerminalRight: () => void;
  onSplitTerminalDown: () => void;
  onNewBrowser: () => void;
  onSplitBrowserRight: () => void;
  onSplitBrowserDown: () => void;
  onDetachAgent: (panelId: string) => void;
  shortcutLabels: Record<string, string | null>;
  onRenamePanel?: (panelId: string, title: string | undefined) => void;
  onUpdatePanel?: (panelId: string, updater: (p: Panel) => Panel) => void;
  onRenameFile?: (panelId: string, newName: string) => void;
  onFocusOnExplorer?: (filePath: string) => void;
  onHoverChange?: (panelId: string, open: boolean) => void;
  onSnapIntoView?: (panelId: string) => void;
  closeHoverToken: number;
  gitStatusMap?: Map<string, GitStatusCode> | null;
  gitStatus?: GitStatusSnapshot | null;
  gitColorScheme?: GitColorScheme;
}) {
  const { attributes, listeners, setNodeRef, isDragging: isThisDragging } = useDraggable({ id: panel.id });
  const wrappedListeners = useMemo(() => ({
    ...listeners,
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      // Scroll tab into view before dnd-kit captures the element rect.
      e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
      listeners?.onPointerDown?.(e as React.PointerEvent);
    },
  }), [listeners]);
  const { setNodeRef: setBeforeRef } = useDroppable({ id: `tab-insert:${panel.id}:before`, disabled: !isWorkspaceActive });
  const { setNodeRef: setAfterRef } = useDroppable({ id: `tab-insert:${panel.id}:after`, disabled: !isWorkspaceActive });
  const active = panel.id === activePanelId;
  const isLockable = panel.kind === "terminal" || panel.kind === "editor";
  const isLocked = (panel.kind === "terminal" || panel.kind === "editor") && (panel.locked ?? false);
  const focusFilePath = panelFilePath(panel);
  const focusTarget =
    focusFilePath ?? (panel.kind === "terminal" ? (panel.cwd ?? null) : null);
  const focusIsFolder = focusFilePath === null;
  const runningCommandMap = useSyncExternalStore(subscribeToRunningCommands, getRunningCommandsSnapshot);
  const runningCommand = panel.kind === "terminal" ? (runningCommandMap.get(panel.id) ?? null) : null;
  const oscTitleMap = useSyncExternalStore(subscribeOscTitles, getOscTitlesSnapshot);
  const oscTitle = panel.kind === "terminal" ? oscTitleMap.get(panel.id) : undefined;
  const title = panelTitle(panel, runningCommand, oscTitle);
  const tabBarStyle = usePreferencesStore((s) => s.tabBarStyle);
  const connected = tabBarStyle === "connected";
  const editorAutoSave = usePreferencesStore((s) => s.editorAutoSave);
  const agentSession = useAgentStore((s) => s.sessions[panel.id]);
  const hasAgent = agentSession !== undefined;
  const isRestoreError = agentSession?.restoreError ?? false;

  const tabColor = useMemo(() => {
    if (panel.kind !== "editor" || !gitStatusMap || !gitStatus) return null;
    const code = lookupGitStatus(gitStatusMap, gitStatus.repoRoot, panel.path);
    return code ? gitStatusHexColor(code, gitColorScheme ?? "vscode") : null;
  }, [panel, gitStatusMap, gitStatus, gitColorScheme]);

  const agentTitle = (() => {
    if (!hasAgent || panel.kind !== "terminal") return title;
    if (panel.title) return panel.title;
    if (oscTitle) return oscTitle;
    const agentName = agentSession!.agent;
    const cwd = panel.cwd ?? "";
    const dirname = cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd;
    return `${agentName} · ${dirname || title}`;
  })();

  // Descriptions (ai-title, user rename): left-align, CSS ellipsis truncates on the right.
  // Paths (cwd segments): truncate from the left so the deepest directory stays visible.
  const isDescription = !!(panel.title || oscTitle);
  const displayTitle = isDescription
    ? agentTitle
    : agentTitle.length > 28
      ? '…' + agentTitle.slice(-27)
      : agentTitle;

  const isRenaming = useTabRenameStore((s) => s.renamingPanelId === panel.id);
  const anyRenaming = useTabRenameStore((s) => s.renamingPanelId !== null);
  const clearRename = useTabRenameStore((s) => s.clearRename);
  const startRename = useTabRenameStore((s) => s.startRename);
  const inputRef = useRef<HTMLInputElement>(null);
  const handledRef = useRef(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [isFileRenaming, setIsFileRenaming] = useState(false);
  const lockFlashSnap = useSyncExternalStore(subscribeLockFlash, getLockFlashSnapshot);
  const [lockFlashActive, setLockFlashActive] = useState(false);
  const lockFlashSeqRef = useRef(0);

  useEffect(() => {
    if (lockFlashSnap.panelId !== panel.id) return;
    if (lockFlashSnap.seq === lockFlashSeqRef.current) return;
    lockFlashSeqRef.current = lockFlashSnap.seq;
    setLockFlashActive(true);
    const t1 = setTimeout(() => setLockFlashActive(false), 120);
    const t2 = setTimeout(() => setLockFlashActive(true), 220);
    const t3 = setTimeout(() => setLockFlashActive(false), 340);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [lockFlashSnap, panel.id]);
  const fileRenameInputRef = useRef<HTMLInputElement>(null);
  // Keep the hover card open while the pointer is still over the tab. Clicking a
  // tab moves focus into the terminal, which blurs the dnd-kit-focusable trigger
  // and would otherwise dismiss the card mid-hover.
  const pointerInsideRef = useRef(false);
  const contextMenuOpenRef = useRef(false);

  useEffect(() => {
    if (isRenaming) handledRef.current = false;
  }, [isRenaming]);

  useEffect(() => {
    if (!anyRenaming || isFileRenaming) return;
    setHoverOpen(false);
    onHoverChange?.(panel.id, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyRenaming]);

  // Force-close the hover when the tab bar is scrolled (bumped by the parent).
  useEffect(() => {
    if (closeHoverToken === 0) return;
    setHoverOpen(false);
    onHoverChange?.(panel.id, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeHoverToken]);

  // Open hover + start inline file rename when triggered via F2 shortcut
  const triggerPanelId = useFileRenameStore((s) => s.triggerPanelId);
  useEffect(() => {
    if (triggerPanelId !== panel.id) return;
    useFileRenameStore.getState().clearTrigger();
    if (panel.kind !== "editor" && panel.kind !== "markdown") return;
    setHoverOpen(true);
    setIsFileRenaming(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerPanelId]);

  function handleSave() {
    if (handledRef.current) return;
    handledRef.current = true;
    const value = inputRef.current?.value.trim() ?? "";
    onRenamePanel?.(panel.id, value || undefined);
    clearRename();
  }

  function handleCancel() {
    if (handledRef.current) return;
    handledRef.current = true;
    clearRename();
  }

  function handleRenameFromHover() {
    setIsFileRenaming(true);
  }

  function commitFileRename() {
    const value = fileRenameInputRef.current?.value.trim() ?? "";
    const currentName = "path" in panel ? pathBasename((panel as { path: string }).path) : "";
    setIsFileRenaming(false);
    setHoverOpen(false);
    onHoverChange?.(panel.id, false);
    if (value && value !== currentName) {
      onRenameFile?.(panel.id, value);
    }
  }

  function cancelFileRename() {
    setIsFileRenaming(false);
    if (!pointerInsideRef.current) {
      setHoverOpen(false);
      onHoverChange?.(panel.id, false);
    }
  }

  const hoverBody: ReactNode = (() => {
    switch (panel.kind) {
      case "terminal":
        if (isRestoreError) return null;
        return hasAgent
          ? <AgentHoverCardContent
              agentSession={agentSession!}
              cwd={panel.cwd}
              tabTitle={agentTitle}
              panelRestoreOnRestart={panel.restoreOnRestart !== false}
              onUpdatePanel={(updater) => onUpdatePanel?.(panel.id, updater)}
            />
          : <TerminalHoverCardContent
              customTitle={panel.title}
              cwd={panel.cwd}
              runningCommand={runningCommand}
              panelLocked={panel.locked ?? false}
              panelRestoreOnRestart={panel.restoreOnRestart ?? false}
              panelPersistentCommand={panel.persistentCommand}
              lockShortcut={shortcutLabels["tab.lock"]}
              onUpdatePanel={(updater) => onUpdatePanel?.(panel.id, updater)}
            />;
      case "editor":
        return (
          <EditorHoverContent
            absPath={panel.path}
            panelLocked={panel.locked ?? false}
            lockShortcut={shortcutLabels["tab.lock"]}
            onLockToggle={() => onUpdatePanel?.(panel.id, (p) => {
              const newLocked = !(panel.locked ?? false);
              return { ...p, locked: newLocked, ...(newLocked && p.kind === "editor" ? { preview: false } : {}) };
            })}
            onRename={isFileRenaming ? undefined : handleRenameFromHover}
            isRenaming={isFileRenaming}
            fileRenameRef={fileRenameInputRef}
            onRenameCommit={commitFileRename}
            onRenameCancel={cancelFileRename}
          />
        );
      case "markdown":
        return (
          <EditorHoverContent
            absPath={panel.path}
            onRename={isFileRenaming ? undefined : handleRenameFromHover}
            isRenaming={isFileRenaming}
            fileRenameRef={fileRenameInputRef}
            onRenameCommit={commitFileRename}
            onRenameCancel={cancelFileRename}
          />
        );
      case "git-diff":
        return <GitFileHoverContent repoRoot={panel.repoRoot} path={panel.path} originalPath={panel.originalPath} />;
      case "git-commit-file":
        return <GitFileHoverContent repoRoot={panel.repoRoot} path={panel.path} originalPath={panel.originalPath} sha={panel.sha} />;
      case "git-history":
        return (
          <HoverTable>
            <HoverRow label="Repo root" value={panel.repoRoot} copy={panel.repoRoot} />
          </HoverTable>
        );
      case "browser":
        return panel.url
          ? <HoverTable><HoverRow label="URL" value={panel.url} copy={panel.url} /></HoverTable>
          : null;
      default:
        return null;
    }
  })();

  const tabDiv = (
    <div
      ref={setNodeRef}
      {...attributes}
      data-panel-id={panel.id}
      onPointerEnter={() => { pointerInsideRef.current = true; }}
      onPointerLeave={() => { pointerInsideRef.current = false; }}
      onClick={() => onActivate(panel.id)}
      onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
      onAuxClick={(e) => { if (e.button === 1) { e.stopPropagation(); onClose(panel.id); } }}
      onContextMenu={(e) => { if (anyRenaming || isFileRenaming) e.preventDefault(); }}
      {...wrappedListeners}
      className={cn(
        "group relative flex max-w-[320px] shrink-0 select-none touch-none items-center gap-1 px-1.5 text-[11px] transition-colors",
        isThisDragging ? "cursor-grabbing" : "cursor-default",
        connected
          ? [
              "self-stretch border-r border-border/30",
              active
                ? "bg-background text-foreground"
                : "border-b border-border/60 bg-muted/35 text-muted-foreground hover:bg-muted/55 hover:text-foreground",
            ]
          : [
              "h-5 rounded",
              active
                ? "bg-card text-foreground"
                : "bg-muted/35 text-muted-foreground hover:bg-muted/55 hover:text-foreground",
            ],
        isThisDragging && "opacity-40",
      )}
    >
      {/* Droppable half-zones - coordinates-based, no pointer events needed */}
      <div ref={setBeforeRef} className="pointer-events-none absolute inset-y-0 left-0 w-1/2" />
      <div ref={setAfterRef} className="pointer-events-none absolute inset-y-0 right-0 w-1/2" />

      {insertionBefore && (
        <div className="pointer-events-none absolute inset-y-1 left-0 z-20 w-0.5 rounded-full bg-tab-focus-indicator" />
      )}
      {insertionAfter && (
        <div className="pointer-events-none absolute inset-y-1 right-0 z-20 w-0.5 rounded-full bg-tab-focus-indicator" />
      )}

      {active && paneFocused && (
        <div
          className={cn("absolute inset-x-0 top-0 bg-tab-focus-indicator", connected ? "h-[1.5px]" : "h-0.5 rounded-t")}
        />
      )}
      <span className={cn("shrink-0", hasAgent ? "opacity-100" : "opacity-70")}>
        {hasAgent
          ? isRestoreError
            ? <span className="text-amber-500" title={`Session restore failed: ${agentSession!.restoreErrorReason ?? "unknown error"}`}>
                <HugeiconsIcon icon={Alert02Icon} size={12} strokeWidth={1.5} />
              </span>
            : <AgentIcon agent={agentSession!.agent} size={12} />
          : panel.kind === "browser" && panel.floating
            ? <HugeiconsIcon icon={LinkSquare02Icon} size={12} strokeWidth={1.75} className="opacity-60" />
            : panelIcon(panel, workspaceId)}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap",
          !isDescription && panel.kind === "terminal" && !!runningCommand && "text-center",
          isRestoreError && "text-destructive/70",
          panel.kind === "editor" && panel.preview && "italic",
        )}
        style={tabColor && !isRestoreError ? { color: tabColor } : undefined}
      >
        {displayTitle}
      </span>
      {panel.kind === "editor" && panel.dirty && !editorAutoSave && (
        <span className="shrink-0 text-[8px] text-primary">●</span>
      )}
      {hasAgent && (
        isRestoreError ? (
          <span className="ml-0.5 inline-block size-[6px] shrink-0 rounded-full bg-destructive" />
        ) : agentSession?.status === "working" ? (
          <span className="ml-0.5 size-[8px] shrink-0 animate-spin rounded-full border border-transparent border-t-foreground/70" />
        ) : agentSession?.status === "waiting" ? (
          <span className="ml-0.5 inline-block size-[6px] shrink-0 rounded-full bg-amber-400" />
        ) : null
      )}
      {isLocked ? (
        <button
          type="button"
          className={cn(
            "ml-0.5 flex size-[16px] shrink-0 items-center justify-center rounded hover:bg-muted",
            lockFlashActive
              ? "scale-125 text-amber-400 transition-[color,transform] duration-300"
              : "text-foreground transition-colors",
          )}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onUpdatePanel?.(panel.id, (p) => ({ ...p, locked: false }));
          }}
          title="Unlock tab"
        >
          <HugeiconsIcon icon={LockKeyIcon} size={13} strokeWidth={2} />
        </button>
      ) : (
        <button
          type="button"
          className="ml-0.5 flex size-[16px] shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100 hover:bg-muted"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose(panel.id);
          }}
          title="Close panel"
        >
          <span className="text-[13px] leading-none">×</span>
        </button>
      )}
    </div>
  );

  return (
    <HoverCard
      open={hoverOpen}
      openDelay={700}
      closeDelay={100}
      onOpenChange={(o) => {
        if (o && (anyRenaming || contextMenuOpenRef.current)) return;
        if (!o && (pointerInsideRef.current || isFileRenaming)) return;
        setHoverOpen(o);
        onHoverChange?.(panel.id, o);
        if (o) onSnapIntoView?.(panel.id);
      }}
    >
    <Popover
      open={isRenaming}
      onOpenChange={(open) => { if (!open) handleSave(); }}
    >
      <ContextMenu onOpenChange={(o) => {
          contextMenuOpenRef.current = o;
          if (o) {
            setHoverOpen(false);
            onHoverChange?.(panel.id, false);
            onSnapIntoView?.(panel.id);
          }
        }}>
        <ContextMenuTrigger asChild>
          <PopoverAnchor asChild>
            <HoverCardTrigger asChild>
              {tabDiv}
            </HoverCardTrigger>
          </PopoverAnchor>
        </ContextMenuTrigger>
        <ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
            {onFocusOnExplorer && focusTarget && (
              <>
                <ContextMenuItem onSelect={() => onFocusOnExplorer(focusTarget)}>
                  <HugeiconsIcon icon={CrosshairIcon} size={14} strokeWidth={2} />
                  {focusIsFolder
                    ? "Focus Folder on Explorer"
                    : "Focus File on Explorer"}
                  {shortcutLabels["tab.focusOnExplorer"] && (
                    <ContextMenuShortcut>
                      {shortcutLabels["tab.focusOnExplorer"]}
                    </ContextMenuShortcut>
                  )}
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            )}
            {onRenamePanel && (
              <>
                <ContextMenuItem onSelect={() => startRename(panel.id)}>
                  <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={2} />
                  Rename Tab
                  {shortcutLabels["tab.rename"] && (
                    <ContextMenuShortcut>{shortcutLabels["tab.rename"]}</ContextMenuShortcut>
                  )}
                </ContextMenuItem>
                {panel.title && (
                  <ContextMenuItem onSelect={() => onRenamePanel(panel.id, undefined)}>
                    <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={14} strokeWidth={2} />
                    Reset Tab Name
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator />
              </>
            )}
            {isLockable && (
              <ContextMenuItem
                onSelect={() => onUpdatePanel?.(panel.id, (p) => {
                  const newLocked = !isLocked;
                  return { ...p, locked: newLocked, ...(newLocked && p.kind === "editor" ? { preview: false } : {}) };
                })}
              >
                <HugeiconsIcon icon={isLocked ? SquareUnlock02Icon : LockKeyIcon} size={14} strokeWidth={2} />
                {isLocked ? "Unlock Tab" : "Lock Tab"}
                {shortcutLabels["tab.lock"] && (
                  <ContextMenuShortcut>{shortcutLabels["tab.lock"]}</ContextMenuShortcut>
                )}
              </ContextMenuItem>
            )}
            <ContextMenuItem disabled={isLocked} onSelect={() => onClose(panel.id)}>
              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
              Close Tab
              {!isLocked && shortcutLabels["tab.close"] && (
                <ContextMenuShortcut>{shortcutLabels["tab.close"]}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
            <ContextMenuItem
              disabled={panelsCount <= 1}
              onSelect={() => onCloseOtherPanels(panel.id)}
            >
              <HugeiconsIcon icon={CancelCircleIcon} size={14} strokeWidth={2} />
              Close Other Tabs
            </ContextMenuItem>
            <ContextMenuItem disabled={isLocked} onSelect={onCloseAllPanels}>
              <HugeiconsIcon icon={CancelSquareIcon} size={14} strokeWidth={2} />
              Close All Tabs
            </ContextMenuItem>
            {hasAgent && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => onDetachAgent(panel.id)}>
                  <HugeiconsIcon icon={LinkSquare02Icon} size={14} strokeWidth={2} />
                  Detach Claude
                </ContextMenuItem>
              </>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onNewTerminal}>
              <HugeiconsIcon icon={ComputerTerminal01Icon} size={14} strokeWidth={2} />
              New Terminal Tab
              {shortcutLabels["tab.new"] && (
                <ContextMenuShortcut>{shortcutLabels["tab.new"]}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
            <ContextMenuItem onSelect={onSplitTerminalRight}>
              <HugeiconsIcon icon={LayoutRightIcon} size={14} strokeWidth={2} />
              New Terminal Split Right
              {shortcutLabels["pane.splitRight"] && (
                <ContextMenuShortcut>{shortcutLabels["pane.splitRight"]}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
            <ContextMenuItem onSelect={onSplitTerminalDown}>
              <HugeiconsIcon icon={LayoutBottomIcon} size={14} strokeWidth={2} />
              New Terminal Split Down
              {shortcutLabels["pane.splitDown"] && (
                <ContextMenuShortcut>{shortcutLabels["pane.splitDown"]}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onNewBrowser}>
              <HugeiconsIcon icon={BrowserIcon} size={14} strokeWidth={2} />
              New Browser Tab
              {shortcutLabels["tab.newBrowser"] && (
                <ContextMenuShortcut>{shortcutLabels["tab.newBrowser"]}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
            <ContextMenuItem onSelect={onSplitBrowserRight}>
              <HugeiconsIcon icon={LayoutRightIcon} size={14} strokeWidth={2} />
              New Browser Split Right
            </ContextMenuItem>
            <ContextMenuItem onSelect={onSplitBrowserDown}>
              <HugeiconsIcon icon={LayoutBottomIcon} size={14} strokeWidth={2} />
              New Browser Split Down
            </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="flex w-52 flex-col gap-1 rounded-lg p-2"
        onEscapeKeyDown={(e) => { e.preventDefault(); handleCancel(); }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <span className="text-[12px] text-muted-foreground">Rename tab</span>
        <input
          ref={inputRef}
          autoFocus
          onFocus={(e) => { e.stopPropagation(); e.currentTarget.select(); }}
          onBlur={handleSave}
          defaultValue={panel.title ?? ""}
          placeholder={title}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); handleSave(); }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-full rounded border border-input bg-transparent px-1.5 py-1 text-[12px] text-foreground outline-none focus:border-ring placeholder:text-muted-foreground/60"
        />
      </PopoverContent>
    </Popover>
    {hoverBody && (
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={0}
        className="z-40 w-fit min-w-44 max-w-96 select-text rounded-xl p-2.5"
        onPointerEnter={() => { pointerInsideRef.current = true; }}
        onPointerLeave={() => { pointerInsideRef.current = false; }}
      >
        {hoverBody}
      </HoverCardContent>
    )}
    </HoverCard>
  );
}

export function PaneTabBar({ panels, activePanelId, paneFocused, workspaceId, isWorkspaceActive, onActivate, onClose, onNewTerminal, onCloseOtherPanels, onCloseAllPanels, onSplitTerminalRight, onSplitTerminalDown, onNewBrowser, onSplitBrowserRight, onSplitBrowserDown, onDetachAgent, onRenamePanel, onUpdatePanel, onRenameFile, onFocusOnExplorer, gitStatus, gitColorScheme }: Props) {
  const gitStatusMap = useMemo(() => gitStatus ? buildGitStatusMap(gitStatus) : null, [gitStatus]);
  const tabBarStyle = usePreferencesStore((s) => s.tabBarStyle);
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const shortcutLabels: Record<string, string | null> = {
    "tab.close":       getShortcutLabel("tab.close",       userShortcuts),
    "tab.new":         getShortcutLabel("tab.new",         userShortcuts),
    "pane.splitRight": getShortcutLabel("pane.splitRight", userShortcuts),
    "pane.splitDown":  getShortcutLabel("pane.splitDown",  userShortcuts),
    "tab.newBrowser":  getShortcutLabel("tab.newBrowser",  userShortcuts),
    "tab.rename":      getShortcutLabel("tab.rename",      userShortcuts),
    "tab.lock":        getShortcutLabel("tab.lock",        userShortcuts),
    "tab.focusOnExplorer": getShortcutLabel("tab.focusOnExplorer", userShortcuts),
  };
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activePanelIdRef = useRef(activePanelId);
  const userScrolledRef = useRef(false);
  const mouseLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouseInsideRef = useRef(true);
  const hoverOpenPanelsRef = useRef(new Set<string>());
  const [hoverCloseToken, setHoverCloseToken] = useState(0);
  const renamingPanelId = useTabRenameStore((s) => s.renamingPanelId);
  const isRenamingRef = useRef(false);
  useEffect(() => {
    isRenamingRef.current = renamingPanelId !== null;
  }, [renamingPanelId]);

  useEffect(() => { activePanelIdRef.current = activePanelId; });

  const scrollPanelIntoView = (panelId: string, behavior: ScrollBehavior = 'smooth') => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const tab = container.querySelector<HTMLElement>(`[data-panel-id="${panelId}"]`);
    if (!tab) return;
    const cr = container.getBoundingClientRect();
    const tr = tab.getBoundingClientRect();
    if (tr.left < cr.left) {
      container.scrollBy({ left: -(cr.left - tr.left + 4), behavior });
    } else if (tr.right > cr.right) {
      container.scrollBy({ left: tr.right - cr.right + 4, behavior });
    }
  };

  const scrollActiveIntoView = (behavior: ScrollBehavior = 'auto') => {
    const id = activePanelIdRef.current;
    if (!id) return;
    scrollPanelIntoView(id, behavior);
  };

  // Scroll active tab into view when it changes (unless user is browsing with wheel)
  useEffect(() => {
    if (userScrolledRef.current) return;
    scrollActiveIntoView('auto');
  }, [activePanelId]);

  // Wheel scroll: translate vertical delta to horizontal; snap-back managed by focus/mouse-leave logic
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (isRenamingRef.current) return;
      // A hover card open over a tab must not block scrolling. Close any open
      // hovers and let the wheel through.
      if (hoverOpenPanelsRef.current.size > 0) {
        hoverOpenPanelsRef.current.clear();
        setHoverCloseToken((t) => t + 1);
      }
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      container.scrollLeft += delta;
      userScrolledRef.current = true;
      // Edge case: scroll via trackpad while pointer was already outside
      if (!mouseInsideRef.current && !mouseLeaveTimerRef.current) {
        mouseLeaveTimerRef.current = setTimeout(() => {
          mouseLeaveTimerRef.current = null;
          userScrolledRef.current = false;
          scrollActiveIntoView('smooth');
        }, 5000);
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      if (mouseLeaveTimerRef.current) clearTimeout(mouseLeaveTimerRef.current);
    };
  }, []);

  // Keep active tab visible when the container is resized (pane resize, split, etc.)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => scrollActiveIntoView('auto'));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Snap back when the panel list changes (tab opened or closed)
  useEffect(() => {
    userScrolledRef.current = false;
    if (mouseLeaveTimerRef.current) {
      clearTimeout(mouseLeaveTimerRef.current);
      mouseLeaveTimerRef.current = null;
    }
    scrollActiveIntoView('auto');
  }, [panels.length]);

  useDndMonitor({
    onDragStart() {},
    onDragOver(event) {
      const overId = event.over?.id ? String(event.over.id) : null;
      if (!overId?.startsWith("tab-insert:")) {
        setInsertionIndex(null);
        return;
      }
      const parts = overId.split(":");
      const refPanelId = parts[1];
      const side = parts[2];
      if (!refPanelId || !side) { setInsertionIndex(null); return; }
      const idx = panels.findIndex((p) => p.id === refPanelId);
      if (idx === -1) { setInsertionIndex(null); return; }
      const insertionIdx = side === "before" ? idx : idx + 1;
      setInsertionIndex(insertionIdx);
    },
    onDragEnd() { setInsertionIndex(null); },
    onDragCancel() { setInsertionIndex(null); },
  });

  // react-resizable-panels registers a document-level capture pointerdown listener
  // that calls preventDefault() when the pointer is within ~5px of a resize handle.
  // In WebKit/Tauri, preventDefault() on pointerdown suppresses the click event.
  // Tabs at the top of a bottom pane become intermittently unclickable.
  // onPointerUp is not suppressed by that preventDefault(), so we use it here as
  // a fallback. onClick on each tab still works for all other cases.
  const pointerStartRef = useRef<{ id: number; x: number; y: number } | null>(null);

  return (
    <div
      ref={scrollContainerRef}
      className={cn(
        "flex h-7 shrink-0 items-center overflow-x-auto bg-card/60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        tabBarStyle === "connected"
          ? "gap-0 border-t border-border/60"
          : "gap-0.5 border-b border-border/60 px-1",
      )}
      onMouseEnter={() => {
        mouseInsideRef.current = true;
        if (mouseLeaveTimerRef.current) {
          clearTimeout(mouseLeaveTimerRef.current);
          mouseLeaveTimerRef.current = null;
        }
      }}
      onMouseLeave={() => {
        mouseInsideRef.current = false;
        if (!userScrolledRef.current) return;
        if (mouseLeaveTimerRef.current) clearTimeout(mouseLeaveTimerRef.current);
        mouseLeaveTimerRef.current = setTimeout(() => {
          mouseLeaveTimerRef.current = null;
          userScrolledRef.current = false;
          scrollActiveIntoView('smooth');
        }, 5000);
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        pointerStartRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const start = pointerStartRef.current;
        if (!start || start.id !== e.pointerId) return;
        pointerStartRef.current = null;
        if ((e.target as HTMLElement).closest("button")) return;
        const tabEl = (e.target as HTMLElement).closest("[data-panel-id]");
        if (!tabEl) return;
        const panelId = tabEl.getAttribute("data-panel-id");
        if (!panelId) return;
        const dx = Math.abs(e.clientX - start.x);
        const dy = Math.abs(e.clientY - start.y);
        if (dx < 6 && dy < 6) onActivate(panelId);
      }}
    >
      {panels.map((p, i) => (
        <DraggableTab
          key={p.id}
          panel={p}
          activePanelId={activePanelId}
          paneFocused={paneFocused}
          workspaceId={workspaceId}
          isWorkspaceActive={isWorkspaceActive}
          insertionBefore={insertionIndex === 0 && i === 0}
          insertionAfter={insertionIndex !== null && insertionIndex > 0 && i === insertionIndex - 1}
          panelsCount={panels.length}
          onActivate={onActivate}
          onClose={onClose}
          onCloseOtherPanels={onCloseOtherPanels}
          onCloseAllPanels={onCloseAllPanels}
          onNewTerminal={onNewTerminal}
          onSplitTerminalRight={onSplitTerminalRight}
          onSplitTerminalDown={onSplitTerminalDown}
          onNewBrowser={onNewBrowser}
          onSplitBrowserRight={onSplitBrowserRight}
          onSplitBrowserDown={onSplitBrowserDown}
          onDetachAgent={onDetachAgent}
          shortcutLabels={shortcutLabels}
          onRenamePanel={onRenamePanel}
          onUpdatePanel={onUpdatePanel}
          onRenameFile={onRenameFile}
          onFocusOnExplorer={onFocusOnExplorer}
          onHoverChange={(panelId, open) => {
            if (open) hoverOpenPanelsRef.current.add(panelId);
            else hoverOpenPanelsRef.current.delete(panelId);
          }}
          onSnapIntoView={(panelId) => scrollPanelIntoView(panelId, 'smooth')}
          closeHoverToken={hoverCloseToken}
          gitStatusMap={gitStatusMap}
          gitStatus={gitStatus}
          gitColorScheme={gitColorScheme}
        />
      ))}
      <button
        type="button"
        onClick={onNewTerminal}
        className="ml-1 shrink-0 px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        title="New terminal in this pane"
      >
        +
      </button>
    </div>
  );
}
