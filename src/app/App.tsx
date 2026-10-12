import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { tabLocations } from "@/modules/workspaces/lib/tabLocations";
import {
  blockedWhileHibernated,
  workspaceDialogPending,
  editorTabIds,
  enableRunOnStart,
  isPendingStale,
  terminalTabs,
} from "@/modules/workspaces/lib/hibernate";
import { claimToggle } from "@/modules/workspaces/lib/hibernateFx";
import { abandonUnflushedBuffers } from "@/modules/editor/lib/unflushedBuffers";
import { unmarkHibernating } from "@/modules/agents/lib/hibernatingTabs";
import { useAutoHibernate } from "@/modules/workspaces/lib/useAutoHibernate";
import { useHibernateFlow } from "@/modules/workspaces/lib/useHibernateFlow";
import { useCloseWorkspaceFlow } from "@/modules/workspaces/lib/useCloseWorkspaceFlow";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getLaunchDir } from "@/lib/launchDir";
import { native } from "@/lib/native";
import { newGroupId, newTabId } from "@/lib/ids";
import { useZoom } from "@/lib/useZoom";
import { useUiFont } from "@/lib/useUiFont";
import { useEditorFont } from "@/modules/editor/lib/useEditorFont";
import { isMarkdownPath } from "@/lib/utils";
import { isPreviewableEditorTab } from "@/modules/workspaces/lib/previewableTab";
import { AgentNotificationsBridge, useBellStore } from "@/modules/agents";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import {
  loadRestorePlans,
} from "@/modules/agents/lib/agentSessionRestore";
import { CommandPalette, createCommandItems } from "@/modules/command-palette";
import {
  NewEditorDialog,
  useEditorFileSync,
  type EditorPaneHandle,
} from "@/modules/editor";
import type { GitHistorySearchHandle } from "@/modules/git-history";
import {
  Header,
  type SearchInlineHandle,
  type SearchTarget,
} from "@/modules/header";
import type { OpenInEditorTarget } from "@/modules/external-editors";
import { runEditorScan } from "@/modules/external-editors";
import type { BrowserPaneHandle } from "@/modules/browser";
import { useFloatBrowser } from "@/modules/browser/useFloatBrowser";
import { copyToClipboard } from "@/modules/explorer/lib/contextActions";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setEditorAutoSave,
  setWarnOnCloseTabWithRunningProcess,
} from "@/modules/settings/store";
import {
  useGlobalShortcuts,
  type ShortcutHandlers,
  type ShortcutId,
} from "@/modules/shortcuts";
import { useSourceControlContext } from "@/modules/source-control";
import { DuplicateProgressBar, DuplicateQuitModal } from "@/modules/explorer";
import { initDuplicateProgressListener } from "@/modules/explorer/lib/duplicateStore";
import {
  appendGitignoreEntry,
  gitignoreEntryFor,
  hasGitignoreEntry,
} from "@/modules/explorer/lib/gitignore";
import {
  clearFocusedTerminal,
  disposeSession,
  interruptAgentLeaf,
  leafHasForegroundProcess,
  leaveLeafScratchpad,
  requestLeafFocus,
  toggleScratchpad,
  type TerminalPaneHandle,
  useTerminalFileDrop,
  useTerminalMetricsSampler,
  writeToSession,
} from "@/modules/terminal";
import { configureTerminalLinkBridge } from "@/modules/terminal/lib/terminalLinkBridge";
import { ThemeProvider, useThemeFileEditing } from "@/modules/theme";
import { UpdaterDialog } from "@/modules/updater";
import { useWorkspaceEnvStore } from "@/modules/workspace";
import {
  allPanes,
  collectRunningTerminals,
  findOpenPathTab,
  findPane,
  findPaneInDirection,
  findTabPane,
  focusedTabId,
  planDiffTabOpen,
  tabTitle,
  siblingPane,
  type DiffIdentity,
  type Tab,
  type MarkdownTabHandle,
  type TabCallbacks,
  type Rect,
  useWorkspaces,
  WorkspaceView,
} from "@/modules/workspaces";
import type { Script, WorkspaceGroup } from "@/modules/workspaces/lib/types";
import type { WelcomeActions } from "@/modules/workspaces/EmptyPaneWelcome";
import { WorkspaceMoveProvider } from "@/modules/workspaces/WorkspaceMoveContext";
import {
  SidebarTabMenuProvider,
  useSidebarTabMenuActions,
} from "@/modules/workspaces/SidebarTabMenuContext";
import type { TabMoveRequest } from "@/modules/workspaces/lib/tabTransfer";
import { WorkspaceDndProvider } from "@/modules/workspaces/WorkspaceDndProvider";
import { EditorChromeProvider } from "@/modules/workspaces/EditorChromeContext";
import { flashLockIcon } from "@/modules/workspaces/lib/lockFlashStore";
import {
  bulkClosableIds,
  otherBulkClosableIds,
} from "@/modules/workspaces/lib/tabClose";
import { scratchpadLeafsToClose } from "@/modules/workspaces/lib/scratchpadLeave";
import { flashTab } from "@/modules/workspaces/lib/tabFlashStore";
import {
  pruneEmptyGroups,
  reconcileGroupsAfterMove,
  visibleWorkspaceOrder,
} from "@/modules/workspaces/lib/workspaceOrder";
import type { SearchAddon } from "@xterm/addon-search";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { IS_MAC } from "@/lib/platform";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CloseDialogs } from "./components/CloseDialogs";
import { HibernateDialog } from "./components/HibernateDialog";
import { WorkspaceSettingsDialog } from "./components/WorkspaceSettingsDialog";
import { Sidebar, type SidebarHandle } from "./components/Sidebar";
import { WorkspaceInputBar } from "./components/WorkspaceInputBar";
import { WorkspaceBar } from "./components/WorkspaceBar";
import { setEditorFlush } from "./lib/editorFlush";
import { useTabCloseGuards } from "./hooks/useTabCloseGuards";
import { useWorkspaceSwitcher } from "./hooks/useWorkspaceSwitcher";
import {
  getSavedWorkspaceState,
  saveWorkspaceState,
} from "@/modules/workspaces/lib/workspaceState";
import {
  getSavedWorkspaceBarWidth,
  saveWorkspaceBarWidth,
} from "@/modules/workspaces/lib/workspaceBarState";
import {
  getSavedCollapsedGroups,
  saveCollapsedGroups,
} from "@/modules/workspaces/lib/collapsedGroupsState";
import {
  getSavedGroups,
  groupLabelOf,
  saveGroups,
} from "@/modules/workspaces/lib/workspaceGroupsState";
import type { SidebarView } from "@/modules/workspaces/lib/sidebarState";
import { useSidebarState } from "@/modules/workspaces/lib/useSidebarState";
import { isTabNoteOpen, toggleTabNote } from "@/modules/workspaces/lib/tabNote";
import { flushTabNote, useTabNoteStore } from "@/modules/workspaces/lib/tabNoteStore";
import { resolveRenameShortcut, useTabRenameStore } from "@/modules/workspaces/lib/tabRenameStore";
import { useWorkspaceRenameStore } from "@/modules/workspaces/lib/workspaceRenameStore";
import { useContextMenuCloseStore } from "@/modules/workspaces/lib/contextMenuCloseStore";
import { useWorkspaceSettingsStore } from "@/modules/workspaces/lib/workspaceSettingsStore";
import { useFileRenameStore } from "@/modules/workspaces/lib/fileRenameStore";
import {
  clearRunningCommandEntry,
  clearScriptRunningEntry,
  getRunningCommandsSnapshot,
  setScriptCommand,
  getRunningScriptCommand,
  setScriptRunning,
  getScriptRunningSnapshot,
} from "@/modules/workspaces/lib/terminalEphemeralStore";
import { clearMetricsEntry } from "@/modules/workspaces/lib/terminalMetricsStore";
import {
  resolveExplorerRoot,
  resolveSidebarTarget,
  isFilesystemRoot,
  parentRoot,
  type ExplorerRootMode,
} from "@/modules/workspaces/lib/explorerRoot";
import type { RevealRequest } from "@/modules/explorer";
import type { RevealAction } from "@/modules/explorer/lib/pendingAction";
import { tabFilePath } from "@/modules/workspaces/lib/tabPath";
import { resolveNewTerminalCwd } from "@/modules/workspaces/lib/newTerminalCwd";
import {
  buildScriptInput,
  planReusedTabInput,
  resolveScriptCwd,
  scriptCwdProblem,
  scriptFolderMissingMessage,
  scriptShellFor,
  type ScriptShell,
} from "@/modules/workspaces/lib/scriptCwd";
import {
  planCommandEvent,
  planDelayedWrite,
  planScriptStop,
} from "@/modules/workspaces/lib/scriptRunState";
import { followableCommand } from "@/modules/terminal/lib/runOnStartCommand";
import { IS_WINDOWS } from "@/lib/platform";
import { isAutofocusActive, isAutofocusTab } from "@/modules/workspaces/lib/types";
import { pathBasename } from "@/lib/pathUtils";
import { arrayMove } from "@dnd-kit/sortable";

// Same reference for every workspace whose nested list is closed, so the bar items stay stable.
const NO_TABS: Tab[] = [];

function toastSplitBlocked(
  reason: "pane-limit" | "too-narrow" | "too-short",
  max?: number,
) {
  const msg =
    reason === "pane-limit"
      ? `Can't split: max ${max} panes per workspace`
      : reason === "too-narrow"
        ? "Pane too narrow to split"
        : "Pane too short to split";
  toast(msg, { duration: 2500 });
}

export default function App() {
  const savedState = getSavedWorkspaceState();
  const launchDir = getLaunchDir();
  const initialOpts = savedState
    ? {
        initialWorkspaces: savedState.workspaces,
        initialActiveIndex: savedState.activeIndex,
      }
    : launchDir
      ? { cwd: launchDir }
      : undefined;

  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    activeWorkspace,
    addWorkspace,
    closeWorkspace,
    reorderWorkspaces,
    splitPane,
    focusPane,
    setPaneDivider,
    moveTab,
    moveTabToWorkspace,
    reorderTab,
    splitPaneAndPlace,
    splitPaneAndOpenTab,
    openTab,
    hibernateWorkspace,
    wakeWorkspace,
    activateTab,
    revealTab,
    closeTab,
    reopenClosed,
    updateTabData,
    replaceTab,
    setTerminalTabCwd,
    setWorkspaceCwd,
    setExplorerRootMode,
    setShowHidden,
    setWorkspaceRoot,
    clearWorkspaceRoot,
    setFsRoot,
    setWorkspaceTitle,
    setWorkspaceColor,
    setWorkspaceIcon,
    setWorkspaceDetailExpanded,
    setWorkspaceGroup,
    setWorkspaceGitConfig,
    addScript,
    updateScript,
    removeScript,
    reorderScripts,
    setActiveScript,
    validateScriptTabs,
    setScriptPaneId,
    setTerminalRunningCommand,
    toggleOverlayPreview,
    toggleSplitPreview,
    findTabGlobal,
    resetWorkspaces,
  } = useWorkspaces(initialOpts);

  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;

  const {
    floatTab,
    closeFloatWindow,
    focusFloatWindow,
    dockViaCommand,
    navigateFloatWindow,
    restoreFloatingTabs,
    destroyWorkspaceFloats,
  } = useFloatBrowser({ updateTabData, findTabGlobal });

  const activeCwdRef = useRef<string | null>(null);
  const contextCwdRef = useRef<string | null>(null);
  const scriptFocusFolderRef = useRef<string | null>(null);
  const homeRef = useRef<string | null>(null);

  // ── Active tab derivation ───────────────────────────────────────────────

  const activePane = activeWorkspace
    ? findPane(activeWorkspace.paneTree, activeWorkspace.activePaneId)
    : null;

  useTerminalMetricsSampler(activeWorkspace?.paneTree ?? null);

  const activeTabId = activePane?.activeTabId ?? null;
  const activeTab = activeTabId
    ? (activePane?.tabs.find((p) => p.id === activeTabId) ?? null)
    : null;

  // Returns focus to the active tab after a transient interruption -- a
  // dropdown, dialog, or context menu closing -- instead of leaving it on
  // whatever chrome element triggered it. Opening that chrome already closed
  // the scratchpad if it was open (see ScratchpadBar's onBlur), so this lands
  // on the terminal.
  const restoreLeafFocus = useCallback(() => {
    if (activeTabId) requestLeafFocus(activeTabId);
  }, [activeTabId]);

  const isTerminalTab = activeTab?.kind === "terminal";
  const isEditorTab = activeTab?.kind === "editor";
  const isGitHistoryTab = activeTab?.kind === "git-history";
  const activeCwd = isTerminalTab
    ? ((activeTab as { cwd?: string }).cwd ?? null)
    : null;
  activeCwdRef.current = activeCwd;

  const openInEditorTarget = useMemo<OpenInEditorTarget | null>(() => {
    if (!activeTab) return null;
    switch (activeTab.kind) {
      case "terminal":
        return activeTab.cwd ? { path: activeTab.cwd, kind: "dir" } : null;
      case "editor":
        return { path: activeTab.path, kind: "file" };
      case "markdown":
        return { path: activeTab.path, kind: "file" };
      case "git-diff":
      case "git-commit-file":
        return { path: activeTab.repoRoot, kind: "dir" };
      case "git-history":
        return { path: activeTab.repoRoot, kind: "dir" };
      case "browser":
        return activeWorkspace?.cwd
          ? { path: activeWorkspace.cwd, kind: "dir" }
          : null;
      default:
        return null;
    }
  }, [activeTab, activeWorkspace]);

  const contextCwdFilePath = activeTab ? tabFilePath(activeTab) : null;
  const contextCwd =
    activeTab?.kind === "terminal"
      ? (activeTab.cwd ?? null)
      : contextCwdFilePath
        ? contextCwdFilePath.split(/[\\/]/).slice(0, -1).join("/") || null
        : null;
  contextCwdRef.current = contextCwd;

  // ── Handle maps ───────────────────────────────────────────────────────────

  const searchAddons = useRef<Map<string, SearchAddon>>(new Map());
  const [activeSearchAddon, setActiveSearchAddon] =
    useState<SearchAddon | null>(null);
  const searchInlineRef = useRef<SearchInlineHandle | null>(null);
  const terminalHandles = useRef<Map<string, TerminalPaneHandle>>(new Map());
  const scriptCommandSeen = useRef<Set<string>>(new Set());
  const editorHandles = useRef<Map<string, EditorPaneHandle>>(new Map());
  const markdownHandles = useRef<Map<string, MarkdownTabHandle>>(new Map());
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  activeWorkspaceIdRef.current = activeWorkspaceId;
  const closeTabsRef = useRef<(tabIds: string[]) => Promise<boolean>>(() =>
    Promise.resolve(true),
  );
  const browserHandles = useRef<Map<string, BrowserPaneHandle>>(new Map());
  const [activeEditorHandle, setActiveEditorHandle] =
    useState<EditorPaneHandle | null>(null);
  const [gitHistoryHandle, setGitHistoryHandle] =
    useState<GitHistorySearchHandle | null>(null);
  const pendingGotoLine = useRef<Map<string, number>>(new Map());
  const fileLinkHandlerRef = useRef<
    (
      path: string,
      cwd: string | null,
      line?: number,
      col?: number,
      sourceTabId?: string,
    ) => void
  >(() => {});
  const cwdResolverRef = useRef<(leafId: string) => string | null>(() => null);

  const { zoomIn, zoomOut, zoomReset } = useZoom();
  useUiFont();
  useEditorFont();
  useTerminalFileDrop();

  // ── Editor scan on startup ────────────────────────────────────────────────

  useEffect(() => {
    void runEditorScan();
  }, []);

  // ── Workspace state persistence ───────────────────────────────────────────

  useEffect(() => {
    const activeIdx = workspaces.findIndex((w) => w.id === activeWorkspaceId);
    saveWorkspaceState(workspaces, activeIdx);
  }, [workspaces, activeWorkspaceId]);

  useEffect(() => {
    void loadRestorePlans();
  }, []);

  useEffect(() => {
    for (const ws of workspacesRef.current) {
      const livingTabIds = new Set<string>();
      for (const pane of allPanes(ws.paneTree)) {
        for (const tab of pane.tabs) livingTabIds.add(tab.id);
      }
      validateScriptTabs(ws.id, livingTabIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    void restoreFloatingTabs(workspacesRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus the active terminal when the active workspace changes (tab/workspace switch).
  // requestLeafFocus (not a blind terminal .focus()) so a tab whose scratchpad
  // is enabled keeps getting focus there, not the terminal.
  const prevWorkspaceIdRef = useRef(activeWorkspaceId);
  useEffect(() => {
    const prevId = prevWorkspaceIdRef.current;
    prevWorkspaceIdRef.current = activeWorkspaceId;
    if (prevId && prevId !== activeWorkspaceId) {
      const prevWs = workspacesRef.current.find((w) => w.id === prevId);
      const prevPane = prevWs
        ? findPane(prevWs.paneTree, prevWs.activePaneId)
        : null;
      if (prevPane?.activeTabId) leaveLeafScratchpad(prevPane.activeTabId);
    }
    const ws = workspacesRef.current.find((w) => w.id === activeWorkspaceId);
    if (!ws) return;
    const pane = findPane(ws.paneTree, ws.activePaneId);
    if (!pane?.activeTabId) return;
    const tabId = pane.activeTabId;
    const raf = requestAnimationFrame(() => {
      requestLeafFocus(tabId);
    });
    return () => cancelAnimationFrame(raf);
  }, [activeWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sentinel: whatever gesture changed the focused leaf (tab switch, pane or
  // workspace switch, new tab, split, open-in-tab), close the scratchpad of
  // the leaf being left. The explicit closes elsewhere run earlier and are
  // idempotent; this effect guarantees the binary invariant for any
  // activation path that does not route through them.
  const prevActiveLeafRef = useRef<string | null>(null);
  useEffect(() => {
    const ws = workspaces.find((w) => w.id === activeWorkspaceId);
    const pane = ws ? findPane(ws.paneTree, ws.activePaneId) : null;
    const activeLeaf = pane?.activeTabId ?? null;
    const prev = prevActiveLeafRef.current;
    prevActiveLeafRef.current = activeLeaf;
    if (prev && prev !== activeLeaf) leaveLeafScratchpad(prev);
  }, [workspaces, activeWorkspaceId]);

  // Re-focus the active terminal when this window regains OS focus (e.g. Cmd+Tab back,
  // or a modal/separate window like Settings closing). OS-level focus changes never
  // blur the scratchpad textarea (only same-document focus moves do), so this just
  // reasserts whatever was already focused.
  // Also fires on first window focus after startup, ensuring the terminal gets the
  // cursor even if the PTY wasn't ready when the workspace-switch effect ran.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) {
          void flushDirtyEditorsRef.current();
          return;
        }
        const ws = workspacesRef.current.find(
          (w) => w.id === activeWorkspaceIdRef.current,
        );
        if (!ws) return;
        const pane = findPane(ws.paneTree, ws.activePaneId);
        if (!pane?.activeTabId) return;
        const tabId = pane.activeTabId;
        requestAnimationFrame(() => {
          requestLeafFocus(tabId);
        });
      })
      .then((u) => {
        unlisten = u;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Return focus to the active terminal when the notification bell closes
  // (Cmd+I again, Esc, or click outside), so typing continues in the tab.
  // Opening the bell already closed the scratchpad if it was open, so this
  // lands on the terminal.
  const bellOpen = useBellStore((s) => s.open);
  const bellWasOpen = useRef(false);
  useEffect(() => {
    const justClosed = bellWasOpen.current && !bellOpen;
    bellWasOpen.current = bellOpen;
    if (!justClosed) return;
    const ws = workspacesRef.current.find((w) => w.id === activeWorkspaceId);
    const pane = ws ? findPane(ws.paneTree, ws.activePaneId) : null;
    if (!pane?.activeTabId) return;
    const tabId = pane.activeTabId;
    const raf = requestAnimationFrame(() => {
      requestLeafFocus(tabId);
    });
    return () => cancelAnimationFrame(raf);
  }, [bellOpen, activeWorkspaceId]);

  const init = usePreferencesStore((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    initDuplicateProgressListener();
  }, []);

  const sidebarRef = useRef<SidebarHandle>(null);
  const [revealRequest, setRevealRequest] = useState<RevealRequest | null>(
    null,
  );
  const windowLabel = useMemo(() => getCurrentWebviewWindow().label, []);
  const [workspaceBarWidth, setWorkspaceBarWidth] = useState(
    getSavedWorkspaceBarWidth,
  );
  const handleBarWidthChange = useCallback(
    (w: number) => {
      setWorkspaceBarWidth(w);
      saveWorkspaceBarWidth(windowLabel, w);
    },
    [windowLabel],
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(getSavedCollapsedGroups()),
  );
  const handleToggleGroup = useCallback(
    (groupId: string) => {
      const next = new Set(collapsedGroups);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      setCollapsedGroups(next);
      saveCollapsedGroups(windowLabel, [...next]);
    },
    [collapsedGroups, windowLabel],
  );
  const [groups, setGroups] = useState<WorkspaceGroup[]>(() =>
    getSavedGroups(),
  );
  // Confirmed group change (context menu "Move to Group" / "No group" / "New"):
  // moves the workspace, then reconciles the group list against the move.
  // reconcileGroupsAfterMove bakes the move into its own computation instead
  // of trusting `workspaces` state to already reflect it -- that state only
  // lands on the next render, so reading it here would see the PRE-move
  // membership and could prune the group the workspace just joined instead
  // of the one it left (see task-768).
  const handleSetGroup = useCallback(
    (workspaceId: string, groupId: string | null) => {
      setWorkspaceGroup(workspaceId, groupId);
      setGroups((prev) => {
        const next = reconcileGroupsAfterMove(
          prev,
          workspaces,
          workspaceId,
          groupId,
        );
        if (next.length === prev.length) return prev;
        saveGroups(windowLabel, next);
        return next;
      });
    },
    [workspaces, setWorkspaceGroup, windowLabel],
  );
  // Live preview during a workspace drag (dragOver) and its cancel-revert:
  // changes groupId without reconciling, so a cancelled drag can't lose a
  // group that only looked empty mid-drag.
  const handlePreviewGroup = useCallback(
    (workspaceId: string, groupId: string | null) => {
      setWorkspaceGroup(workspaceId, groupId);
    },
    [setWorkspaceGroup],
  );
  // Called once a workspace drag ends (not cancelled): by this point every
  // groupId change already landed via handlePreviewGroup on earlier renders,
  // so `workspaces` here is the real, settled membership -- a plain prune
  // (not reconcileGroupsAfterMove) is correct.
  const handleCommitGroupMove = useCallback(() => {
    setGroups((prev) => {
      const next = pruneEmptyGroups(prev, workspaces);
      if (next.length === prev.length) return prev;
      saveGroups(windowLabel, next);
      return next;
    });
  }, [workspaces, windowLabel]);
  const handleCreateGroup = useCallback(
    (workspaceId: string): string => {
      const group: WorkspaceGroup = { id: newGroupId(), label: "Group" };
      setGroups((prev) => {
        const withNewGroup = [...prev, group];
        saveGroups(windowLabel, withNewGroup);
        return withNewGroup;
      });
      handleSetGroup(workspaceId, group.id);
      return group.id;
    },
    [windowLabel, handleSetGroup],
  );
  const handleRenameGroup = useCallback(
    (groupId: string, label: string) => {
      setGroups((prev) => {
        const next = prev.map((g) => (g.id === groupId ? { ...g, label } : g));
        saveGroups(windowLabel, next);
        return next;
      });
    },
    [windowLabel],
  );
  const handleReorderGroups = useCallback(
    (fromId: string, toId: string) => {
      setGroups((prev) => {
        const from = prev.findIndex((g) => g.id === fromId);
        const to = prev.findIndex((g) => g.id === toId);
        if (from === -1 || to === -1) return prev;
        const next = arrayMove(prev, from, to);
        saveGroups(windowLabel, next);
        return next;
      });
    },
    [windowLabel],
  );
  const {
    open: sidebarOpen,
    view: sidebarView,
    side: sidebarSide,
    width: sidebarWidth,
    stateRef: sidebarStateRef,
    setOpen: setSidebarOpen,
    setView: setSidebarView,
    setSide: setSidebarSide,
    setWidth: setSidebarWidth,
  } = useSidebarState(windowLabel);
  const editorAutoSave = usePreferencesStore((s) => s.editorAutoSave);
  const gitColorScheme = usePreferencesStore((s) => s.explorerGitColorScheme);
  const pendingExplorerSearch = useRef(false);

  // ── Live terminal tab tracking for session disposal ─────────────────────

  const liveTabIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const live = new Set<string>();
    for (const ws of workspaces) {
      if (ws.hibernated) continue;
      for (const pane of allPanes(ws.paneTree)) {
        for (const tab of pane.tabs) {
          if (tab.kind === "terminal") live.add(tab.id);
        }
      }
    }
    for (const id of liveTabIdsRef.current) {
      if (!live.has(id)) {
        useAgentStore.getState().finish(id);
        disposeSession(id);
        searchAddons.current.delete(id);
        terminalHandles.current.delete(id);
        scriptCommandSeen.current.delete(id);
        clearRunningCommandEntry(id);
        clearScriptRunningEntry(id);
        clearMetricsEntry(id);
      }
    }
    liveTabIdsRef.current = live;
    for (const k of [...editorHandles.current.keys()]) {
      const found = findTabGlobal(k);
      if (!found) editorHandles.current.delete(k);
    }
    for (const k of [...browserHandles.current.keys()]) {
      const found = findTabGlobal(k);
      if (!found) browserHandles.current.delete(k);
    }
  }, [workspaces, findTabGlobal]);

  // Update active search addon / editor handle when active tab changes.
  // Switching tab or workspace flushes any dirty editor we just left.
  useEffect(() => {
    void flushDirtyEditorsRef.current();
    setActiveSearchAddon(
      activeTabId !== null
        ? (searchAddons.current.get(activeTabId) ?? null)
        : null,
    );
    setActiveEditorHandle(
      activeTabId !== null
        ? (editorHandles.current.get(activeTabId) ?? null)
        : null,
    );
  }, [activeTabId]);

  // ── Workspace state management ────────────────────────────────────────────

  const clearWorkspaceState = useCallback(() => {
    for (const id of liveTabIdsRef.current) {
      disposeSession(id);
      clearRunningCommandEntry(id);
      clearMetricsEntry(id);
    }
    searchAddons.current.clear();
    terminalHandles.current.clear();
    editorHandles.current.clear();
    browserHandles.current.clear();
    setActiveSearchAddon(null);
    setActiveEditorHandle(null);
  }, []);

  // ── Script execution ──────────────────────────────────────────────────────

  const scheduleScriptWrite = useCallback(
    (tabId: string, input: string, delay: number) => {
      const tryWrite = (attempts = 0) => {
        const step = planDelayedWrite(
          getScriptRunningSnapshot().get(tabId),
          terminalHandles.current.has(tabId),
          attempts,
        );
        if (step === "write") {
          terminalHandles.current.get(tabId)?.write(input);
        } else if (step === "retry") {
          setTimeout(() => tryWrite(attempts + 1), 100);
        } else {
          setScriptRunning(tabId, false);
        }
      };
      setTimeout(tryWrite, delay);
    },
    [],
  );

  const runWorkspaceConfig = useCallback(
    (config: Script) => {
      if (!activeWorkspace || activeWorkspace.hibernated) return;

      // The user's own leaf, captured up front so a same-workspace script run
      // reveals its tab without moving activePaneId or focus away from here.
      const userPaneId = activeWorkspace.activePaneId;
      const scriptShell: ScriptShell = scriptShellFor(
        IS_WINDOWS,
        useWorkspaceEnvStore.getState().env.kind,
      );
      const scriptCwd = resolveScriptCwd({
        mode: config.cwdMode,
        fixedFolder: config.cwd,
        focusFolder: scriptFocusFolderRef.current,
        workspaceRoot: activeWorkspace.workspaceRoot,
        workspaceCwd: activeWorkspace.cwd,
      });
      const busyReusedTab =
        !!config.tabId &&
        !!findTabGlobal(config.tabId) &&
        !!getScriptRunningSnapshot().get(config.tabId);
      const cwdProblem = scriptCwd ? scriptCwdProblem(scriptCwd) : null;
      if (cwdProblem && !busyReusedTab) {
        toast.error(`Script not run: ${cwdProblem}`, { duration: 4000 });
        return;
      }
      // The typed cd already keeps the command from running in a missing
      // folder; this only tells the user why nothing happened.
      if (scriptCwd && !busyReusedTab) {
        void native
          .fsStat(scriptCwd)
          .catch(() => null)
          .then((stat) => {
            const msg = scriptFolderMissingMessage(scriptCwd, stat);
            if (msg) toast.error(msg, { duration: 6000 });
          });
      }
      const userLeafId = focusedTabId(activeWorkspace.paneTree, userPaneId);

      // Case 1: tab already exists -- reveal it (same workspace, different
      // pane) or focus it (other workspace, or same pane as the user: a pane
      // shows one tab, so revealing without stealing focus is impossible)
      // and re-run if idle
      if (config.tabId) {
        const found = findTabGlobal(config.tabId);
        if (found) {
          if (found.workspace.id === activeWorkspace.id) {
            if (found.pane.id === userPaneId) {
              activateTab(found.workspace.id, config.tabId);
              requestLeafFocus(config.tabId);
            } else {
              revealTab(found.workspace.id, config.tabId);
              if (userLeafId) requestLeafFocus(userLeafId);
            }
          } else {
            setActiveWorkspaceId(found.workspace.id);
            activateTab(found.workspace.id, config.tabId);
            requestLeafFocus(config.tabId);
          }
          const tabId = config.tabId;
          const wasBusy = !!getScriptRunningSnapshot().get(tabId);
          if (wasBusy) flashTab(tabId);
          const input = planReusedTabInput(
            !!getScriptRunningSnapshot().get(tabId),
            config.command,
            scriptCwd,
            scriptShell,
          );
          if (input !== null) {
            setScriptRunning(tabId, "running");
            setScriptCommand(tabId, config.command);
            scheduleScriptWrite(tabId, input, 50);
          }
          return;
        }
      }

      const freshTabId = newTabId();
      const tab: Tab = {
        id: freshTabId,
        kind: "terminal",
        cwd: scriptCwd,
        title: config.name || undefined,
      };

      // Case 2: existing script pane -- add tab to it without splitting.
      // openTab only sets the target pane's own activeTabId, it never touches
      // the workspace's activePaneId, so this reveals without stealing focus
      // unless the script pane IS the user's own pane, in which case a pane
      // showing one tab makes reveal-without-stealing impossible: activation
      // follows the script instead.
      const existingScriptPane = activeWorkspace.scriptPaneId
        ? findPane(activeWorkspace.paneTree, activeWorkspace.scriptPaneId)
        : null;

      if (existingScriptPane) {
        openTab(activeWorkspace.id, activeWorkspace.scriptPaneId!, tab);
        if (existingScriptPane.id === userPaneId) {
          activateTab(activeWorkspace.id, freshTabId);
          requestLeafFocus(freshTabId);
        } else if (userLeafId) {
          requestLeafFocus(userLeafId);
        }
      } else {
        // Case 3: no script pane yet -- split and record the new pane
        const { workspacePaneLimit } = usePreferencesStore.getState();
        const atLimit =
          allPanes(activeWorkspace.paneTree).length >= workspacePaneLimit;
        if (atLimit) {
          // The tab lands in the user's own active pane by definition, so
          // activation follows the script instead of trying to reveal it.
          openTab(activeWorkspace.id, activeWorkspace.activePaneId, tab);
          setScriptPaneId(activeWorkspace.id, activeWorkspace.activePaneId);
          activateTab(activeWorkspace.id, freshTabId);
          requestLeafFocus(freshTabId);
        } else {
          // splitPaneAndOpenTab activates the freshly created pane, which is
          // never the user's own pane, so restore it and keep focus put.
          const freshPaneId = splitPaneAndOpenTab(
            activeWorkspace.id,
            activeWorkspace.activePaneId,
            "bottom",
            tab,
          );
          setScriptPaneId(activeWorkspace.id, freshPaneId);
          focusPane(activeWorkspace.id, userPaneId);
          if (userLeafId) requestLeafFocus(userLeafId);
        }
      }

      updateScript(activeWorkspace.id, config.id, { tabId: freshTabId });

      setScriptRunning(freshTabId, "running");
      setScriptCommand(freshTabId, config.command);
      scheduleScriptWrite(
        freshTabId,
        buildScriptInput(config.command, scriptCwd, scriptShell),
        150,
      );
    },
    [
      activeWorkspace,
      findTabGlobal,
      setActiveWorkspaceId,
      activateTab,
      revealTab,
      splitPaneAndOpenTab,
      focusPane,
      updateScript,
      openTab,
      setScriptPaneId,
      scheduleScriptWrite,
    ],
  );

  const stopWorkspaceConfig = useCallback(
    (config: Script) => {
      if (!config.tabId) return;
      const found = findTabGlobal(config.tabId);
      if (found && found.workspace.id === activeWorkspaceId) {
        // Same workspace: reveal the script tab without moving the user's
        // pane or focus away from wherever they currently are, unless the
        // script's pane IS the user's own pane (a pane shows one tab, so
        // reveal-without-stealing is impossible there): activation follows
        // the script instead.
        const userPaneId = found.workspace.activePaneId;
        if (found.pane.id === userPaneId) {
          activateTab(found.workspace.id, config.tabId);
          requestLeafFocus(config.tabId);
        } else {
          const userLeafId = focusedTabId(found.workspace.paneTree, userPaneId);
          revealTab(found.workspace.id, config.tabId);
          if (userLeafId) requestLeafFocus(userLeafId);
        }
      } else if (found) {
        // Different workspace: jump to the script's workspace and tab,
        // mirroring runWorkspaceConfig's different-workspace case.
        setActiveWorkspaceId(found.workspace.id);
        activateTab(found.workspace.id, config.tabId);
        requestLeafFocus(config.tabId);
      } else {
        activateTab(activeWorkspaceId, config.tabId);
        requestLeafFocus(config.tabId);
      }
      setScriptRunning(
        config.tabId,
        planScriptStop(scriptCommandSeen.current.has(config.tabId)),
      );
      const handle = terminalHandles.current.get(config.tabId);
      handle?.write("\x03");
    },
    [
      activateTab,
      activeWorkspaceId,
      findTabGlobal,
      revealTab,
      setActiveWorkspaceId,
    ],
  );

  const handleCloseWorkspace = useCallback(
    async (wsId: string) => {
      const ws = workspacesRef.current.find((w) => w.id === wsId);
      await destroyWorkspaceFloats(wsId, workspacesRef.current);
      if (ws) {
        abandonUnflushedBuffers(editorTabIds(ws));
        unmarkHibernating(terminalTabs(ws).map((t) => t.id));
      }
      closeWorkspace(wsId);
    },
    [closeWorkspace, destroyWorkspaceFloats],
  );

  const workspaceEnv = useWorkspaceEnvStore((s) => s.env);
  const setWorkspaceEnv = useWorkspaceEnvStore((s) => s.setEnv);
  const { home, launchCwd, launchCwdResolved } = useWorkspaceSwitcher({
    workspacesRef,
    workspaceEnv,
    setWorkspaceEnv,
    resetToHome: (home) => {
      clearWorkspaceState();
      resetWorkspaces(home);
    },
    clearWorkspaceState,
  });
  homeRef.current = home;

  // When Cmd+Shift+F is pressed while the sidebar is closed, the sidebar opens
  // asynchronously (Tauri IPC). This effect fires once both conditions are met
  // and calls focusExplorer() to open and focus the search input.
  useEffect(() => {
    if (
      sidebarOpen &&
      sidebarView === "explorer" &&
      pendingExplorerSearch.current
    ) {
      pendingExplorerSearch.current = false;
      sidebarRef.current?.focusExplorer();
    }
  }, [sidebarOpen, sidebarView]);

  const activeRootMode: ExplorerRootMode =
    activeWorkspace?.explorerRootMode ?? "filesystem";

  const activeShowHidden = activeWorkspace?.showHidden ?? false;

  const workspaceRootPath = activeWorkspace?.workspaceRoot ?? null;
  const fsFolderRoot = activeWorkspace?.fsRoot ?? null;

  // Git repo the workspace root belongs to, or null when the workspace root is a
  // plain container folder. resolveSidebarTarget uses it to decide whether a git
  // repo nested under the workspace should re-root the explorer (see focusSidebar).
  const [workspaceGitRoot, setWorkspaceGitRoot] = useState<string | null>(null);

  const explorerRoot = useMemo<string | null>(
    () =>
      resolveExplorerRoot({
        mode: activeRootMode,
        workspaceRoot: workspaceRootPath,
        fsRoot: fsFolderRoot,
        home,
      }),
    [activeRootMode, workspaceRootPath, fsFolderRoot, home],
  );

  const editorChrome = useMemo(
    () => ({ explorerRoot, workspaceRoot: workspaceRootPath, home }),
    [explorerRoot, workspaceRootPath, home],
  );

  const canNavigateUp =
    activeRootMode === "filesystem" &&
    explorerRoot !== null &&
    !isFilesystemRoot(explorerRoot);

  const fsRootPath = fsFolderRoot ?? home;

  const pushOnCommit = activeWorkspace?.git?.pushOnCommit ?? false;
  const savedCommitMessage = activeWorkspace?.git?.commitMessage ?? "";

  const handlePushOnCommitChange = useCallback(
    (enabled: boolean) => {
      if (activeWorkspace)
        setWorkspaceGitConfig(activeWorkspace.id, { pushOnCommit: enabled });
    },
    [activeWorkspace, setWorkspaceGitConfig],
  );

  const handleCommitMessagePersist = useCallback(
    (workspaceId: string, message: string) => {
      setWorkspaceGitConfig(workspaceId, { commitMessage: message });
    },
    [setWorkspaceGitConfig],
  );

  const handleChangeRootMode = useCallback(
    (mode: ExplorerRootMode) => {
      if (activeWorkspace) setExplorerRootMode(activeWorkspace.id, mode);
    },
    [activeWorkspace, setExplorerRootMode],
  );

  const handleToggleShowHidden = useCallback(() => {
    if (activeWorkspace)
      setShowHidden(activeWorkspace.id, !(activeWorkspace.showHidden ?? false));
  }, [activeWorkspace, setShowHidden]);

  const handleSetAsRoot = useCallback(
    (path: string) => {
      if (activeWorkspace) setWorkspaceRoot(activeWorkspace.id, path);
    },
    [activeWorkspace, setWorkspaceRoot],
  );

  const handleNavigateUp = useCallback(() => {
    if (!activeWorkspace || activeRootMode !== "filesystem" || !explorerRoot) {
      return;
    }
    if (isFilesystemRoot(explorerRoot)) return;
    setFsRoot(activeWorkspace.id, parentRoot(explorerRoot));
  }, [activeWorkspace, activeRootMode, explorerRoot, setFsRoot]);

  const handleFsRootMissing = useCallback(
    async (brokenPath: string) => {
      if (!activeWorkspace || activeRootMode !== "filesystem") return;
      let candidate = brokenPath;
      while (!isFilesystemRoot(candidate)) {
        candidate = parentRoot(candidate);
        try {
          await native.fsStat(candidate);
          break;
        } catch {
          // keep climbing toward the filesystem/drive root, which always exists
        }
      }
      setFsRoot(activeWorkspace.id, candidate);
    },
    [activeWorkspace, activeRootMode, setFsRoot],
  );

  const handleEnterFolder = useCallback(
    (path: string) => {
      if (activeWorkspace && activeRootMode === "filesystem") {
        setFsRoot(activeWorkspace.id, path);
      }
    },
    [activeWorkspace, activeRootMode, setFsRoot],
  );

  const handleNavigateToWorktree = useCallback(
    (path: string) => {
      if (activeWorkspace) {
        setExplorerRootMode(activeWorkspace.id, "filesystem");
        setFsRoot(activeWorkspace.id, path);
      }
    },
    [activeWorkspace, setExplorerRootMode, setFsRoot],
  );

  const lastFocusFolderRef = useRef<string | null>(null);

  // Worktree an agent has entered in the active tab; the sidebar follows it
  // instead of the shell cwd (which stays put) until the agent leaves.
  const agentWorktree = useAgentStore((s) =>
    activeTabId ? (s.sessions[activeTabId]?.meta?.worktreeCwd ?? null) : null,
  );
  scriptFocusFolderRef.current = agentWorktree ?? contextCwdRef.current;

  const focusSidebar = useCallback(
    (
      folder: string,
      opts: { fromShortcut: boolean; pendingAction?: RevealAction },
    ) => {
      const ws = activeWorkspace;
      if (!ws) return;
      void native
        .gitResolveRepo(folder)
        .catch(() => null)
        .then((info) => {
          const resolvedGitRoot = info?.repoRoot ?? null;
          const target = resolveSidebarTarget({
            folder,
            workspaceRoot: workspaceRootPath,
            workspaceGitRoot,
            gitRoot: resolvedGitRoot,
            currentFsRoot: fsFolderRoot,
            home,
          });
          setExplorerRootMode(ws.id, target.mode);
          if (target.mode === "filesystem" && target.fsRoot) {
            setFsRoot(ws.id, target.fsRoot);
          }
          setRevealRequest((r) => ({
            path: folder,
            nonce: (r?.nonce ?? 0) + 1,
            pendingAction: opts.pendingAction,
          }));
        });

      if (opts.fromShortcut || opts.pendingAction) {
        const sidebar = sidebarStateRef.current;
        if (!sidebar.open) setSidebarOpen(true);
        // pendingAction (reveal file etc): always switch to explorer.
        // fromShortcut: only switch to explorer if the folder hasn't changed since
        // the last call -- first press refreshes, second press on same dir goes to explorer.
        const shouldSwitchToExplorer = opts.pendingAction
          ? true
          : lastFocusFolderRef.current === folder;
        if (shouldSwitchToExplorer && sidebar.view !== "explorer") {
          setSidebarView("explorer");
        }
      }
      lastFocusFolderRef.current = folder;
    },
    [
      activeWorkspace,
      workspaceRootPath,
      workspaceGitRoot,
      fsFolderRoot,
      home,
      setExplorerRootMode,
      setFsRoot,
      setSidebarOpen,
      setSidebarView,
    ],
  );

  // Drive the sidebar when the ACTIVE tab becomes an autofocus terminal,
  // whether by gaining focus or by turning autofocus on while already focused
  // (shortcut / hover / context menu). Toggling autofocus on a non-active tab
  // does nothing here because the active tab does not change. The startup
  // mount is skipped so restoring a session never auto-fires.
  const activeTabFocusTarget = useMemo(
    () =>
      activeTab
        ? (tabFilePath(activeTab) ??
          (activeTab.kind === "terminal"
            ? (agentWorktree ?? activeTab.cwd ?? null)
            : null))
        : null,
    [activeTab, agentWorktree],
  );
  const focusActiveTabInExplorer = useCallback(() => {
    if (activeTabFocusTarget) {
      focusSidebar(activeTabFocusTarget, { fromShortcut: true });
    }
  }, [activeTabFocusTarget, focusSidebar]);

  const autofocusMode = usePreferencesStore((s) => s.autofocusMode);
  const prevAutofocusSignalRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const ap = activeTab;
    const target = ap && isAutofocusActive(ap, autofocusMode) ? activeTabFocusTarget : null;
    const signal = target ? `${activeTabId}|${agentWorktree ?? ""}` : null;
    const prev = prevAutofocusSignalRef.current;
    prevAutofocusSignalRef.current = signal;
    if (prev === undefined) return; // skip initial mount
    if (signal && signal !== prev && target) {
      focusSidebar(target, { fromShortcut: false });
    }
  }, [activeTabId, activeTab, agentWorktree, activeTabFocusTarget, focusSidebar, autofocusMode]);

  // Whether the saved workspace root still exists on disk, so the selector can
  // disable the option when it is unset or missing.
  const [workspaceRootExists, setWorkspaceRootExists] = useState(false);
  useEffect(() => {
    if (!workspaceRootPath) {
      setWorkspaceRootExists(false);
      return;
    }
    let cancelled = false;
    void native
      .fsStat(workspaceRootPath)
      .then(() => {
        if (!cancelled) setWorkspaceRootExists(true);
      })
      .catch(() => {
        if (!cancelled) setWorkspaceRootExists(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceRootPath]);

  // Resolve the workspace root's own repo once per root, not on every focus.
  useEffect(() => {
    if (!workspaceRootPath) {
      setWorkspaceGitRoot(null);
      return;
    }
    let cancelled = false;
    void native
      .gitResolveRepo(workspaceRootPath)
      .then((info) => {
        if (!cancelled) setWorkspaceGitRoot(info?.repoRoot ?? null);
      })
      .catch(() => {
        if (!cancelled) setWorkspaceGitRoot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceRootPath]);

  const openNewTerminal = useCallback(
    (targetPaneId?: string, targetWsId?: string) => {
      const ws = targetWsId
        ? workspacesRef.current.find((w) => w.id === targetWsId)
        : workspacesRef.current.find(
            (w) => w.id === activeWorkspaceIdRef.current,
          );
      if (!ws) return;
      const { terminalNewFolderMode } = usePreferencesStore.getState();
      openTab(ws.id, targetPaneId ?? ws.activePaneId, {
        id: newTabId(),
        kind: "terminal",
        cwd: resolveNewTerminalCwd({
          mode: terminalNewFolderMode,
          home: homeRef.current,
          lastFolder: scriptFocusFolderRef.current ?? ws.cwd ?? null,
          workspaceRoot: ws.workspaceRoot ?? ws.fsRoot ?? null,
        }),
      });
    },
    [openTab],
  );

  // ── Window title ──────────────────────────────────────────────────────────

  useEffect(() => {
    const project = explorerRoot
      ? pathBasename(explorerRoot, { tolerateTrailingSlash: true })
      : "";
    const label = activeTab
      ? activeCwd
        ? pathBasename(activeCwd, { tolerateTrailingSlash: true })
        : tabTitle(activeTab)
      : "";
    let title: string;
    if (project && label && label !== project) title = `${project} — ${label}`;
    else title = project || label || "Kex";
    document.title = title;
    void getCurrentWindow()
      .setTitle(title)
      .catch(() => {});
  }, [explorerRoot, activeCwd, activeTab]);

  // ── Dialogs ───────────────────────────────────────────────────────────────

  const [newEditorOpen, setNewEditorOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paletteInitialMode, setPaletteInitialMode] = useState<
    "commands" | "content"
  >("commands");
  const openCommandPalette = useCallback(
    (mode: "commands" | "content" = "commands") => {
      setPaletteInitialMode(mode);
      setCommandPaletteOpen(true);
    },
    [],
  );

  // ── Open tab helpers ────────────────────────────────────────────────────

  const openFileInTab = useCallback(
    (path: string, pin?: boolean) => {
      if (!activeWorkspace) return undefined;
      const markdown = isMarkdownPath(path);
      // Check if already open (as editor or rendered markdown); activate it.
      const existingOpenTab = findOpenPathTab(activeWorkspace.paneTree, path);
      if (existingOpenTab) {
        const existing = existingOpenTab.tab;
        if (pin && existing.kind === "editor" && existing.preview) {
          updateTabData(activeWorkspace.id, existing.id, (p) =>
            p.kind === "editor" ? { ...p, preview: false } : p,
          );
        }
        activateTab(activeWorkspace.id, existing.id);
        flashTab(existing.id);
        return existing.id;
      }
      const tabId = newTabId();
      const isPreview = !(pin ?? false);

      if (!markdown && isPreview) {
        const activePane = allPanes(activeWorkspace.paneTree).find(
          (p) => p.id === activeWorkspace.activePaneId,
        );
        const existingPreview = activePane?.tabs.find(
          (p) => p.kind === "editor" && p.preview,
        );
        if (existingPreview) {
          replaceTab(
            activeWorkspace.id,
            activeWorkspace.activePaneId,
            existingPreview.id,
            {
              id: tabId,
              kind: "editor",
              path,
              dirty: false,
              preview: true,
            },
          );
          return tabId;
        }
      }

      openTab(
        activeWorkspace.id,
        activeWorkspace.activePaneId,
        markdown
          ? { id: tabId, kind: "markdown", path }
          : {
              id: tabId,
              kind: "editor",
              path,
              dirty: false,
              preview: isPreview,
            },
      );
      return tabId;
    },
    [activeWorkspace, activateTab, openTab, replaceTab],
  );

  const openNoteToSide = useCallback(
    (path: string) => {
      if (!activeWorkspace) return;
      const existingOpenTab = findOpenPathTab(activeWorkspace.paneTree, path);
      if (existingOpenTab) {
        activateTab(activeWorkspace.id, existingOpenTab.tab.id);
        flashTab(existingOpenTab.tab.id);
        return;
      }
      const i = path.lastIndexOf("/");
      splitPaneAndOpenTab(
        activeWorkspace.id,
        activeWorkspace.activePaneId,
        "right",
        {
          id: newTabId(),
          kind: "markdown",
          path,
          title: i === -1 ? path : path.slice(i + 1),
        },
      );
    },
    [activeWorkspace, activateTab, splitPaneAndOpenTab],
  );

  const revealNoteInExplorer = useCallback(
    (path: string) => {
      // Pre-seed the ref so focusSidebar's "second press" heuristic (see its
      // own comment) treats this as already-focused and switches to Explorer
      // unconditionally, matching the deterministic "explicit reveal" case.
      lastFocusFolderRef.current = path;
      focusSidebar(path, { fromShortcut: true });
    },
    [focusSidebar],
  );

  const openFileInRightSplit = useCallback(
    (path: string, sourceTabId?: string) => {
      if (!activeWorkspace) return undefined;
      const markdown = isMarkdownPath(path);
      const existingOpenTab = findOpenPathTab(activeWorkspace.paneTree, path);
      if (existingOpenTab) {
        activateTab(activeWorkspace.id, existingOpenTab.tab.id);
        flashTab(existingOpenTab.tab.id);
        return existingOpenTab.tab.id;
      }
      const tabId = newTabId();
      const newTab = markdown
        ? ({ id: tabId, kind: "markdown" as const, path } as const)
        : ({
            id: tabId,
            kind: "editor" as const,
            path,
            dirty: false,
            preview: false,
          } as const);
      const sourcePaneId = sourceTabId
        ? findTabPane(activeWorkspace.paneTree, sourceTabId)?.pane.id
        : undefined;
      if (sourcePaneId) {
        const sibling = siblingPane(activeWorkspace.paneTree, sourcePaneId);
        if (sibling) {
          openTab(activeWorkspace.id, sibling.id, newTab);
        } else {
          splitPaneAndOpenTab(
            activeWorkspace.id,
            sourcePaneId,
            "right",
            newTab,
          );
        }
      } else {
        openTab(activeWorkspace.id, activeWorkspace.activePaneId, newTab);
      }
      return tabId;
    },
    [activeWorkspace, activateTab, openTab, splitPaneAndOpenTab],
  );

  const openPlannedDiffTab = useCallback(
    (
      workspaceId: string,
      activePaneId: string,
      plan: { paneId: string; index?: number },
      tab: Tab,
    ) => {
      openTab(workspaceId, plan.paneId, tab, plan.index);
      if (plan.paneId !== activePaneId) focusPane(workspaceId, plan.paneId);
    },
    [openTab, focusPane],
  );

  const openGitDiffInTab = useCallback(
    (
      params: {
        repoRoot: string;
        path: string;
        mode: "-" | "+";
        originalPath: string | null;
      },
      pin = false,
    ) => {
      if (!activeWorkspace) return;
      const candidate: DiffIdentity = {
        kind: "git-diff",
        repoRoot: params.repoRoot,
        path: params.path,
        mode: params.mode,
      };
      const plan = planDiffTabOpen(
        allPanes(activeWorkspace.paneTree),
        activeWorkspace.activePaneId,
        candidate,
        pin,
      );
      if (plan.action === "activate") {
        if (plan.shouldUnpin) {
          updateTabData(activeWorkspace.id, plan.tabId, (p) =>
            p.kind === "git-diff" ? { ...p, preview: false } : p,
          );
        }
        activateTab(activeWorkspace.id, plan.tabId);
        flashTab(plan.tabId);
        return;
      }
      const newTab: Tab = {
        id: newTabId(),
        kind: "git-diff",
        ...params,
        preview: !pin,
      };
      if (plan.action === "replace") {
        replaceTab(
          activeWorkspace.id,
          plan.paneId,
          plan.oldTabId,
          newTab,
        );
        return;
      }
      openPlannedDiffTab(
        activeWorkspace.id,
        activeWorkspace.activePaneId,
        plan,
        newTab,
      );
    },
    [activeWorkspace, activateTab, updateTabData, replaceTab, openPlannedDiffTab],
  );

  const openGitHistoryInTab = useCallback(
    (args: { repoRoot: string; branch: string | null }) => {
      if (!activeWorkspace) return;
      openTab(activeWorkspace.id, activeWorkspace.activePaneId, {
        id: newTabId(),
        kind: "git-history",
        repoRoot: args.repoRoot,
      });
    },
    [activeWorkspace, openTab],
  );

  const openBrowserInTab = useCallback(
    (url: string) => {
      if (!activeWorkspace) return undefined;
      const tabId = newTabId();
      openTab(activeWorkspace.id, activeWorkspace.activePaneId, {
        id: tabId,
        kind: "browser",
        url,
      });
      if (!url) {
        setTimeout(
          () => browserHandles.current.get(tabId)?.focusAddressBar(),
          0,
        );
      }
      return tabId;
    },
    [activeWorkspace, openTab],
  );

  fileLinkHandlerRef.current = (path, cwd, line, _col, sourceTabId) => {
    let absPath = path;
    if (path.startsWith("~/")) {
      absPath = home ? `${home}/${path.slice(2)}` : path;
    } else if (!path.startsWith("/") && cwd) {
      absPath = `${cwd}/${path}`;
    }
    void invoke<{ kind: "file" | "dir" | "symlink" }>("fs_stat", {
      path: absPath,
    })
      .then((stat) => {
        if (stat.kind === "dir") {
          focusSidebar(absPath, { fromShortcut: true });
          return;
        }
        const id = openFileInRightSplit(absPath, sourceTabId);
        if (id == null || line == null) return;
        const h = editorHandles.current.get(id);
        if (h) h.gotoLine(line);
        else pendingGotoLine.current.set(id, line);
      })
      .catch(() => {
        openFileInRightSplit(absPath, sourceTabId);
      });
  };

  cwdResolverRef.current = (leafId) => {
    const found = findTabGlobal(leafId);
    if (!found) return null;
    const p = found.tab;
    return p.kind === "terminal" ? (p.cwd ?? null) : null;
  };

  useEffect(() => {
    configureTerminalLinkBridge({
      onFileLink: (path, cwd, line, col, sourceTabId) =>
        fileLinkHandlerRef.current(path, cwd, line, col, sourceTabId),
      resolveLeafCwd: (leafId) => cwdResolverRef.current(leafId),
    });
  }, []);

  // ── Float browser callbacks ───────────────────────────────────────────────

  const onFloatBrowserTab = useCallback(
    (tabId: string) => {
      const found = findTabGlobal(tabId);
      if (!found || found.tab.kind !== "browser") return;
      void floatTab(found.tab, found.workspace.id);
    },
    [findTabGlobal, floatTab],
  );

  const onDockBrowserTab = useCallback(
    (tabId: string) => {
      void dockViaCommand(tabId);
    },
    [dockViaCommand],
  );

  const onFocusFloatBrowserTab = useCallback(
    (tabId: string) => {
      void focusFloatWindow(tabId);
    },
    [focusFloatWindow],
  );

  const onNavigateFloatBrowserTab = useCallback(
    (tabId: string, url: string) => {
      void navigateFloatWindow(tabId, url);
    },
    [navigateFloatWindow],
  );

  // ── WorkspaceView stable callbacks (use refs to avoid recreating on cd) ──

  // Closes the scratchpad of the tab being left, and, on a cross-pane
  // activation, also of the abandoned pane's active tab, regardless of how
  // the switch was triggered (mouse click, tab.next/prev/selectByIndex).
  // Centralized here so every activation path shares one implementation.
  const onActivateTabStable = useCallback(
    (wsId: string, tabId: string) => {
      const ws = workspacesRef.current.find((w) => w.id === wsId);
      if (ws) {
        for (const leafId of scratchpadLeafsToClose(
          allPanes(ws.paneTree),
          ws.activePaneId,
          tabId,
        )) {
          leaveLeafScratchpad(leafId);
        }
      }
      activateTab(wsId, tabId);
    },
    [activateTab],
  );

  const onCloseTabStable = useCallback((_wsId: string, tabId: string) => {
    closeTabsRef.current([tabId]);
  }, []);

  const onCloseManyTabsStable = useCallback(
    (_wsId: string, tabIds: string[]) => {
      closeTabsRef.current(tabIds);
    },
    [],
  );

  // Explicit close when leaving a pane: keyboard and programmatic pane/
  // workspace switches move no DOM focus, so the blur can never cover them.
  const leaveActivePaneScratchpad = useCallback(
    (wsId: string, nextPaneId: string | null) => {
      const ws = workspacesRef.current.find((w) => w.id === wsId);
      if (!ws || ws.activePaneId === nextPaneId) return;
      const fromPane = findPane(ws.paneTree, ws.activePaneId);
      if (fromPane?.activeTabId) leaveLeafScratchpad(fromPane.activeTabId);
    },
    [],
  );

  const onFocusPaneStable = useCallback(
    (wsId: string, paneId: string) => {
      leaveActivePaneScratchpad(wsId, paneId);
      focusPane(wsId, paneId);
    },
    [focusPane, leaveActivePaneScratchpad],
  );

  const onNewTerminalStable = useCallback(
    (wsId: string, paneId: string) => openNewTerminal(paneId, wsId),
    [openNewTerminal],
  );

  const onSplitTerminalRightStable = useCallback(
    (wsId: string, paneId: string) => {
      const { paneSplitLimit, workspacePaneLimit } =
        usePreferencesStore.getState();
      const ws = workspacesRef.current.find((w) => w.id === wsId);
      if (!ws) return;
      if (allPanes(ws.paneTree).length >= workspacePaneLimit) {
        toastSplitBlocked("pane-limit", workspacePaneLimit);
        return;
      }
      const el = document.querySelector<HTMLElement>(
        `[data-pane-id="${paneId}"]`,
      );
      if (!el || el.getBoundingClientRect().width < paneSplitLimit.width) {
        toastSplitBlocked("too-narrow");
        return;
      }
      const newPaneId = splitPane(wsId, paneId, "horizontal");
      setZenPaneId(null);
      const { terminalNewFolderMode } = usePreferencesStore.getState();
      openTab(wsId, newPaneId, {
        id: newTabId(),
        kind: "terminal",
        cwd: resolveNewTerminalCwd({
          mode: terminalNewFolderMode,
          home: homeRef.current,
          lastFolder: scriptFocusFolderRef.current ?? ws.cwd ?? null,
          workspaceRoot: ws.workspaceRoot ?? ws.fsRoot ?? null,
        }),
      });
    },
    [splitPane, openTab],
  );

  const onSplitTerminalDownStable = useCallback(
    (wsId: string, paneId: string) => {
      const { paneSplitLimit, workspacePaneLimit } =
        usePreferencesStore.getState();
      const ws = workspacesRef.current.find((w) => w.id === wsId);
      if (!ws) return;
      if (allPanes(ws.paneTree).length >= workspacePaneLimit) {
        toastSplitBlocked("pane-limit", workspacePaneLimit);
        return;
      }
      const el = document.querySelector<HTMLElement>(
        `[data-pane-id="${paneId}"]`,
      );
      if (!el || el.getBoundingClientRect().height < paneSplitLimit.height) {
        toastSplitBlocked("too-short");
        return;
      }
      const newPaneId = splitPane(wsId, paneId, "vertical");
      setZenPaneId(null);
      const { terminalNewFolderMode } = usePreferencesStore.getState();
      openTab(wsId, newPaneId, {
        id: newTabId(),
        kind: "terminal",
        cwd: resolveNewTerminalCwd({
          mode: terminalNewFolderMode,
          home: homeRef.current,
          lastFolder: scriptFocusFolderRef.current ?? ws.cwd ?? null,
          workspaceRoot: ws.workspaceRoot ?? ws.fsRoot ?? null,
        }),
      });
    },
    [splitPane, openTab],
  );

  const onNewBrowserStable = useCallback(
    (wsId: string, paneId: string) => {
      const tabId = newTabId();
      openTab(wsId, paneId, { id: tabId, kind: "browser", url: "" });
      setTimeout(() => browserHandles.current.get(tabId)?.focusAddressBar(), 0);
    },
    [openTab],
  );

  const onSplitBrowserRightStable = useCallback(
    (wsId: string, paneId: string) => {
      const { paneSplitLimit, workspacePaneLimit } =
        usePreferencesStore.getState();
      const ws = workspacesRef.current.find((w) => w.id === wsId);
      if (!ws) return;
      if (allPanes(ws.paneTree).length >= workspacePaneLimit) {
        toastSplitBlocked("pane-limit", workspacePaneLimit);
        return;
      }
      const el = document.querySelector<HTMLElement>(
        `[data-pane-id="${paneId}"]`,
      );
      if (!el || el.getBoundingClientRect().width < paneSplitLimit.width) {
        toastSplitBlocked("too-narrow");
        return;
      }
      const newPaneId = splitPane(wsId, paneId, "horizontal");
      setZenPaneId(null);
      const tabId = newTabId();
      openTab(wsId, newPaneId, { id: tabId, kind: "browser", url: "" });
      setTimeout(() => browserHandles.current.get(tabId)?.focusAddressBar(), 0);
    },
    [splitPane, openTab],
  );

  const onSplitBrowserDownStable = useCallback(
    (wsId: string, paneId: string) => {
      const { paneSplitLimit, workspacePaneLimit } =
        usePreferencesStore.getState();
      const ws = workspacesRef.current.find((w) => w.id === wsId);
      if (!ws) return;
      if (allPanes(ws.paneTree).length >= workspacePaneLimit) {
        toastSplitBlocked("pane-limit", workspacePaneLimit);
        return;
      }
      const el = document.querySelector<HTMLElement>(
        `[data-pane-id="${paneId}"]`,
      );
      if (!el || el.getBoundingClientRect().height < paneSplitLimit.height) {
        toastSplitBlocked("too-short");
        return;
      }
      const newPaneId = splitPane(wsId, paneId, "vertical");
      setZenPaneId(null);
      const tabId = newTabId();
      openTab(wsId, newPaneId, { id: tabId, kind: "browser", url: "" });
      setTimeout(() => browserHandles.current.get(tabId)?.focusAddressBar(), 0);
    },
    [splitPane, openTab],
  );

  const onDividerChangeStable = useCallback(
    (wsId: string, splitId: string, pos: number) =>
      setPaneDivider(wsId, splitId, pos),
    [setPaneDivider],
  );

  const onOpenCommitFileStable = useCallback(
    (params: {
      repoRoot: string;
      sha: string;
      path: string;
      originalPath: string | null;
      pin: boolean;
    }) => {
      const ws = workspacesRef.current.find((w) => w.id === activeWorkspaceId);
      if (!ws) return;
      const candidate: DiffIdentity = {
        kind: "git-commit-file",
        repoRoot: params.repoRoot,
        sha: params.sha,
        path: params.path,
      };
      const plan = planDiffTabOpen(
        allPanes(ws.paneTree),
        ws.activePaneId,
        candidate,
        params.pin,
      );
      if (plan.action === "activate") {
        if (plan.shouldUnpin) {
          updateTabData(ws.id, plan.tabId, (p) =>
            p.kind === "git-commit-file" ? { ...p, preview: false } : p,
          );
        }
        activateTab(ws.id, plan.tabId);
        flashTab(plan.tabId);
        return;
      }
      const newTab: Tab = {
        id: newTabId(),
        kind: "git-commit-file",
        repoRoot: params.repoRoot,
        sha: params.sha,
        path: params.path,
        originalPath: params.originalPath,
        preview: !params.pin,
      };
      if (plan.action === "replace") {
        replaceTab(ws.id, plan.paneId, plan.oldTabId, newTab);
        return;
      }
      openPlannedDiffTab(ws.id, ws.activePaneId, plan, newTab);
    },
    [activeWorkspaceId, activateTab, updateTabData, replaceTab, openPlannedDiffTab],
  );

  // ── TabCallbacks ─────────────────────────────────────────────────────────

  const handlePathRenamed = useCallback(
    (from: string, to: string) => {
      for (const ws of workspacesRef.current) {
        for (const pane of allPanes(ws.paneTree)) {
          for (const tab of pane.tabs) {
            if (tab.kind !== "editor" && tab.kind !== "markdown") continue;
            const ep = tab as { path: string };
            if (ep.path === from) {
              const i = to.lastIndexOf("/");
              updateTabData(ws.id, tab.id, (p) =>
                p.kind === "editor" || p.kind === "markdown"
                  ? { ...p, path: to, title: i === -1 ? to : to.slice(i + 1) }
                  : p,
              );
            } else if (ep.path.startsWith(`${from}/`)) {
              const newPath = `${to}${ep.path.slice(from.length)}`;
              const i = newPath.lastIndexOf("/");
              updateTabData(ws.id, tab.id, (p) =>
                p.kind === "editor" || p.kind === "markdown"
                  ? {
                      ...p,
                      path: newPath,
                      title: i === -1 ? newPath : newPath.slice(i + 1),
                    }
                  : p,
              );
            }
          }
        }
      }
    },
    [updateTabData],
  );

  const handleRenameFileFromTab = useCallback(
    async (tabId: string, newName: string) => {
      const found = findTabGlobal(tabId);
      if (!found) return;
      const foundTab = found.tab;
      if (foundTab.kind !== "editor" && foundTab.kind !== "markdown") return;
      const oldPath = foundTab.path;
      const lastSlash = oldPath.lastIndexOf("/");
      const parent = lastSlash >= 0 ? oldPath.slice(0, lastSlash) : oldPath;
      const newPath = `${parent}/${newName}`;
      try {
        await native.renameFile(oldPath, newPath);
        handlePathRenamed(oldPath, newPath);
        sidebarRef.current?.refreshExplorer(parent);
      } catch (e) {
        toast.error("Failed to rename file", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [findTabGlobal, handlePathRenamed],
  );

  // ── Close guards ──────────────────────────────────────────────────────────

  const saveTab = useCallback(async (tabId: string) => {
    const markdownHandle = markdownHandles.current.get(tabId);
    if (markdownHandle) {
      await markdownHandle.save();
      return;
    }
    await editorHandles.current.get(tabId)?.save();
  }, []);

  const reportSaveError = useCallback((tabId: string, err: unknown) => {
    const tab = workspacesRef.current
      .flatMap((w) => allPanes(w.paneTree))
      .flatMap((p) => p.tabs)
      .find((t) => t.id === tabId);
    const name = tab && "path" in tab ? tab.path.split(/[\\/]/).pop() : tabId;
    toast.error(`Could not save ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }, []);

  const saveTabReportingErrors = useCallback(
    async (tabId: string): Promise<string | null> => {
      try {
        await saveTab(tabId);
        return null;
      } catch (err) {
        reportSaveError(tabId, err);
        return err instanceof Error ? err.message : String(err);
      }
    },
    [saveTab, reportSaveError],
  );

  // Autosave-on-focus-loss: save every dirty editor (save() no-ops when clean).
  // Gated on the autosave preference; triggered by tab/workspace switch, window
  // blur, tab close, and app close.
  const flushDirtyEditors = useCallback(async () => {
    if (!usePreferencesStore.getState().editorAutoSave) return;
    const tabIds = new Set([
      ...editorHandles.current.keys(),
      ...markdownHandles.current.keys(),
    ]);
    await Promise.all(
      [...tabIds].map((tabId) => saveTab(tabId).catch(() => {})),
    );
  }, [saveTab]);
  const flushDirtyEditorsRef = useRef(flushDirtyEditors);
  flushDirtyEditorsRef.current = flushDirtyEditors;

  const goToTab = useCallback(
    (tabId: string) => {
      const found = findTabGlobal(tabId);
      if (!found) return;
      setActiveWorkspaceId(found.workspace.id);
      activateTab(found.workspace.id, tabId);
      requestLeafFocus(tabId);
    },
    [activateTab, findTabGlobal, setActiveWorkspaceId],
  );

  const saveWorkspaceDocs = useCallback(
    async (workspaceId: string) => {
      const ws = workspacesRef.current.find((w) => w.id === workspaceId);
      if (!ws) return false;
      const ids = allPanes(ws.paneTree)
        .flatMap((p) => p.tabs)
        .filter((t) => t.kind === "editor" || t.kind === "markdown")
        .map((t) => t.id);
      const results = await Promise.all(
        ids.map((id) =>
          saveTab(id).then(
            () => true,
            () => false,
          ),
        ),
      );
      return results.every(Boolean);
    },
    [saveTab],
  );

  const hibernateFlow = useHibernateFlow({
    workspacesRef,
    saveWorkspaceDocs,
    isActive: (id) => activeWorkspaceIdRef.current === id,
    hibernateWorkspace,
    flushDirtyEditors,
    destroyWorkspaceFloats,
  });
  const { requestHibernate, performHibernate, requestAutoHibernate } = hibernateFlow;
  useAutoHibernate({ workspacesRef, activeWorkspaceIdRef, requestAutoHibernate });
  const pendingHibernateRef = useRef<string | null>(null);
  pendingHibernateRef.current = hibernateFlow.pendingWorkspaceId;
  const { cancel: cancelHibernate } = hibernateFlow;
  useEffect(() => {
    if (isPendingStale(hibernateFlow.pendingWorkspaceId, workspaces)) cancelHibernate();
  }, [hibernateFlow.pendingWorkspaceId, workspaces, cancelHibernate]);
  const handleHibernateFromDialog = useCallback(() => {
    const id = pendingHibernateRef.current;
    if (id) void performHibernate(id);
  }, [performHibernate]);

  const closeFlow = useCloseWorkspaceFlow({
    workspacesRef,
    flushDirtyEditors,
    collectProcesses: (ws) =>
      collectRunningTerminals(ws, leafHasForegroundProcess, (id) =>
        getRunningCommandsSnapshot().get(id),
      ),
    close: handleCloseWorkspace,
  });
  const requestCloseWorkspace = closeFlow.requestClose;
  useEffect(() => {
    if (isPendingStale(closeFlow.pending?.id ?? null, workspaces)) closeFlow.cancel();
  }, [closeFlow, workspaces]);

  useEffect(() => {
    setEditorFlush(() => flushDirtyEditorsRef.current());
    return () => setEditorFlush(null);
  }, []);

  const focusTab = useCallback(
    (tabId: string) => {
      const kind = findTabGlobal(tabId)?.tab.kind;
      requestAnimationFrame(() => {
        if (kind === "editor") editorHandles.current.get(tabId)?.focus();
        else requestLeafFocus(tabId);
      });
    },
    [findTabGlobal],
  );

  const focusActiveTab = useCallback(() => {
    const ws = workspacesRef.current.find(
      (w) => w.id === activeWorkspaceIdRef.current,
    );
    if (!ws) return;
    const pane = findPane(ws.paneTree, ws.activePaneId);
    const tabId = pane?.activeTabId;
    if (!tabId) return;
    focusTab(tabId);
  }, [focusTab]);

  const handleMoveTabToWorkspace = useCallback(
    async (sourceWorkspaceId: string, tabId: string, request: TabMoveRequest): Promise<string | null> => {
      const destinationId = await moveTabToWorkspace(sourceWorkspaceId, tabId, request);
      if (destinationId) {
        useAgentStore.getState().reassignTabWorkspace(tabId, destinationId);
        requestAnimationFrame(focusActiveTab);
      }
      return destinationId;
    },
    [moveTabToWorkspace, focusActiveTab],
  );

  // The current tab of its workspace takes the focus with it, from the menu and
  // from a drag alike. A drag may already have switched to the destination by
  // hovering it, so there the source does not have to be the active workspace.
  const handleMoveTabFollowingFocus = useCallback(
    async (sourceWorkspaceId: string, tabId: string, request: TabMoveRequest, fromDrag = false): Promise<string | null> => {
      const source = workspacesRef.current.find((w) => w.id === sourceWorkspaceId);
      const wasCurrent = !!source && findPane(source.paneTree, source.activePaneId)?.activeTabId === tabId;
      const hadFocus = wasCurrent && (fromDrag || activeWorkspaceIdRef.current === sourceWorkspaceId);
      const destinationId = await handleMoveTabToWorkspace(sourceWorkspaceId, tabId, request);
      if (hadFocus && destinationId) {
        setActiveWorkspaceId(destinationId);
        activateTab(destinationId, tabId);
        setTimeout(focusActiveTab, 50);
      }
      return destinationId;
    },
    [handleMoveTabToWorkspace, setActiveWorkspaceId, activateTab, focusActiveTab],
  );

  const handleMoveTabFromMenu = useCallback(
    async (sourceWorkspaceId: string, tabId: string, request: TabMoveRequest): Promise<void> => {
      await handleMoveTabFollowingFocus(sourceWorkspaceId, tabId, request);
    },
    [handleMoveTabFollowingFocus],
  );

  const handleDropTabOnWorkspace = useCallback(
    (sourceWorkspaceId: string, tabId: string, request: TabMoveRequest) =>
      handleMoveTabFollowingFocus(sourceWorkspaceId, tabId, request, true),
    [handleMoveTabFollowingFocus],
  );

  const {
    pendingCloseTab,
    pendingTerminalCloseTab,
    pendingDeleteTabs,
    closeTabs,
    resolveEditor,
    resolveTerminal,
    confirmDeleteClose,
    cancelDeleteClose,
    handlePathDeleted,
  } = useTabCloseGuards({
    workspaces,
    disposeTab: (workspaceId, tabId) => {
      const found = findTabGlobal(tabId);
      if (found?.tab.kind === "browser" && found.tab.floating) {
        void closeFloatWindow(tabId);
      }
      closeTab(workspaceId, tabId);
    },
    findTab: findTabGlobal,
    saveTab,
    reportSaveError,
    focusActiveTab,
    isWarnEnabled: () =>
      usePreferencesStore.getState().warnOnCloseTabWithRunningProcess,
    setWarnEnabled: setWarnOnCloseTabWithRunningProcess,
    isAutoSaveEnabled: () => usePreferencesStore.getState().editorAutoSave,
  });

  closeTabsRef.current = closeTabs;

  // ── Path rename ───────────────────────────────────────────────────────────

  // ── useEditorFileSync (editor tab shim) ─────────────────────────────────

  type EditorShim = {
    kind: "editor";
    id: string;
    path: string;
    dirty: boolean;
    preview: boolean;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const editorTabs = useMemo<EditorShim[]>(() => {
    const acc: EditorShim[] = [];
    for (const ws of workspaces) {
      for (const pane of allPanes(ws.paneTree)) {
        for (const tab of pane.tabs) {
          if (tab.kind === "editor") {
            const ep = tab as EditorShim;
            acc.push({
              kind: "editor",
              id: ep.id,
              path: ep.path,
              dirty: ep.dirty,
              preview: ep.preview,
            });
          } else if (tab.kind === "markdown") {
            // A markdown tab is synced like a real "editor" tab; when it has no
            // registered editor handle, reload() is a no-op.
            acc.push({
              kind: "editor",
              id: tab.id,
              path: tab.path,
              dirty: tab.dirty ?? false,
              preview: false,
            });
          }
        }
      }
    }
    return acc;
  }, [workspaces]);
  const editorTabsRef = useRef(editorTabs);
  editorTabsRef.current = editorTabs;

  useEditorFileSync({
    tabs: editorTabs,
    tabsRef: editorTabsRef,
    editorRefs: editorHandles,
  });

  // ── useThemeFileEditing ───────────────────────────────────────────────────

  useThemeFileEditing({
    tabsRef: editorTabsRef,
    openFileTab: (path) => openFileInTab(path, true),
  });

  // ── Source control ────────────────────────────────────────────────────────

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(!sidebarStateRef.current.open);
  }, [setSidebarOpen]);

  const navigateSidebarTo = useCallback(
    (tab: "explorer" | "git" | "history") => {
      const sidebar = sidebarStateRef.current;
      if (!sidebar.open) {
        setSidebarOpen(true);
        setSidebarView(tab);
      } else if (sidebar.view === tab) {
        setSidebarOpen(false);
      } else {
        setSidebarView(tab);
      }
    },
    [setSidebarOpen, setSidebarView],
  );

  const showSidebarView = useCallback(
    (tab: SidebarView) => {
      if (!sidebarStateRef.current.open) {
        setSidebarOpen(true);
      }
      setSidebarView(tab);
    },
    [setSidebarOpen, setSidebarView],
  );

  const showExplorerWithMode = useCallback(
    (mode: ExplorerRootMode) => {
      if (!sidebarStateRef.current.open) {
        setSidebarOpen(true);
      }
      setSidebarView("explorer");
      handleChangeRootMode(mode);
    },
    [handleChangeRootMode, setSidebarOpen, setSidebarView],
  );

  // Cmd+E: bring up the explorer, then on each press cycle its root between File
  // System and Workspace Root. With no pinned root the cycle stays on File
  // System (idempotent). It never closes the sidebar (use sidebar.toggle).
  const rotateExplorerRoot = useCallback(() => {
    const sidebar = sidebarStateRef.current;
    const inExplorer = sidebar.open && sidebar.view === "explorer";
    if (!inExplorer) {
      showSidebarView("explorer");
      return;
    }
    const mode = activeWorkspace?.explorerRootMode ?? "filesystem";
    if (mode === "filesystem") {
      if (activeWorkspace?.workspaceRoot) handleChangeRootMode("workspace");
    } else {
      handleChangeRootMode("filesystem");
    }
  }, [activeWorkspace, handleChangeRootMode, showSidebarView]);

  const { sourceControl, toggleSourceControl, openGitGraphFromContext } =
    useSourceControlContext({
      explorerRoot,
      launchCwd,
      launchCwdResolved,
      home,
      cycleSidebarView: () => navigateSidebarTo("git"),
      openCommitHistoryTab: openGitHistoryInTab,
    });

  // Git root for explorer tree decorations and the gitignore action follows the
  // same repo Source Control resolves from explorerRoot (single source of truth).
  const gitRoot = sourceControl.repo?.repoRoot ?? null;

  const editorChromeWithGit = useMemo(
    () => ({ ...editorChrome, gitRootPath: gitRoot }),
    [editorChrome, gitRoot],
  );

  const handleAddToGitignore = useCallback(
    async (path: string, isDir: boolean) => {
      if (!gitRoot) return;
      const entry = gitignoreEntryFor(gitRoot, path, isDir);
      if (!entry) return;
      const gitignorePath = `${gitRoot}/.gitignore`;

      // When .gitignore is open in an editor the buffer is the source of truth:
      // edit it there so unsaved changes are never clobbered, regardless of
      // autosave. The user saves it like any other edit.
      const open = editorTabsRef.current.find((p) => p.path === gitignorePath);
      const handle = open ? editorHandles.current.get(open.id) : undefined;
      if (handle) {
        const buffer = handle.getContent();
        if (buffer != null) {
          if (hasGitignoreEntry(buffer, entry)) {
            toast.info(`${entry} is already in .gitignore`);
          } else {
            handle.insertAtEnd(
              appendGitignoreEntry(buffer, entry).slice(buffer.length),
            );
          }
          openFileInTab(gitignorePath, true);
          return;
        }
      }

      // Not open (or not mounted yet): append on disk idempotently, then reveal.
      let content = "";
      try {
        const res = await native.readFile(gitignorePath);
        if (res.kind === "text") content = res.content;
      } catch {
        // No .gitignore yet: start from an empty file.
      }
      if (hasGitignoreEntry(content, entry)) {
        toast.info(`${entry} is already in .gitignore`);
      } else {
        await native.writeFile(
          gitignorePath,
          appendGitignoreEntry(content, entry),
        );
      }
      openFileInTab(gitignorePath, true);
    },
    [gitRoot, openFileInTab],
  );

  // ── Terminal helpers ──────────────────────────────────────────────────────

  const openFolderInTerminal = useCallback(
    (path: string) => {
      if (!activeWorkspace) return;
      const tabId = newTabId();
      openTab(activeWorkspace.id, activeWorkspace.activePaneId, {
        id: tabId,
        kind: "terminal",
        cwd: path,
      });
      setTimeout(() => requestLeafFocus(tabId), 80);
    },
    [activeWorkspace, openTab],
  );

  const newWorkspaceFromFolder = useCallback(
    (path: string) => {
      const wsId = addWorkspace(path);
      setWorkspaceRoot(wsId, path);
      setTimeout(() => {
        const ws = workspacesRef.current.find((w) => w.id === wsId);
        if (!ws) return;
        const pane = allPanes(ws.paneTree)[0];
        const tab = pane?.activeTabId
          ? pane.tabs.find((p) => p.id === pane.activeTabId)
          : pane?.tabs[0];
        if (tab) requestLeafFocus(tab.id);
      }, 80);
    },
    [addWorkspace, setWorkspaceRoot],
  );

  const tabCallbacks = useMemo<TabCallbacks>(
    () => ({
      onSearchReady: (tabId, addon) => {
        searchAddons.current.set(tabId, addon);
        if (tabId === activeTabId) setActiveSearchAddon(addon);
      },
      onExit: (tabId, _code) => {
        const found = findTabGlobal(tabId);
        if (found) closeTab(found.workspace.id, tabId);
      },
      onCwd: (tabId, cwd) => {
        const found = findTabGlobal(tabId);
        if (found) {
          setTerminalTabCwd(found.workspace.id, tabId, cwd);
          const isFocused =
            found.workspace.activePaneId === found.pane.id &&
            found.pane.activeTabId === tabId;
          if (isFocused) {
            setWorkspaceCwd(found.workspace.id, cwd);
            if (
              found.workspace.id === activeWorkspace?.id &&
              found.tab.kind === "terminal" &&
              isAutofocusActive(found.tab, autofocusMode)
            ) {
              focusSidebar(
                useAgentStore.getState().sessions[tabId]?.meta?.worktreeCwd ??
                  cwd,
                { fromShortcut: false },
              );
            }
          }
        }
      },
      onRunningCommand: (tabId, cmd, started) => {
        const found = findTabGlobal(tabId);
        if (found) setTerminalRunningCommand(found.workspace.id, tabId, cmd);
        const next = planCommandEvent(
          { cmd, started },
          scriptCommandSeen.current.has(tabId),
          getScriptRunningSnapshot().has(tabId),
        );
        if (next.seen) scriptCommandSeen.current.add(tabId);
        else scriptCommandSeen.current.delete(tabId);
        if (next.clearMark) setScriptRunning(tabId, false);
      },
      onScratchpadEnabled: (tabId, enabled) => {
        const found = findTabGlobal(tabId);
        if (found)
          updateTabData(found.workspace.id, tabId, (p) =>
            p.kind === "terminal" ? { ...p, scratchpadEnabled: enabled } : p,
          );
      },
      registerTerminalHandle: (tabId, h) => {
        if (h) terminalHandles.current.set(tabId, h);
        else terminalHandles.current.delete(tabId);
      },
      onEditorDirtyChange: (tabId, dirty) => {
        const found = findTabGlobal(tabId);
        if (found)
          updateTabData(found.workspace.id, tabId, (p) =>
            p.kind === "editor"
              ? { ...p, dirty, ...(dirty ? { preview: false } : {}) }
              : p.kind === "markdown"
                ? { ...p, dirty }
                : p,
          );
      },
      onEditorClose: (tabId) => {
        const found = findTabGlobal(tabId);
        if (found) closeTab(found.workspace.id, tabId);
      },
      onToggleOverlayPreview: (tabId) => {
        const found = findTabGlobal(tabId);
        if (found) toggleOverlayPreview(found.workspace.id, tabId);
      },
      onToggleSplitPreview: (tabId) => {
        const found = findTabGlobal(tabId);
        if (found) toggleSplitPreview(found.workspace.id, tabId);
      },
      registerEditorHandle: (tabId, h) => {
        if (h) {
          editorHandles.current.set(tabId, h);
          const line = pendingGotoLine.current.get(tabId);
          if (line != null) {
            pendingGotoLine.current.delete(tabId);
            h.gotoLine(line);
          }
        } else {
          editorHandles.current.delete(tabId);
        }
        if (tabId === activeTabId) setActiveEditorHandle(h);
      },
      registerMarkdownHandle: (tabId, handle) => {
        if (handle) markdownHandles.current.set(tabId, handle);
        else markdownHandles.current.delete(tabId);
      },
      onBrowserUrlChange: (tabId, url) => {
        const found = findTabGlobal(tabId);
        if (found)
          updateTabData(found.workspace.id, tabId, (p) =>
            p.kind === "browser" ? { ...p, url } : p,
          );
      },
      registerBrowserHandle: (tabId, h) => {
        if (h) browserHandles.current.set(tabId, h);
        else browserHandles.current.delete(tabId);
      },
      onOpenCommitFile: (input) => {
        if (!activeWorkspace) return;
        const candidate: DiffIdentity = {
          kind: "git-commit-file",
          repoRoot: input.repoRoot,
          sha: input.sha,
          path: input.path,
        };
        const plan = planDiffTabOpen(
          allPanes(activeWorkspace.paneTree),
          activeWorkspace.activePaneId,
          candidate,
          input.pin,
        );
        if (plan.action === "activate") {
          if (plan.shouldUnpin) {
            updateTabData(activeWorkspace.id, plan.tabId, (p) =>
              p.kind === "git-commit-file" ? { ...p, preview: false } : p,
            );
          }
          activateTab(activeWorkspace.id, plan.tabId);
          flashTab(plan.tabId);
          return;
        }
        const newTab: Tab = {
          id: newTabId(),
          kind: "git-commit-file",
          repoRoot: input.repoRoot,
          sha: input.sha,
          path: input.path,
          originalPath: input.originalPath,
          preview: !input.pin,
        };
        if (plan.action === "replace") {
          replaceTab(
            activeWorkspace.id,
            plan.paneId,
            plan.oldTabId,
            newTab,
          );
          return;
        }
        openPlannedDiffTab(
          activeWorkspace.id,
          activeWorkspace.activePaneId,
          plan,
          newTab,
        );
      },
      onGitHistorySearchHandle: (_tabId, handle) => {
        setGitHistoryHandle(handle);
      },
      onRenameTab: (tabId, title) => {
        const found = findTabGlobal(tabId);
        if (found)
          updateTabData(found.workspace.id, tabId, (p) => ({
            ...p,
            title,
          }));
      },
      onUpdateTab: (tabId, updater) => {
        const found = findTabGlobal(tabId);
        if (found) updateTabData(found.workspace.id, tabId, updater);
      },
      onNavigateGitDiffTab: (tabId, direction) => {
        const found = findTabGlobal(tabId);
        if (!found || found.tab.kind !== "git-diff") return;
        const next = sidebarRef.current?.navigateGitDiffEntry(
          {
            repoRoot: found.tab.repoRoot,
            path: found.tab.path,
            mode: found.tab.mode,
          },
          direction,
        );
        if (!next) return;
        updateTabData(found.workspace.id, tabId, (p) =>
          p.kind === "git-diff"
            ? {
                ...p,
                path: next.path,
                originalPath: next.originalPath,
                mode: next.mode,
              }
            : p,
        );
      },
      onRenameFile: (tabId, newName) => {
        void handleRenameFileFromTab(tabId, newName);
      },
      onFocusOnExplorer: (filePath, pendingAction) =>
        focusSidebar(filePath, { fromShortcut: true, pendingAction }),
      onSetAsRoot: handleSetAsRoot,
      onNewWorkspaceFromFolder: newWorkspaceFromFolder,
      onRevealInTerminal: openFolderInTerminal,
      onAddToGitignore: handleAddToGitignore,
      onOpenFile: (path) => void openFileInTab(path, true),
      isFileOpen: (path) =>
        activeWorkspace ? findOpenPathTab(activeWorkspace.paneTree, path) !== null : false,
    }),
    [
      autofocusMode,
      activeWorkspace,
      openFileInTab,
      activeTabId,
      findTabGlobal,
      closeTab,
      setTerminalTabCwd,
      setWorkspaceCwd,
      setTerminalRunningCommand,
      toggleOverlayPreview,
      toggleSplitPreview,
      updateTabData,
      activeWorkspace,
      openTab,
      openPlannedDiffTab,
      handleRenameFileFromTab,
      focusSidebar,
      handleSetAsRoot,
      newWorkspaceFromFolder,
      openFolderInTerminal,
      handleAddToGitignore,
    ],
  );

  const openContentHit = useCallback(
    (path: string, line: number) => {
      const id = openFileInTab(path, true);
      if (id == null) return;
      const h = editorHandles.current.get(id);
      if (h) h.gotoLine(line);
      else pendingGotoLine.current.set(id, line);
    },
    [openFileInTab],
  );

  const insertHistoryCommand = useMemo(
    () =>
      isTerminalTab && activeTabId !== null
        ? (cmd: string) => {
            writeToSession(activeTabId, cmd);
            requestLeafFocus(activeTabId);
          }
        : null,
    [isTerminalTab, activeTabId],
  );

  // ── Search ────────────────────────────────────────────────────────────────

  const searchTarget = useMemo<SearchTarget>(() => {
    if (isTerminalTab && activeTabId !== null && activeSearchAddon)
      return {
        kind: "terminal",
        addon: activeSearchAddon,
        focus: () => requestLeafFocus(activeTabId),
      };
    if (isEditorTab && activeEditorHandle)
      return {
        kind: "editor",
        handle: activeEditorHandle,
        focus: () => activeEditorHandle.focus(),
      };
    if (isGitHistoryTab && gitHistoryHandle)
      return {
        kind: "git-history",
        handle: gitHistoryHandle,
        focus: () => {},
      };
    return null;
  }, [
    isTerminalTab,
    isEditorTab,
    isGitHistoryTab,
    activeTabId,
    activeSearchAddon,
    activeEditorHandle,
    gitHistoryHandle,
  ]);

  const onExplorerSearchClose = useCallback(() => {
    searchTarget?.focus();
  }, [searchTarget]);

  // ── Shortcuts ─────────────────────────────────────────────────────────────

  const [zenPaneId, setZenPaneId] = useState<string | null>(null);

  useLayoutEffect(() => {
    setZenPaneId(null);
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (zenPaneId !== null && activeWorkspace?.activePaneId !== zenPaneId) {
      setZenPaneId(null);
    }
  }, [activeWorkspace?.activePaneId, zenPaneId]);

  const handleCloseActiveTab = useCallback(() => {
    if (!activeWorkspace) return;
    if (!activeTabId) {
      // Empty pane (workspace with no tabs): Cmd+W closes the workspace.
      void requestCloseWorkspace(activeWorkspace.id);
      return;
    }
    if (
      (activeTab?.kind === "terminal" || activeTab?.kind === "editor") &&
      activeTab.locked
    ) {
      flashLockIcon(activeTabId);
      return;
    }
    closeTabsRef.current([activeTabId]);
  }, [activeWorkspace, activeTabId, activeTab, requestCloseWorkspace]);

  const handleCloseOtherTabs = useCallback(() => {
    if (!activePane || !activeTabId) return;
    const ids = otherBulkClosableIds(activePane.tabs, activeTabId);
    if (ids.length) closeTabsRef.current(ids);
  }, [activePane, activeTabId]);

  const handleCloseAllTabs = useCallback(() => {
    if (!activePane) return;
    const ids = bulkClosableIds(activePane.tabs);
    if (ids.length) closeTabsRef.current(ids);
  }, [activePane]);

  const tabCallbacksRef = useRef(tabCallbacks);
  tabCallbacksRef.current = tabCallbacks;
  const saveTabRef = useRef(saveTabReportingErrors);
  saveTabRef.current = saveTabReportingErrors;
  const sidebarTabMenu = useSidebarTabMenuActions({ workspacesRef, closeTabsRef, saveTabRef, tabCallbacksRef });

  const cycleWorkspace = useCallback(
    (delta: 1 | -1) => {
      const visible = visibleWorkspaceOrder(
        workspaces,
        groups,
        collapsedGroups,
        activeWorkspaceId,
      );
      if (visible.length < 2) return;
      const idx = visible.findIndex((w) => w.id === activeWorkspaceId);
      const baseIdx = idx === -1 ? 0 : idx;
      const nextIdx = (baseIdx + delta + visible.length) % visible.length;
      setActiveWorkspaceId(visible[nextIdx].id);
    },
    [
      workspaces,
      groups,
      collapsedGroups,
      activeWorkspaceId,
      setActiveWorkspaceId,
    ],
  );

  function focusPaneInDirection(dir: "up" | "down" | "left" | "right") {
    if (!activeWorkspace) return;
    if (zenPaneId !== null) {
      setZenPaneId(null);
      return;
    }
    const paneIds = new Set(
      allPanes(activeWorkspace.paneTree).map((p) => p.id),
    );
    const rects = new Map<string, Rect>();
    for (const el of document.querySelectorAll<HTMLElement>("[data-pane-id]")) {
      const id = el.dataset.paneId;
      if (id && paneIds.has(id)) rects.set(id, el.getBoundingClientRect());
    }
    const target = findPaneInDirection(
      activeWorkspace.activePaneId,
      dir,
      rects,
    );
    if (target) {
      leaveActivePaneScratchpad(activeWorkspace.id, target);
      focusPane(activeWorkspace.id, target);
    }
  }

  const doSplitRight = useCallback(() => {
    if (!activeWorkspace) return;
    onSplitTerminalRightStable(
      activeWorkspace.id,
      activeWorkspace.activePaneId,
    );
  }, [activeWorkspace, onSplitTerminalRightStable]);

  const doSplitDown = useCallback(() => {
    if (!activeWorkspace) return;
    onSplitTerminalDownStable(activeWorkspace.id, activeWorkspace.activePaneId);
  }, [activeWorkspace, onSplitTerminalDownStable]);

  const handleExplorerSearch = useCallback(() => {
    const sidebar = sidebarStateRef.current;
    if (sidebar.open && sidebar.view === "explorer") {
      sidebarRef.current?.toggleExplorerSearch?.();
    } else {
      pendingExplorerSearch.current = true;
      setSidebarOpen(true);
      setSidebarView("explorer");
    }
  }, [setSidebarOpen, setSidebarView]);

  const welcomeActions = useMemo<WelcomeActions>(
    () => ({
      onNewTerminal: () => openNewTerminal(),
      onNewBrowser: () => openBrowserInTab(""),
      onSearchFiles: handleExplorerSearch,
      onCommandPalette: () => openCommandPalette("commands"),
      onSettings: () => void openSettingsWindow(),
    }),
    [
      openNewTerminal,
      openBrowserInTab,
      handleExplorerSearch,
      openCommandPalette,
    ],
  );

  const shortcutHandlers = useMemo<ShortcutHandlers>(
    () => ({
      "commandPalette.open": () => openCommandPalette("commands"),
      "commandPalette.content": () => openCommandPalette("content"),
      "tab.new": () => {
        openNewTerminal();
      },
      "workspace.new": () => addWorkspace(home ?? undefined),
      "workspace.close": () => {
        if (activeWorkspace) void requestCloseWorkspace(activeWorkspace.id);
      },
      "workspace.rename": () => {
        useContextMenuCloseStore.getState().closeAll();
        if (activeWorkspaceId)
          useWorkspaceRenameStore.getState().startRename(activeWorkspaceId);
      },
      "workspace.settings": () => {
        if (activeWorkspaceId) {
          const store = useWorkspaceSettingsStore.getState();
          if (store.open && store.workspaceId === activeWorkspaceId) {
            store.closeSettings();
          } else {
            store.openSettings(activeWorkspaceId);
          }
        }
      },
      "workspace.hibernate": () => {
        if (!activeWorkspace || !claimToggle(activeWorkspace.id)) return;
        if (activeWorkspace.hibernated) void wakeWorkspace(activeWorkspace.id);
        else void requestHibernate(activeWorkspace.id);
      },
      "workspace.run": () => {
        if (!activeWorkspace) return;
        const configs = activeWorkspace.scripts ?? [];
        if (configs.length === 0) return;
        const active =
          configs.find((c) => c.id === activeWorkspace.activeScript) ??
          configs[0];
        if (!active) return;
        const isRunning = !!(
          active.tabId && getScriptRunningSnapshot().get(active.tabId)
        );
        if (isRunning) {
          stopWorkspaceConfig(active);
        } else {
          runWorkspaceConfig(active);
        }
      },
      "tab.newBrowser": () => openBrowserInTab(""),
      "tab.newEditor": () => setNewEditorOpen(true),
      "tab.close": handleCloseActiveTab,
      "tab.reopenClosed": () => {
        if (activeWorkspace) reopenClosed();
      },
      "tab.rename": () => {
        const active = document.activeElement;
        const tag = active?.tagName;
        const store = useTabRenameStore.getState();
        const action = resolveRenameShortcut({
          renamingTabId: store.renamingTabId,
          activeTabId,
          inTextField:
            (tag === "INPUT" || tag === "TEXTAREA") &&
            !active?.classList.contains("xterm-helper-textarea"),
        });
        if (action === "start" && activeTabId) {
          useContextMenuCloseStore.getState().closeAll();
          store.startRename(activeTabId);
        }
        else if (action === "save") store.requestSave();
      },
      "tab.note": () => {
        if (!activeTabId || !activeTab) return;
        const found = findTabGlobal(activeTabId);
        if (!found) return;
        flushTabNote(activeTabId);
        const closing = isTabNoteOpen(activeTab);
        if (!closing) useTabNoteStore.getState().requestFocus(activeTabId);
        updateTabData(found.workspace.id, activeTabId, toggleTabNote);
        if (closing && document.activeElement?.closest("[data-tab-note]")) requestLeafFocus(activeTabId);
      },
      "file.rename": () => {
        const active = document.activeElement;
        const tag = active?.tagName;
        if (
          (tag === "INPUT" || tag === "TEXTAREA") &&
          !active?.classList.contains("xterm-helper-textarea")
        )
          return;
        if (!activeTabId) return;
        const tab = findTabGlobal(activeTabId)?.tab;
        if (tab?.kind === "editor" || tab?.kind === "markdown") {
          useFileRenameStore.getState().trigger(activeTabId);
        }
      },
      "editor.cycleView": () => {
        if (!activeTab || !activeTabId || !activeWorkspaceId) return;
        if (isPreviewableEditorTab(activeTab)) {
          toggleOverlayPreview(activeWorkspaceId, activeTabId);
        } else if (activeTab.kind === "markdown") {
          markdownHandles.current.get(activeTabId)?.cycleView();
        }
      },
      "markdown.toggleOutline": () => {
        if (activeTab?.kind !== "markdown" || !activeTabId) return;
        markdownHandles.current.get(activeTabId)?.toggleOutline();
      },
      "editor.preview.toggleSplit": () => {
        if (!activeTab || !activeTabId || !activeWorkspaceId) return;
        if (isPreviewableEditorTab(activeTab)) {
          toggleSplitPreview(activeWorkspaceId, activeTabId);
        }
      },
      "editor.save": () => {
        if (!activeTabId) return;
        const markdownHandle = markdownHandles.current.get(activeTabId);
        if (markdownHandle) {
          markdownHandle.save().catch((err) =>
            toast.error("Save failed", {
              description: err instanceof Error ? err.message : String(err),
            }),
          );
          return;
        }
        const handle = editorHandles.current.get(activeTabId);
        if (handle) void handle.save();
      },
      "tab.next": () => {
        if (!activeWorkspace || !activePane) return;
        const tabs = activePane.tabs;
        if (tabs.length < 2) return;
        const idx = tabs.findIndex((p) => p.id === activePane.activeTabId);
        const next = tabs[(idx + 1) % tabs.length];
        onActivateTabStable(activeWorkspace.id, next.id);
      },
      "tab.prev": () => {
        if (!activeWorkspace || !activePane) return;
        const tabs = activePane.tabs;
        if (tabs.length < 2) return;
        const idx = tabs.findIndex((p) => p.id === activePane.activeTabId);
        const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
        onActivateTabStable(activeWorkspace.id, prev.id);
      },
      "tab.selectByIndex": (e) => {
        if (!activeWorkspace || !activePane) return;
        const tabs = activePane.tabs;
        if (tabs.length === 0) return;
        const digit = parseInt(e.key, 10);
        const idx = digit === 0 ? tabs.length - 1 : digit - 1;
        if (idx >= 0 && idx < tabs.length)
          onActivateTabStable(activeWorkspace.id, tabs[idx].id);
      },
      "pane.splitRight": doSplitRight,
      "pane.splitDown": doSplitDown,
      "pane.focusUp": () => focusPaneInDirection("up"),
      "pane.focusDown": () => focusPaneInDirection("down"),
      "pane.focusLeft": () => focusPaneInDirection("left"),
      "pane.focusRight": () => focusPaneInDirection("right"),
      "sidebar.toggle": toggleSidebar,
      "sidebar.showExplorer": rotateExplorerRoot,
      "sidebar.showGit": () => showSidebarView("git"),
      "sidebar.showHistory": () => showSidebarView("history"),
      "sidebar.showNotes": () => {
        if (activeWorkspace?.workspaceRoot) showSidebarView("notes");
      },
      "explorer.viewFilesystem": () => showExplorerWithMode("filesystem"),
      "explorer.viewPinned": () => showExplorerWithMode("workspace"),
      "explorer.toggleHidden": handleToggleShowHidden,
      "explorer.search": handleExplorerSearch,
      "terminal.clear": () => {
        clearFocusedTerminal();
      },
      "terminal.scratchpad": () => {
        if (activeTabId && activeTab?.kind === "terminal") {
          toggleScratchpad(activeTabId);
        }
      },
      "search.focus": () => searchInlineRef.current?.focus(),
      "settings.open": () => void openSettingsWindow(),
      "notifications.toggle": () => useBellStore.getState().toggle(),
      "window.new": () => void native.openMainWindow(),
      "workspace.prev": () => cycleWorkspace(-1),
      "workspace.next": () => cycleWorkspace(1),
      "workspace.selectByIndex": (e) => {
        const idx = parseInt(e.key, 10) - 1;
        const visible = visibleWorkspaceOrder(
          workspaces,
          groups,
          collapsedGroups,
          activeWorkspaceId,
        );
        if (idx >= 0 && idx < visible.length)
          setActiveWorkspaceId(visible[idx].id);
      },
      "view.zoomIn": zoomIn,
      "view.zoomOut": zoomOut,
      "view.zoomReset": zoomReset,
      "view.zenMode": () => {
        if (!activeWorkspace) return;
        if (allPanes(activeWorkspace.paneTree).length <= 1) return;
        setZenPaneId((prev) =>
          prev !== null ? null : activeWorkspace.activePaneId,
        );
      },
      "editor.undo": () => {
        if (activeTabId) editorHandles.current.get(activeTabId)?.undo();
      },
      "editor.redo": () => {
        if (activeTabId) editorHandles.current.get(activeTabId)?.redo();
      },
      "notifications.jumpToLast": () => {
        const { notifications, tabLocations: live } = useAgentStore.getState();
        const first = notifications.find((n) => live && n.tabId in live);
        if (!first) return;
        const workspaceId = live?.[first.tabId];
        if (!workspaceId) return;
        setActiveWorkspaceId(workspaceId);
        onActivateTabStable(workspaceId, first.tabId);
        setTimeout(() => requestLeafFocus(first.tabId), 50);
      },
      "tab.lock": () => {
        if (!activeTabId || !activeTab) return;
        const found = findTabGlobal(activeTabId);
        if (found)
          updateTabData(found.workspace.id, activeTabId, (p) => {
            const newLocked = !p.locked;
            if (p.kind === "editor") {
              return {
                ...p,
                locked: newLocked,
                ...(newLocked ? { preview: false } : {}),
              };
            }
            return { ...p, locked: newLocked };
          });
      },
      "tab.focusOnExplorer": focusActiveTabInExplorer,
      "tab.toggleAutofocus": () => {
        if (autofocusMode === "always") {
          toast.info("Autofocus is set to Always, so it cannot be toggled per tab", {
            description: "Change the mode in Settings > General > Autofocus.",
            action: { label: "Open Settings", onClick: () => void openSettingsWindow("general") },
          });
          return;
        }
        if (!activeTabId || !activeTab || !isAutofocusTab(activeTab)) return;
        const found = findTabGlobal(activeTabId);
        if (found)
          updateTabData(found.workspace.id, activeTabId, (p) =>
            isAutofocusTab(p) ? { ...p, autofocus: !p.autofocus } : p,
          );
      },
      "path.copy": () => {
        if (!activeTab) return;
        let value: string | undefined;
        let label: string;
        if (activeTab.kind === "editor" || activeTab.kind === "markdown") {
          value = activeTab.path;
          label = "Copied current Editor file path";
        } else if (activeTab.kind === "terminal") {
          value = activeTab.cwd;
          label = "Copied current Terminal folder";
        } else if (activeTab.kind === "browser") {
          value = activeTab.url;
          label = "Copied current Browser url";
        } else {
          return;
        }
        if (!value) return;
        void copyToClipboard(value, label);
      },
    }),
    [
      autofocusMode,
      activeWorkspace,
      activeWorkspaceId,
      activePane,
      activeTabId,
      activeTab,
      activeCwd,
      workspaces,
      findTabGlobal,
      updateTabData,
      groups,
      collapsedGroups,
      openCommandPalette,
      cycleWorkspace,
      onActivateTabStable,
      handleCloseActiveTab,
      reopenClosed,
      requestCloseWorkspace,
      focusSidebar,
      agentWorktree,
      openNewTerminal,
      addWorkspace,
      openTab,
      openBrowserInTab,
      doSplitRight,
      doSplitDown,
      focusPane,
      toggleSourceControl,
      setActiveWorkspaceId,
      home,
      zoomIn,
      zoomOut,
      zoomReset,
      toggleSidebar,
      showSidebarView,
      showExplorerWithMode,
      rotateExplorerRoot,
      toggleOverlayPreview,
      toggleSplitPreview,
      runWorkspaceConfig,
      stopWorkspaceConfig,
      requestHibernate,
    ],
  );

  const shortcutsDisabled = useCallback(
    (id: ShortcutId, e: KeyboardEvent) => {
      // The global listener runs in capture phase before the Radix dialog, so a modal does not block it; without this a shortcut could switch or close the workspace, or retarget the dialog.
      if (workspaceDialogPending(hibernateFlow.pendingWorkspaceId, closeFlow.pending?.id)) return true;
      if (activeWorkspace?.hibernated && blockedWhileHibernated(id)) return true;
      if (
        id === "workspace.settings" &&
        !useWorkspaceSettingsStore.getState().open &&
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
        )
      ) {
        return true;
      }
      if (id === "editor.undo" || id === "editor.redo") {
        return activeTab?.kind !== "editor";
      }
      if (id === "editor.cycleView") {
        return !(isPreviewableEditorTab(activeTab) || activeTab?.kind === "markdown");
      }
      if (id === "markdown.toggleOutline") {
        return activeTab?.kind !== "markdown";
      }
      if (id === "editor.preview.toggleSplit") {
        return !isPreviewableEditorTab(activeTab);
      }
      if (id === "editor.save") {
        return activeTab?.kind !== "editor" && activeTab?.kind !== "markdown";
      }
      if (id === "terminal.clear") {
        const target =
          (e.target as HTMLElement | null) ?? document.activeElement;
        return !(target as HTMLElement | null)?.closest?.(".xterm");
      }
      if (id === "file.rename") {
        return sidebarRef.current?.isExplorerFocused() ?? false;
      }

      return false;
    },
    [activeTab, activeWorkspace?.hibernated, hibernateFlow.pendingWorkspaceId, closeFlow.pending?.id],
  );

  useGlobalShortcuts(shortcutHandlers, { isDisabled: shortcutsDisabled });

  // ── Agent activation ──────────────────────────────────────────────────────

  useEffect(() => {
    useAgentStore.getState().setTabLocations(
      tabLocations(workspaces.filter((w) => !w.hibernated)),
    );
  }, [workspaces]);

  const onActivateAgent = useCallback(
    (_storedWorkspaceId: string, tabId: string) => {
      const live = useAgentStore.getState().tabLocations?.[tabId];
      if (!live) return;
      setActiveWorkspaceId(live);
      onActivateTabStable(live, tabId);
      setTimeout(() => focusTab(tabId), 50);
    },
    [setActiveWorkspaceId, onActivateTabStable, focusTab],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .listen<{ workspaceId: string; tabId: string }>(
        "kex:activate-tab",
        (e) => {
          onActivateAgent(e.payload.workspaceId, e.payload.tabId);
        },
      )
      .then((u) => {
        unlisten = u;
      })
      .catch((e) => console.error("[kex] kex:activate-tab listen failed:", e));
    return () => {
      unlisten?.();
    };
  }, [onActivateAgent]);

  // ── Native macOS menu wiring ──────────────────────────────────────────────
  // The menu (built in Rust) emits `kex:menu` with the item id; dispatch to the
  // same handlers the shortcuts use. Kept in a ref so the listener stays stable.
  const menuDispatchRef = useRef<(id: string) => void>(() => {});
  menuDispatchRef.current = (id: string) => {
    switch (id) {
      case "settings":
        void openSettingsWindow();
        break;
      case "new_workspace":
        addWorkspace(home ?? undefined);
        break;
      case "new_terminal":
        openNewTerminal();
        break;
      case "new_browser":
        openBrowserInTab("");
        break;
      case "toggle_autosave":
        void setEditorAutoSave(!usePreferencesStore.getState().editorAutoSave);
        break;
      case "close_tab":
        handleCloseActiveTab();
        break;
      case "close_others":
        handleCloseOtherTabs();
        break;
      case "close_all":
        handleCloseAllTabs();
        break;
      case "toggle_sidebar":
        toggleSidebar();
        break;
      case "toggle_explorer":
        showSidebarView("explorer");
        break;
      case "toggle_git":
        showSidebarView("git");
        break;
      case "toggle_history":
        showSidebarView("history");
        break;
      case "toggle_hidden":
        handleToggleShowHidden();
        break;
      case "toggle_sidebar_side":
        setSidebarSide(
          sidebarStateRef.current.side === "left" ? "right" : "left",
        );
        break;
    }
  };

  useEffect(() => {
    if (!IS_MAC) return;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .listen<string>("kex:menu", (e) => menuDispatchRef.current(e.payload))
      .then((u) => {
        unlisten = u;
      })
      .catch((e) => console.error("[kex] kex:menu listen failed:", e));
    return () => {
      unlisten?.();
    };
  }, []);

  // Keep the dynamic menu labels in sync with the preferences they reflect.
  useEffect(() => {
    if (!IS_MAC) return;
    void invoke("sync_menu", {
      state: {
        autosave: editorAutoSave,
        sidebarOpen: sidebarOpen,
        activeView: sidebarView,
        sidebarSide: sidebarSide,
        showHidden: activeShowHidden,
      },
    }).catch(() => {});
  }, [editorAutoSave, sidebarOpen, sidebarView, sidebarSide, activeShowHidden]);

  // ── Command palette ───────────────────────────────────────────────────────

  const commandPaletteItems = useMemo(
    () =>
      commandPaletteOpen
        ? createCommandItems({
            activeWorkspacePaneTree: activeWorkspace?.paneTree ?? null,
            workspaceCount: workspaces.length,
            activeId: activeWorkspaceId,
            searchTarget,
            explorerRoot,
            home,
            openNewTab: () => {
              openNewTerminal();
            },
            openNewWorkspace: () => addWorkspace(home ?? undefined),
            openNewEditor: () => setNewEditorOpen(true),
            openNewBrowser: () => openBrowserInTab(""),
            openGitGraph: openGitGraphFromContext,
            toggleSourceControl,
            closeActiveTabOrPane: handleCloseActiveTab,
            splitPaneRight: doSplitRight,
            splitPaneDown: doSplitDown,
            focusSearch: () => searchInlineRef.current?.focus(),
            focusExplorerSearch: () => sidebarRef.current?.focusExplorer(),
            toggleSidebar: toggleSidebar,
            openSettings: () => void openSettingsWindow(),
            openKeyboardShortcuts: () => void openSettingsWindow("shortcuts"),
            reopenClosedTab: () => {
              if (activeWorkspace) reopenClosed();
            },
            openNewWindow: () => void native.openMainWindow(),
            clearTerminal: clearFocusedTerminal,
            toggleZenMode: () => {
              if (!activeWorkspace) return;
              if (allPanes(activeWorkspace.paneTree).length <= 1) return;
              setZenPaneId((prev) =>
                prev !== null ? null : activeWorkspace.activePaneId,
              );
            },
            hasActiveTerminal: activeTab?.kind === "terminal",
            openWorkspaceProperties: () =>
              useWorkspaceSettingsStore
                .getState()
                .openSettings(activeWorkspaceId),
            openRunScriptConfiguration: () =>
              useWorkspaceSettingsStore
                .getState()
                .openSettings(activeWorkspaceId, "scripts"),
          })
        : [],
    [
      commandPaletteOpen,
      activeWorkspace,
      workspaces.length,
      activeWorkspaceId,
      searchTarget,
      explorerRoot,
      home,
      addWorkspace,
      openNewTerminal,
      openBrowserInTab,
      openGitGraphFromContext,
      toggleSourceControl,
      handleCloseActiveTab,
      doSplitRight,
      doSplitDown,
      toggleSidebar,
      reopenClosed,
      clearFocusedTerminal,
      setZenPaneId,
      activeTab,
    ],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const onOpenExternalEditorSettings = useCallback(() => {
    void openSettingsWindow("external-editors");
  }, []);

  const sidebarRepoRoot =
    sourceControl.repo?.repoRoot ?? explorerRoot ?? home ?? "";

  // Stable reference so WorkspaceBar's internal groupWorkspaces memo isn't
  // invalidated on every App render by a freshly allocated array here.
  const workspaceBarItems = useMemo(
    () =>
      workspaces.map((w) => ({
        id: w.id,
        title: w.title,
        kind: "terminal",
        cwd: w.cwd,
        color: w.color,
        icon: w.icon,
        groupId: w.groupId,
        tabs: w.detailExpanded && !w.hibernated
          ? allPanes(w.paneTree).flatMap((p) => p.tabs)
          : NO_TABS,
        focusedTabId: focusedTabId(w.paneTree, w.activePaneId),
        detailExpanded: w.detailExpanded,
        hibernated: w.hibernated,
        hibernatedAt: w.hibernatedAt,
      })),
    [workspaces],
  );

  const shell = (
    <ThemeProvider>
      <TooltipProvider>
        <div className="zoom-content relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
          <Header
            onToggleSidebar={toggleSidebar}
            sidebarSide={sidebarSide}
            onOpenCommandPalette={() => openCommandPalette("commands")}
            onActivateAgent={onActivateAgent}
            onOpenSettings={() => void openSettingsWindow()}
            searchTarget={searchTarget}
            searchRef={searchInlineRef}
            openInEditorTarget={openInEditorTarget}
            workspaceRoot={workspaceRootPath}
            onOpenExternalEditorSettings={onOpenExternalEditorSettings}
            onSetWorkspaceRoot={() =>
              useWorkspaceSettingsStore
                .getState()
                .openSettings(activeWorkspaceId, "properties", "workspaceRoot")
            }
            scripts={activeWorkspace?.scripts ?? []}
            activeScript={activeWorkspace?.activeScript}
            onSelectScript={(id) => setActiveScript(activeWorkspaceId, id)}
            onRunScript={runWorkspaceConfig}
            onStopConfig={stopWorkspaceConfig}
            onOpenRunSettings={() =>
              useWorkspaceSettingsStore
                .getState()
                .openSettings(activeWorkspaceId, "scripts")
            }
            activeWorkspace={activeWorkspace ?? null}
            activeTab={activeTab}
            groups={groups}
            onRestoreFocus={restoreLeafFocus}
          />

          {/* 3-column layout */}
          <div className="flex min-h-0 flex-1">
            <WorkspaceMoveProvider workspaces={workspaces} onMoveTab={handleMoveTabFromMenu}>
            <SidebarTabMenuProvider value={sidebarTabMenu}>
            <WorkspaceDndProvider
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              onMoveTab={moveTab}
              onReorderTab={reorderTab}
              onSplitPaneAndPlace={splitPaneAndPlace}
              onSplitPaneAndOpenTab={splitPaneAndOpenTab}
              onOpenTab={openTab}
              onMoveTabToWorkspace={handleDropTabOnWorkspace}
              onSelectWorkspace={setActiveWorkspaceId}
            >
            {/* LEFT: workspace bar */}
            <WorkspaceBar
              onActivateAgentTab={onActivateAgent}
              onSetDetailExpanded={setWorkspaceDetailExpanded}
              workspaces={workspaceBarItems}
              activeId={activeWorkspaceId}
              onSelect={setActiveWorkspaceId}
              onNew={() => addWorkspace(home ?? undefined)}
              onReorder={reorderWorkspaces}
              onClose={(wsId) => void requestCloseWorkspace(wsId)}
              onRename={(id, title) => setWorkspaceTitle(id, title)}
              onHibernate={(id) => void hibernateFlow.requestHibernate(id)}
              onWake={(id) => void wakeWorkspace(id)}
              onOpenSettings={(id) =>
                useWorkspaceSettingsStore.getState().openSettings(id)
              }
              onSetColor={setWorkspaceColor}
              onSetIcon={setWorkspaceIcon}
              width={workspaceBarWidth}
              onWidthChange={handleBarWidthChange}
              workspaceGroups={groups}
              onSetGroup={handleSetGroup}
              onPreviewGroup={handlePreviewGroup}
              onCommitGroupMove={handleCommitGroupMove}
              onCreateGroup={handleCreateGroup}
              onRenameGroup={handleRenameGroup}
              onReorderGroups={handleReorderGroups}
              collapsedGroups={collapsedGroups}
              onToggleGroup={handleToggleGroup}
              onRestoreFocus={restoreLeafFocus}
            />

            {/* CENTER + TOOL PANEL: resizable, side configurable */}
              <ResizablePanelGroup
                orientation="horizontal"
                className="min-h-0 flex-1"
              >
                {/* Tool sidebar on LEFT when sidebarSide === "left" */}
                {sidebarOpen && !activeWorkspace?.hibernated && sidebarSide === "left" && (
                  <>
                    <ResizablePanel
                      id="tool-sidebar"
                      defaultSize={`${sidebarWidth}%`}
                      minSize="12%"
                      maxSize="70%"
                      onResize={(size) => setSidebarWidth(size.asPercentage)}
                    >
                                            <Sidebar
                        ref={sidebarRef}
                        view={sidebarView}
                        onChangeView={setSidebarView}
                        notesRoot={workspaceRootPath}
                        onOpenNoteToSide={openNoteToSide}
                        onRevealNoteInExplorer={revealNoteInExplorer}
                        rootPath={explorerRoot}
                        rootMode={activeRootMode}
                        onChangeRootMode={handleChangeRootMode}
                        showHidden={activeShowHidden}
                        onToggleShowHidden={handleToggleShowHidden}
                        onFocusActiveTab={activeTabFocusTarget ? focusActiveTabInExplorer : undefined}
                        onSetAsRoot={handleSetAsRoot}
                        onEnterFolder={handleEnterFolder}
                        onNavigateUp={handleNavigateUp}
                        onFsRootMissing={handleFsRootMissing}
                        canNavigateUp={canNavigateUp}
                        homePath={home}
                        fsRootPath={fsRootPath}
                        gitRootPath={gitRoot}
                        workspaceRootPath={workspaceRootPath}
                        workspaceRootExists={workspaceRootExists}
                        revealRequest={revealRequest}
                        onOpenFile={(path, pin) => openFileInTab(path, pin)}
                        onPathRenamed={handlePathRenamed}
                        onPathDeleted={handlePathDeleted}
                        onRevealInTerminal={openFolderInTerminal}
                        onNewWorkspaceFromFolder={newWorkspaceFromFolder}
                        onAddToGitignore={handleAddToGitignore}
                        onOpenWorkspaceProperties={() =>
                          useWorkspaceSettingsStore
                            .getState()
                            .openSettings(
                              activeWorkspaceId,
                              "properties",
                              "workspaceRoot",
                            )
                        }
                        onExplorerSearchClose={onExplorerSearchClose}
                        workspaceCwd={explorerRoot}
                        sourceControl={sourceControl}
                        pushOnCommit={pushOnCommit}
                        onPushOnCommitChange={handlePushOnCommitChange}
                        gitWorkspaceId={activeWorkspaceId}
                        savedCommitMessage={savedCommitMessage}
                        onCommitMessagePersist={handleCommitMessagePersist}
                        onOpenDiff={openGitDiffInTab}
                        onOpenGitGraph={openGitGraphFromContext}
                        onNavigateToWorktree={handleNavigateToWorktree}
                        repoRoot={sidebarRepoRoot}
                        onOpenCommitFile={onOpenCommitFileStable}
                        onSearchHandle={setGitHistoryHandle}
                      />
                                          </ResizablePanel>
                    <ResizableHandle />
                  </>
                )}

                <ResizablePanel id="center" minSize="30%">
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="relative min-h-0 flex-1">
                      <EditorChromeProvider value={editorChromeWithGit}>
                        <WorkspaceView
                          workspaces={workspaces}
                          activeWorkspaceId={activeWorkspaceId}
                          expandedPaneId={zenPaneId}
                          onWake={(id) => void wakeWorkspace(id)}
                          onActivateTab={onActivateTabStable}
                          onCloseTab={onCloseTabStable}
                          onCloseManyTabs={onCloseManyTabsStable}
                          onFocusPane={onFocusPaneStable}
                          onNewTerminal={onNewTerminalStable}
                          onSplitTerminalRight={onSplitTerminalRightStable}
                          onSplitTerminalDown={onSplitTerminalDownStable}
                          onNewBrowser={onNewBrowserStable}
                          onSplitBrowserRight={onSplitBrowserRightStable}
                          onSplitBrowserDown={onSplitBrowserDownStable}
                          onDividerChange={onDividerChangeStable}
                          callbacks={tabCallbacks}
                          gitStatus={sourceControl.status}
                          gitColorScheme={gitColorScheme}
                          onFloatBrowserTab={onFloatBrowserTab}
                          onDockBrowserTab={onDockBrowserTab}
                          onFocusFloatBrowserTab={onFocusFloatBrowserTab}
                          onNavigateFloatBrowserTab={onNavigateFloatBrowserTab}
                          welcomeActions={welcomeActions}
                        />
                      </EditorChromeProvider>
                    </div>

                    <WorkspaceInputBar
                      isBlockTab={false}
                      activeLeafId={activeTabId}
                    />
                  </div>
                </ResizablePanel>

                {/* Tool sidebar on RIGHT when sidebarSide === "right" (default) */}
                {sidebarOpen && !activeWorkspace?.hibernated && sidebarSide === "right" && (
                  <>
                    <ResizableHandle />
                    <ResizablePanel
                      id="tool-sidebar"
                      defaultSize={`${sidebarWidth}%`}
                      minSize="12%"
                      maxSize="70%"
                      onResize={(size) => setSidebarWidth(size.asPercentage)}
                    >
                                            <Sidebar
                        ref={sidebarRef}
                        view={sidebarView}
                        onChangeView={setSidebarView}
                        notesRoot={workspaceRootPath}
                        onOpenNoteToSide={openNoteToSide}
                        onRevealNoteInExplorer={revealNoteInExplorer}
                        rootPath={explorerRoot}
                        rootMode={activeRootMode}
                        onChangeRootMode={handleChangeRootMode}
                        showHidden={activeShowHidden}
                        onToggleShowHidden={handleToggleShowHidden}
                        onFocusActiveTab={activeTabFocusTarget ? focusActiveTabInExplorer : undefined}
                        onSetAsRoot={handleSetAsRoot}
                        onEnterFolder={handleEnterFolder}
                        onNavigateUp={handleNavigateUp}
                        onFsRootMissing={handleFsRootMissing}
                        canNavigateUp={canNavigateUp}
                        homePath={home}
                        fsRootPath={fsRootPath}
                        gitRootPath={gitRoot}
                        workspaceRootPath={workspaceRootPath}
                        workspaceRootExists={workspaceRootExists}
                        revealRequest={revealRequest}
                        onOpenFile={(path, pin) => openFileInTab(path, pin)}
                        onPathRenamed={handlePathRenamed}
                        onPathDeleted={handlePathDeleted}
                        onRevealInTerminal={openFolderInTerminal}
                        onNewWorkspaceFromFolder={newWorkspaceFromFolder}
                        onAddToGitignore={handleAddToGitignore}
                        onOpenWorkspaceProperties={() =>
                          useWorkspaceSettingsStore
                            .getState()
                            .openSettings(
                              activeWorkspaceId,
                              "properties",
                              "workspaceRoot",
                            )
                        }
                        onExplorerSearchClose={onExplorerSearchClose}
                        workspaceCwd={explorerRoot}
                        sourceControl={sourceControl}
                        pushOnCommit={pushOnCommit}
                        onPushOnCommitChange={handlePushOnCommitChange}
                        gitWorkspaceId={activeWorkspaceId}
                        savedCommitMessage={savedCommitMessage}
                        onCommitMessagePersist={handleCommitMessagePersist}
                        onOpenDiff={openGitDiffInTab}
                        onOpenGitGraph={openGitGraphFromContext}
                        onNavigateToWorktree={handleNavigateToWorktree}
                        repoRoot={sidebarRepoRoot}
                        onOpenCommitFile={onOpenCommitFileStable}
                        onSearchHandle={setGitHistoryHandle}
                      />
                                          </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
            </WorkspaceDndProvider>
            </SidebarTabMenuProvider>
            </WorkspaceMoveProvider>
          </div>

          <DuplicateProgressBar />
          <DuplicateQuitModal />

          <AgentNotificationsBridge
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            onActivate={onActivateAgent}
          />
          <Toaster position="bottom-right" />

          <CommandPalette
            open={commandPaletteOpen}
            onOpenChange={setCommandPaletteOpen}
            initialMode={paletteInitialMode}
            commandItems={commandPaletteItems}
            workspaceRoot={explorerRoot}
            onOpenContentHit={openContentHit}
            insertCommand={insertHistoryCommand}
          />

          <NewEditorDialog
            open={newEditorOpen}
            onOpenChange={setNewEditorOpen}
            rootPath={explorerRoot ?? home}
            onCreated={(path) => openFileInTab(path, true)}
          />

          <UpdaterDialog />

          <WorkspaceSettingsDialog
            workspaces={workspaces}
            onSetTitle={setWorkspaceTitle}
            onSetColor={setWorkspaceColor}
            onSetIcon={setWorkspaceIcon}
            onSetWorkspaceRoot={(id, path) => {
              if (path !== undefined) setWorkspaceRoot(id, path);
              else clearWorkspaceRoot(id);
            }}
            onAddScript={addScript}
            onUpdateScript={updateScript}
            onRemoveScript={removeScript}
            onReorderScripts={reorderScripts}
            onRestoreFocus={restoreLeafFocus}
          />

          <HibernateDialog
            workspace={
              workspaces.find((w) => w.id === hibernateFlow.pendingWorkspaceId) ??
              null
            }
            groupLabel={groupLabelOf(
              workspaces.find((w) => w.id === hibernateFlow.pendingWorkspaceId)?.groupId,
              groups,
            )}
            onClose={hibernateFlow.cancel}
            onHibernate={handleHibernateFromDialog}
            onSaveTab={saveTabReportingErrors}
            onGoToTab={goToTab}
            onStopBusy={(row) => {
              if (row.kind === "agent") {
                interruptAgentLeaf(row.tabId);
                return;
              }
              setScriptRunning(
                row.tabId,
                planScriptStop(scriptCommandSeen.current.has(row.tabId)),
              );
              terminalHandles.current.get(row.tabId)?.write("\x03");
            }}
            onEnableRunOnStart={(tabId, running) => {
              const id = hibernateFlow.pendingWorkspaceId;
              if (!id) return;
              const isAgent = useAgentStore.getState().sessions[tabId] !== undefined;
              updateTabData(id, tabId, (t) =>
                enableRunOnStart(
                  t,
                  isAgent
                    ? undefined
                    : (followableCommand(running ?? null, getRunningScriptCommand(tabId)) ??
                        undefined),
                ),
              );
            }}
          />

          <HibernateDialog
            mode="close"
            workspace={
              workspaces.find((w) => w.id === closeFlow.pending?.id) ?? null
            }
            groupLabel={groupLabelOf(
              workspaces.find((w) => w.id === closeFlow.pending?.id)?.groupId,
              groups,
            )}
            processes={closeFlow.pending?.processes}
            onClose={closeFlow.cancel}
            onHibernate={() => {
              const id = closeFlow.pending?.id;
              if (id) void closeFlow.performClose(id);
            }}
            onSaveTab={saveTabReportingErrors}
            onGoToTab={goToTab}
            onStopBusy={() => {}}
            onEnableRunOnStart={() => {}}
          />

          <CloseDialogs
            pendingCloseTab={pendingCloseTab}
            onCancelClose={() => resolveEditor({ type: "cancel" })}
            onSaveClose={() => resolveEditor({ type: "save" })}
            onDontSaveClose={() => resolveEditor({ type: "dont-save" })}
            pendingTerminalCloseTab={pendingTerminalCloseTab}
            onCancelTerminalClose={() => resolveTerminal({ type: "cancel" })}
            onConfirmTerminalClose={(dontAskAgain) =>
              resolveTerminal({ type: "close", dontAskAgain })
            }
            pendingDeleteTabs={pendingDeleteTabs}
            onCancelDeleteClose={cancelDeleteClose}
            onConfirmDeleteClose={confirmDeleteClose}
          />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );

  return shell;
}
