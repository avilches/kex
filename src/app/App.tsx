import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { openFilePaths } from "@/modules/explorer/lib/openFiles";
import { tabLocations, userTabTitles } from "@/modules/workspaces/lib/tabLocations";
import { domFocusHoldsOsRefocus } from "@/app/lib/osRefocus";
import {
  workspaceDialogPending,
  isHibernatedTab,
  liveTerminalIds,
  editorTabIds,
  awakeTerminalTabs,
  isPendingStale,
  terminalTabs,
  tabWorktree,
} from "@/modules/workspaces/lib/hibernate";
import { tabDisplayTitleNow } from "@/modules/workspaces/lib/tabTitleNow";
import { abandonUnflushedBuffers } from "@/modules/editor/lib/unflushedBuffers";
import { unmarkHibernating } from "@/modules/agents/lib/hibernatingTabs";
import { useAutoHibernate } from "@/modules/workspaces/lib/useAutoHibernate";
import { usePruneSleepingWorktree } from "@/modules/workspaces/lib/usePruneSleepingWorktree";
import { useHibernateFlow } from "@/modules/workspaces/lib/useHibernateFlow";
import { useHibernateLinesCleanup } from "@/modules/workspaces/lib/useHibernateLinesCleanup";
import { enterBelongsToFocusedElement } from "@/modules/workspaces/lib/wakeShortcut";
import { useCloseWorkspaceFlow } from "@/modules/workspaces/lib/useCloseWorkspaceFlow";
import { workspaceTabCount } from "@/modules/workspaces/lib/useWorkspaces";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { unlinkRemovedActions, unlinkTab } from "@/modules/actions/lib/actionStateStore";
import { useActionRunner } from "@/modules/actions/lib/useActionRunner";
import { createBarOps } from "@/modules/actions/lib/barOps";
import { globalActions } from "@/modules/actions/lib/globalActionsBinding";
import { ActionMenuProvider } from "@/modules/actions/RowActionsMenu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getLaunchDir } from "@/lib/launchDir";
import { native } from "@/lib/native";
import { focusWhenReady } from "@/lib/focusWhenReady";
import { newGroupId, newTabId } from "@/lib/ids";
import { useZoom } from "@/lib/useZoom";
import { useUiFont } from "@/lib/useUiFont";
import { useEditorFont } from "@/modules/editor/lib/useEditorFont";
import { isMarkdownPath } from "@/lib/utils";
import { isPreviewableEditorTab } from "@/modules/workspaces/lib/previewableTab";
import { findReplaceableFilePreview, isFilePreviewTab } from "@/modules/workspaces/lib/fileTabPreview";
import { AgentNotificationsBridge, useBellStore } from "@/modules/agents";
import { buildAgentEntries, entriesByWorkspace } from "@/modules/agents/lib/notificationList";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import {
  loadRestorePlans,
} from "@/modules/agents/lib/agentSessionRestore";
import {
  buildClosedTabEntries,
  buildTabEntries,
  buildWorkspaceEntries,
  CommandPalette,
  type MoveSubject,
  createCommandItems,
  liveTabSources,
  usePaletteGit,
  selectTab,
  selectWorkspace,
  type ClosedTabEntry,
  type TabEntry,
  type WorkspaceEntry,
} from "@/modules/command-palette";
import { useProfilerSetting } from "@/modules/profiler";
import {
  buildFolderGroups,
  FolderPalette,
  type FolderRow,
} from "@/modules/new-terminal";
import { useRepoWorktrees } from "@/modules/new-terminal/lib/useRepoWorktrees";
import {
  NewEditorDialog,
  useEditorFileSync,
  type EditorPaneHandle,
} from "@/modules/editor";
import type { GitHistorySearchHandle } from "@/modules/git-history";
import {
  buildSearchTarget,
  Header,
  type SearchInlineHandle,
  type SearchTarget,
} from "@/modules/header";
import { runStartupEditorScan } from "@/modules/external-editors";
import type { BrowserPaneHandle } from "@/modules/browser";
import { useFloatBrowser } from "@/modules/browser/useFloatBrowser";
import { copyToClipboard } from "@/modules/explorer/lib/contextActions";
import {
  openSettingsWindow,
  openActionSettings,
  openGlobalActionsSettings,
  openWorkspaceActionsSettings,
} from "@/modules/settings/openSettingsWindow";
import { useWorkspaceActionsBroadcast } from "@/modules/actions/lib/actionsBroadcast";
import type { Action } from "@/modules/actions/lib/types";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setEditorAutoSave,
  setPerformanceProfiler,
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
  leafPromptReady,
  leaveLeafScratchpad,
  requestLeafFocus,
  toggleScratchpad,
  type TerminalPaneHandle,
  useTerminalFileDrop,
  useTerminalMetricsSampler,
  writeToSession,
} from "@/modules/terminal";
import { configureTerminalLinkBridge } from "@/modules/terminal/lib/terminalLinkBridge";
import { leafAnsiTail } from "@/modules/terminal/lib/useTerminalSession";
import { ThemeProvider, useThemeFileEditing } from "@/modules/theme";
import { UpdaterDialog } from "@/modules/updater";
import { useWorkspaceEnvStore } from "@/modules/workspace";
import {
  allPanes,
  findOpenPathTab,
  findPane,
  findPaneInDirection,
  findTabPane,
  focusedTab,
  focusedTabId,
  loadTabHistory,
  noteTabUse,
  planDiffTabOpen,
  siblingPane,
  tabIdentityKey,
  type TabHistoryRecord,
  type DiffIdentity,
  type Tab,
  type MarkdownTabHandle,
  type TabCallbacks,
  type Rect,
  useWorkspaces,
  WorkspaceView,
} from "@/modules/workspaces";
import type { WorkspaceGroup } from "@/modules/workspaces/lib/types";
import type { WelcomeActions } from "@/modules/workspaces/EmptyPaneWelcome";
import { WorkspaceMoveProvider } from "@/modules/workspaces/WorkspaceMoveContext";
import { buildGitStatusMap } from "@/modules/explorer/lib/gitStatusUtils";
import { SidebarGitProvider, type SidebarGit } from "@/modules/workspaces/SidebarGitContext";
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
import { linearNavTarget } from "@/modules/workspaces/lib/linearNav";
import { useDetailFilter } from "@/modules/workspaces/lib/useDetailFilter";
import { workspaceDetailRows } from "@/modules/workspaces/lib/workspaceDetail";
import { focusTabContent } from "@/modules/workspaces/lib/focusTabContent";
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
import { Sidebar, type SidebarHandle } from "./components/Sidebar";
import { WorkspaceInputBar } from "./components/WorkspaceInputBar";
import { WorkspaceBar } from "./components/WorkspaceBar";
import { startAgentTitleSync } from "@/modules/workspaces/lib/agentTitleSync";
import {
  autofocusDecision,
  type AutofocusKey,
} from "@/modules/workspaces/lib/autofocusDecision";
import {
  flushSidebarSnapshotsNow,
  pushSidebarSnapshot,
  startSidebarSnapshotSync,
  withSidebarSnapshotFlush,
} from "@/modules/workspaces/lib/sidebarSnapshotSync";
import { setEditorFlush } from "./lib/editorFlush";
import { useRestoreFocusAfterRename } from "./hooks/useRestoreFocusAfterRename";
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
import {
  effectiveSidebarView,
  type SidebarView,
} from "@/modules/workspaces/lib/sidebarState";
import {
  DEFAULT_WORKSPACE_SIDEBAR,
  type ExplorerSnapshot,
} from "@/modules/workspaces/lib/sidebarSnapshot";
import { useSidebarState } from "@/modules/workspaces/lib/useSidebarState";
import { hasTabNote, isTabNoteOpen, removeTabNote, toggleTabNote } from "@/modules/workspaces/lib/tabNote";
import { historyPaletteShortcutUnavailable, paletteShortcutUnavailable, shortcutUnavailableBehindPalette } from "@/modules/workspaces/lib/shortcutContext";
import { tabDirIn } from "@/modules/workspaces/lib/titleVars";
import { recordTabUse } from "@/modules/workspaces/lib/tabUse";
import { toggleTabLock } from "@/modules/workspaces/lib/tabLock";
import { flushTabNote, useTabNoteStore } from "@/modules/workspaces/lib/tabNoteStore";
import { resolveRenameShortcut, useTabRenameStore } from "@/modules/workspaces/lib/tabRenameStore";
import { useWorkspaceRenameStore } from "@/modules/workspaces/lib/workspaceRenameStore";
import { useContextMenuCloseStore } from "@/modules/workspaces/lib/contextMenuCloseStore";
import { useFileRenameStore } from "@/modules/workspaces/lib/fileRenameStore";
import {
  clearRunningCommandEntry,
  clearScriptRunningEntry,
  getRunningCommand,
  getRunningScriptCommand,
  setScriptRunning,
  getScriptRunningSnapshot,
} from "@/modules/workspaces/lib/terminalEphemeralStore";
import { clearMetricsEntry } from "@/modules/workspaces/lib/terminalMetricsStore";
import {
  resolveExplorerRoot,
  logicalRepoRoot,
  nearestExistingDir,
  resolveSidebarTarget,
  isFilesystemRoot,
  parentRoot,
  type ExplorerRootMode,
} from "@/modules/workspaces/lib/explorerRoot";
import type { RevealRequest } from "@/modules/explorer";
import type { RevealAction } from "@/modules/explorer/lib/pendingAction";
import { tabFilePath, tabFolder } from "@/modules/workspaces/lib/tabPath";
import { runPaletteShortcut, runPaletteTabItem } from "@/modules/command-palette/lib/paletteControl";
import {
  menuItemBlockedByPalette,
  openPaletteOf,
  shortcutBlockedByPalette,
} from "@/modules/command-palette/lib/paletteGate";
import {
  isPaletteTabShortcut,
  withPaletteTabShortcuts,
} from "@/modules/command-palette/lib/paletteShortcuts";
import type { TerminalTarget } from "@/modules/command-palette/lib/terminalTarget";
import {
  planCommandEvent,
  displayedRunningCommand,
} from "@/modules/workspaces/lib/scriptRunState";
import { isAutofocusActive } from "@/modules/workspaces/lib/types";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { pathBasename, pathDirname, toForwardSlashes } from "@/lib/pathUtils";
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
    setAgentTitles,
    clearAgentTitles,
    applyExplorerSnapshotBatch,
    wakeTabs,
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
    setWorkspaceSidebarView,
    setWorkspaceRoot,
    setFsRoot,
    setWorkspaceTitle,
    setWorkspaceColor,
    setWorkspaceIcon,
    setWorkspaceDetailExpanded,
    setWorkspaceGroup,
    setWorkspaceGitConfig,
    addWorkspaceAction,
    updateWorkspaceAction,
    removeWorkspaceAction,
    reorderWorkspaceActions,
    placeWorkspaceAction,
    promoteWorkspaceAction,
    demoteGlobalAction,
    dropDeadScriptPanes,
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
  const openFiles = useMemo(
    () => openFilePaths(activeWorkspace?.paneTree),
    [activeWorkspace?.paneTree],
  );

  const activeTabId = activePane?.activeTabId ?? null;
  const activeTab = activeTabId
    ? (activePane?.tabs.find((p) => p.id === activeTabId) ?? null)
    : null;

  // One place covers tab clicks, shortcuts, new tabs, workspace switches and startup.
  useEffect(() => {
    if (activeTabId) recordTabUse(activeTabId);
  }, [activeTabId]);

  // Usage-based history: every real change of the focused location counts once, including
  // opening a tab and returning to one that was already open. Re-renders that keep the same
  // location do not add uses.
  const activeTabIdentity = activeTab ? tabIdentityKey(activeTab) : null;
  const activeTabHistoryKey =
    activeWorkspace && activeTabIdentity
      ? `${activeWorkspace.id}\0${activeTabIdentity}`
      : null;
  const lastNotedTabRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeTab || !activeWorkspace || !activeTabHistoryKey) {
      lastNotedTabRef.current = null;
      return;
    }
    if (lastNotedTabRef.current === activeTabHistoryKey) return;
    lastNotedTabRef.current = activeTabHistoryKey;
    noteTabUse(activeTab, activeWorkspace.id);
  }, [activeTab, activeWorkspace, activeTabHistoryKey]);

  // Returns focus to the active tab after a transient interruption -- a
  // dropdown, dialog, or context menu closing -- instead of leaving it on
  // whatever chrome element triggered it. Opening that chrome already closed
  // the scratchpad if it was open (see ScratchpadBar's onBlur), so this lands
  // on the terminal.
  const restoreLeafFocus = useCallback(() => {
    if (activeTabId) requestLeafFocus(activeTabId);
  }, [activeTabId]);

  const isTerminalTab = activeTab?.kind === "terminal";
  const activeCwd = isTerminalTab
    ? ((activeTab as { cwd?: string }).cwd ?? null)
    : null;
  activeCwdRef.current = activeCwd;

  contextCwdRef.current = tabFolder(activeTab ?? null);

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
  const [activeMarkdownHandle, setActiveMarkdownHandle] =
    useState<MarkdownTabHandle | null>(null);
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
    void runStartupEditorScan();
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
    dropDeadScriptPanes();
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
      focusTab(tabId);
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
    let disposed = false;
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
          if (domFocusHoldsOsRefocus(document.activeElement)) return;
          requestLeafFocus(tabId);
        });
      })
      .then((u) => {
        if (disposed) {
          u();
          return;
        }
        unlisten = u;
      })
      .catch((e) => console.error("[kex] onFocusChanged listen failed:", e));
    return () => {
      disposed = true;
      unlisten?.();
    };
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
    side: sidebarSide,
    width: sidebarWidth,
    stateRef: sidebarStateRef,
    setOpen: setSidebarOpenNow,
    setSide: setSidebarSideNow,
    setWidth: setSidebarWidth,
  } = useSidebarState(windowLabel);
  // Opening, closing or moving the Sidebar remounts the explorer: flush first so it restores
  // the latest snapshot instead of overwriting a pending one.
  const setSidebarOpen = useMemo(
    () => withSidebarSnapshotFlush(setSidebarOpenNow),
    [setSidebarOpenNow],
  );
  const setSidebarSide = useMemo(
    () => withSidebarSnapshotFlush(setSidebarSideNow),
    [setSidebarSideNow],
  );
  const sidebarView: SidebarView = effectiveSidebarView(
    activeWorkspace?.sidebar?.view ?? DEFAULT_WORKSPACE_SIDEBAR.view,
    activeWorkspace?.workspaceRoot ?? null,
  );
  const sidebarViewRef = useRef(sidebarView);
  sidebarViewRef.current = sidebarView;
  const setSidebarView = useCallback(
    (view: SidebarView) => {
      if (activeWorkspaceId) setWorkspaceSidebarView(activeWorkspaceId, view);
    },
    [activeWorkspaceId, setWorkspaceSidebarView],
  );
  const editorAutoSave = usePreferencesStore((s) => s.editorAutoSave);
  const workspacePaneLimit = usePreferencesStore((s) => s.workspacePaneLimit);
  const performanceProfiler = usePreferencesStore((s) => s.performanceProfiler);
  useProfilerSetting();
  const gitColorScheme = usePreferencesStore((s) => s.explorerGitColorScheme);
  const pendingExplorerSearch = useRef(false);

  // ── Live terminal tab tracking for session disposal ─────────────────────

  const liveTabIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const live = liveTerminalIds(workspaces);
    for (const id of liveTabIdsRef.current) {
      if (!live.has(id)) {
        useAgentStore.getState().finish(id);
        disposeSession(id);
        searchAddons.current.delete(id);
        terminalHandles.current.delete(id);
        scriptCommandSeen.current.delete(id);
        clearRunningCommandEntry(id);
        clearScriptRunningEntry(id);
        unlinkTab(id);
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
    setActiveMarkdownHandle(
      activeTabId !== null
        ? (markdownHandles.current.get(activeTabId) ?? null)
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
    setActiveMarkdownHandle(null);
  }, []);

  const findWorkspaceById = useCallback(
    (id: string) => workspacesRef.current.find((w) => w.id === id),
    [],
  );

  const { runAction, stopAction, focusActionTab } = useActionRunner({
    activeWorkspace,
    activeWorkspaceId,
    findWorkspace: findWorkspaceById,
    findTabGlobal,
    setActiveWorkspaceId,
    activateTab,
    revealTab,
    focusPane,
    openTab,
    splitPaneAndOpenTab,
    setScriptPaneId,
    wakeTab: (workspaceId, tabId) => wakeTabs(workspaceId, [tabId]),
    terminalHandles,
    scriptCommandSeen,
    focusFolder: scriptFocusFolderRef,
  });

  const handleCloseWorkspace = useCallback(
    async (wsId: string) => {
      const ws = workspacesRef.current.find((w) => w.id === wsId);
      await destroyWorkspaceFloats(wsId, workspacesRef.current);
      if (ws) {
        abandonUnflushedBuffers(editorTabIds(ws));
        unmarkHibernating(terminalTabs(ws).map((t) => t.id));
      }
      closeWorkspace(wsId, true);
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

  // The pinned root may have been deleted or moved: the explorer falls back to
  // its nearest existing ancestor instead of rendering nothing.
  const [liveWorkspaceRoot, setLiveWorkspaceRoot] = useState<{
    for: string;
    path: string;
  } | null>(null);
  useEffect(() => {
    if (!workspaceRootPath) return;
    let cancelled = false;
    void nearestExistingDir(workspaceRootPath, (p) =>
      native.fsStat(p).then(
        () => true,
        () => false,
      ),
    ).then((path) => {
      if (!cancelled) setLiveWorkspaceRoot({ for: workspaceRootPath, path });
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceRootPath]);
  const effectiveWorkspaceRoot =
    liveWorkspaceRoot && liveWorkspaceRoot.for === workspaceRootPath
      ? liveWorkspaceRoot.path
      : workspaceRootPath;

  const explorerRoot = useMemo<string | null>(
    () =>
      resolveExplorerRoot({
        mode: activeRootMode,
        workspaceRoot: effectiveWorkspaceRoot,
        fsRoot: fsFolderRoot,
        home,
      }),
    [activeRootMode, effectiveWorkspaceRoot, fsFolderRoot, home],
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

  const pickWorkspaceRoot = useCallback(async () => {
    if (!activeWorkspace) return;
    const selected = await openFolderDialog({ directory: true });
    if (typeof selected === "string") {
      setWorkspaceRoot(activeWorkspace.id, toForwardSlashes(selected));
    }
  }, [activeWorkspace, setWorkspaceRoot]);

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
  const liveAgentWorktree = useAgentStore((s) =>
    activeTabId ? (s.sessions[activeTabId]?.meta?.worktreeCwd ?? null) : null,
  );
  const agentWorktree = tabWorktree(activeTab, liveAgentWorktree);
  usePruneSleepingWorktree(activeWorkspaceId, activeTab, updateTabData);
  scriptFocusFolderRef.current = agentWorktree ?? contextCwdRef.current;

  const focusSidebar = useCallback(
    (
      folder: string,
      opts: { fromShortcut: boolean; pendingAction?: RevealAction },
    ) => {
      const ws = activeWorkspace;
      if (!ws) return;
      void Promise.all([
        native.gitResolveRepo(folder).catch(() => null),
        native.canonicalize(folder).catch(() => folder),
      ])
        .then(([info, canonicalFolder]) => {
          const resolvedGitRoot = info?.repoRoot
            ? logicalRepoRoot(folder, canonicalFolder, info.repoRoot)
            : null;
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
            workspaceId: ws.id,
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
        if (shouldSwitchToExplorer && sidebarViewRef.current !== "explorer") {
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
  const prevAutofocusRef = useRef<AutofocusKey | undefined>(undefined);
  useEffect(() => {
    const ap = activeTab;
    const target = ap && isAutofocusActive(ap, autofocusMode, !!activeWorkspace?.workspaceRoot) ? activeTabFocusTarget : null;
    const next: AutofocusKey = {
      workspaceId: activeWorkspaceId,
      signal: target ? `${activeTabId}|${agentWorktree ?? ""}` : null,
    };
    const fire = autofocusDecision(prevAutofocusRef.current, next);
    prevAutofocusRef.current = next;
    if (fire && target) focusSidebar(target, { fromShortcut: false });
  }, [activeWorkspaceId, activeTabId, activeTab, agentWorktree, activeTabFocusTarget, focusSidebar, autofocusMode, activeWorkspace?.workspaceRoot]);

  useEffect(() => {
    lastFocusFolderRef.current = null;
  }, [activeWorkspaceId]);

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
    void Promise.all([
      native.gitResolveRepo(workspaceRootPath),
      native.canonicalize(workspaceRootPath).catch(() => workspaceRootPath),
    ])
      .then(([info, canonical]) => {
        if (cancelled) return;
        setWorkspaceGitRoot(
          info?.repoRoot
            ? logicalRepoRoot(workspaceRootPath, canonical, info.repoRoot)
            : null,
        );
      })
      .catch(() => {
        if (!cancelled) setWorkspaceGitRoot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceRootPath]);

  // ── Ask-me folder palette (Open new terminals in: Ask me) ────────────────
  // The palette asks for the folder before any terminal exists; `split` marks a
  // split entry point, where the anchor pane is fixed and only the folder is asked.
  const [folderPaletteOpen, setFolderPaletteOpen] = useState(false);
  const [folderAskTarget, setFolderAskTarget] = useState<{
    wsId?: string;
    paneId?: string;
    split?: "horizontal" | "vertical";
  } | null>(null);

  const openNewTerminal = useCallback(
    (targetPaneId?: string, targetWsId?: string) => {
      setFolderAskTarget({ wsId: targetWsId, paneId: targetPaneId });
      setFolderPaletteOpen(true);
    },
    [],
  );

  // ── Window title ──────────────────────────────────────────────────────────

  useEffect(() => {
    const project = explorerRoot
      ? pathBasename(explorerRoot, { tolerateTrailingSlash: true })
      : "";
    const shownCwd = (isTerminalTab && agentWorktree) || activeCwd;
    const label = activeTab
      ? shownCwd
        ? pathBasename(shownCwd, { tolerateTrailingSlash: true })
        : tabDisplayTitleNow(activeTab)
      : "";
    let title: string;
    if (project && label && label !== project) title = `${project} - ${label}`;
    else title = project || label || "Kex";
    document.title = title;
    void getCurrentWindow()
      .setTitle(title)
      .catch(() => {});
  }, [explorerRoot, activeCwd, activeTab, agentWorktree, isTerminalTab]);

  // ── Dialogs ───────────────────────────────────────────────────────────────

  const [newEditorOpen, setNewEditorOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const folderPaletteOpenRef = useRef(false);
  folderPaletteOpenRef.current = folderPaletteOpen;
  const commandPaletteOpenRef = useRef(false);
  commandPaletteOpenRef.current = commandPaletteOpen;
  const [paletteInitialMode, setPaletteInitialMode] = useState<
    "commands" | "content" | "history"
  >("commands");
  const openCommandPalette = useCallback(
    (mode: "commands" | "content" | "history" = "commands") => {
      setPaletteInitialMode(mode);
      setCommandPaletteOpen(true);
    },
    [],
  );

  // Two palettes never stack: opening the command palette drops a pending folder ask.
  useEffect(() => {
    if (!commandPaletteOpen) return;
    setFolderPaletteOpen(false);
    setFolderAskTarget(null);
  }, [commandPaletteOpen]);

  // ── Open tab helpers ────────────────────────────────────────────────────

  const openFileInTab = useCallback(
    (path: string, pin?: boolean, workspaceId?: string) => {
      const target =
        (workspaceId
          ? workspacesRef.current.find((w) => w.id === workspaceId)
          : activeWorkspace) ?? activeWorkspace;
      if (!target) return undefined;
      const markdown = isMarkdownPath(path);
      // Check if already open (as editor or rendered markdown); activate it.
      const existingOpenTab = findOpenPathTab(target.paneTree, path);
      if (existingOpenTab) {
        const existing = existingOpenTab.tab;
        if (pin && isFilePreviewTab(existing)) {
          updateTabData(target.id, existing.id, (p) =>
            isFilePreviewTab(p) ? { ...p, preview: false } : p,
          );
        }
        activateTab(target.id, existing.id);
        flashTab(existing.id);
        return existing.id;
      }
      const tabId = newTabId();
      const isPreview = !(pin ?? false);
      const newTab: Tab = markdown
        ? { id: tabId, kind: "markdown", path, preview: isPreview }
        : { id: tabId, kind: "editor", path, dirty: false, preview: isPreview };

      if (isPreview) {
        const pane = allPanes(target.paneTree).find(
          (p) => p.id === target.activePaneId,
        );
        const existingPreview = pane
          ? findReplaceableFilePreview(pane.tabs)
          : undefined;
        if (existingPreview) {
          replaceTab(
            target.id,
            target.activePaneId,
            existingPreview.id,
            newTab,
          );
          return tabId;
        }
      }

      openTab(target.id, target.activePaneId, newTab);
      return tabId;
    },
    [activeWorkspace, activateTab, openTab, replaceTab, updateTabData],
  );

  const openFileAndFocus = useCallback(
    (path: string, pin?: boolean) => {
      const id = openFileInTab(path, pin);
      if (id == null) return;
      const markdown = isMarkdownPath(path);
      focusWhenReady(() => {
        if (markdown) {
          const h = markdownHandles.current.get(id);
          h?.focus();
          return h != null;
        }
        return editorHandles.current.get(id)?.focus() ?? false;
      });
    },
    [openFileInTab],
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
      splitPaneAndOpenTab(
        activeWorkspace.id,
        activeWorkspace.activePaneId,
        "right",
        {
          id: newTabId(),
          kind: "markdown",
          path,
          title: pathBasename(path),
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
    return p.kind === "terminal"
      ? tabDirIn(p, useAgentStore.getState().sessions[leafId]?.meta?.worktreeCwd) ?? null
      : null;
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
      if (found?.tab.kind !== "browser") return;
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
  const focusTab = useCallback(
    (tabId: string) => {
      const kind = findTabGlobal(tabId)?.tab.kind;
      requestAnimationFrame(() =>
        focusTabContent(kind, tabId, {
          focusEditor: (id) => editorHandles.current.get(id)?.focus(),
          focusMarkdown: (id) => markdownHandles.current.get(id)?.focus(),
          focusBrowser: (id) => browserHandles.current.get(id)?.focusAddressBar(),
          focusLeaf: requestLeafFocus,
        }),
      );
    },
    [findTabGlobal],
  );

  // The one place a navigation gesture (tab click, tab and linear shortcuts,
  // agent jumps) activates a tab: it also hands the tab its focus, so a new
  // caller cannot forget it. File-open flows activate with activateTab and
  // decide their own focus.
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
      focusTab(tabId);
    },
    [activateTab, focusTab],
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

  const canSplitTerminal = useCallback(
    (
      wsId: string,
      paneId: string,
      orientation: "horizontal" | "vertical",
    ): boolean => {
      const { paneSplitLimit, workspacePaneLimit } =
        usePreferencesStore.getState();
      const ws = workspacesRef.current.find((w) => w.id === wsId);
      if (!ws) return false;
      if (allPanes(ws.paneTree).length >= workspacePaneLimit) {
        toastSplitBlocked("pane-limit", workspacePaneLimit);
        return false;
      }
      const el = document.querySelector<HTMLElement>(
        `[data-pane-id="${paneId}"]`,
      );
      const limit =
        orientation === "horizontal"
          ? paneSplitLimit.width
          : paneSplitLimit.height;
      const side = el?.getBoundingClientRect()[
        orientation === "horizontal" ? "width" : "height"
      ];
      if (!el || side === undefined || side < limit) {
        toastSplitBlocked(orientation === "horizontal" ? "too-narrow" : "too-short");
        return false;
      }
      return true;
    },
    [],
  );

  const splitAndOpenTerminal = useCallback(
    (
      wsId: string,
      paneId: string,
      orientation: "horizontal" | "vertical",
      cwd: string,
    ) => {
      setZenPaneId(null);
      const newPaneId = splitPane(wsId, paneId, orientation);
      openTab(wsId, newPaneId, { id: newTabId(), kind: "terminal", cwd });
    },
    [splitPane, openTab],
  );

  const onSplitTerminalRightStable = useCallback(
    (wsId: string, paneId: string) => {
      if (!canSplitTerminal(wsId, paneId, "horizontal")) return;
      setFolderAskTarget({ wsId, paneId, split: "horizontal" });
      setFolderPaletteOpen(true);
    },
    [canSplitTerminal],
  );

  const onSplitTerminalDownStable = useCallback(
    (wsId: string, paneId: string) => {
      if (!canSplitTerminal(wsId, paneId, "vertical")) return;
      setFolderAskTarget({ wsId, paneId, split: "vertical" });
      setFolderPaletteOpen(true);
    },
    [canSplitTerminal],
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
              updateTabData(ws.id, tab.id, (p) =>
                p.kind === "editor" || p.kind === "markdown"
                  ? { ...p, path: to, title: pathBasename(to) }
                  : p,
              );
            } else if (ep.path.startsWith(`${from}/`)) {
              const newPath = `${to}${ep.path.slice(from.length)}`;
              updateTabData(ws.id, tab.id, (p) =>
                p.kind === "editor" || p.kind === "markdown"
                  ? {
                      ...p,
                      path: newPath,
                      title: pathBasename(newPath),
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
      const parent = pathDirname(oldPath);
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
      onActivateTabStable(found.workspace.id, tabId);
    },
    [onActivateTabStable, findTabGlobal, setActiveWorkspaceId],
  );

  useEffect(() => startAgentTitleSync(setAgentTitles, clearAgentTitles), [setAgentTitles, clearAgentTitles]);
  useEffect(
    () => startSidebarSnapshotSync(applyExplorerSnapshotBatch),
    [applyExplorerSnapshotBatch],
  );
  // Flush on cleanup so a restore after a workspace switch never reads a stale snapshot; the
  // open and side setters already flush synchronously, this is their safety net.
  useEffect(
    () => () => {
      flushSidebarSnapshotsNow();
    },
    [activeWorkspaceId, sidebarOpen],
  );

  const handleExplorerSnapshot = useCallback(
    (s: ExplorerSnapshot) => {
      if (activeWorkspaceId) pushSidebarSnapshot(activeWorkspaceId, s);
    },
    [activeWorkspaceId],
  );

  const hibernateFlow = useHibernateFlow({
    workspacesRef,
    activeWorkspaceIdRef,
    hibernateWorkspace,
    updateTabData,
    foregroundProcess: leafHasForegroundProcess,
    readLeafAnsi: leafAnsiTail,
  });
  useHibernateLinesCleanup(workspaces);
  const { requestHibernate, performHibernate, requestAutoHibernate } = hibernateFlow;
  useAutoHibernate({ workspacesRef, activeWorkspaceIdRef, requestAutoHibernate });
  const pendingHibernateRef = useRef(hibernateFlow.pending);
  pendingHibernateRef.current = hibernateFlow.pending;
  const { cancel: cancelHibernate } = hibernateFlow;
  useEffect(() => {
    if (isPendingStale(hibernateFlow.pending?.workspaceId ?? null, workspaces)) cancelHibernate();
  }, [hibernateFlow.pending, workspaces, cancelHibernate]);
  const handleHibernateFromDialog = useCallback(() => {
    const pending = pendingHibernateRef.current;
    if (pending) void performHibernate(pending.workspaceId, pending.tabIds);
  }, [performHibernate]);

  // Wakes a sleeping tab and gives it the focus once it is mounted again.
  const wakeAndFocusTab = useCallback(
    async (tabId: string) => {
      const found = findTabGlobal(tabId);
      if (!found) return;
      await wakeTabs(found.workspace.id, [tabId]);
      setTimeout(() => focusTab(tabId), 50);
    },
    [findTabGlobal, wakeTabs, focusTab],
  );
  const toggleTabHibernate = useCallback(
    (tabId: string) => {
      const found = findTabGlobal(tabId);
      if (found?.tab.kind !== "terminal") return;
      if (found.tab.hibernation) void wakeAndFocusTab(tabId);
      else void requestHibernate(found.workspace.id, [tabId]);
    },
    [findTabGlobal, wakeAndFocusTab, requestHibernate],
  );
  const hibernateAllInWorkspace = useCallback(
    (workspaceId: string) => {
      const ws = workspacesRef.current.find((w) => w.id === workspaceId);
      if (ws) void requestHibernate(workspaceId, awakeTerminalTabs(ws).map((t) => t.id));
    },
    [requestHibernate],
  );

  const closeFlow = useCloseWorkspaceFlow({
    workspacesRef,
    flushDirtyEditors,
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

  useRestoreFocusAfterRename(focusActiveTab);

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

  const moveTabFromPalette = useCallback(
    (subject: MoveSubject, target: string | "new") => {
      void handleMoveTabFollowingFocus(
        subject.workspaceId,
        subject.tabId,
        target === "new" ? { kind: "new" } : { kind: "auto", workspaceId: target },
      );
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
    closeTabs,
    resolveEditor,
    resolveTerminal,
  } = useTabCloseGuards({
    disposeTab: (workspaceId, tabId, batchId) => {
      const found = findTabGlobal(tabId);
      if (found?.tab.kind === "browser" && found.tab.floating) {
        void closeFloatWindow(tabId);
      }
      closeTab(workspaceId, tabId, batchId);
    },
    findTab: findTabGlobal,
    saveTab,
    reportSaveError,
    focusActiveTab,
    isAutoSaveEnabled: () => usePreferencesStore.getState().editorAutoSave,
  });

  closeTabsRef.current = closeTabs;

  const closeTabDialogWorkspace = useMemo(
    () => workspaces.find((w) => w.id === pendingTerminalCloseTab?.workspaceId) ?? null,
    [workspaces, pendingTerminalCloseTab],
  );

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
      } else if (sidebarViewRef.current === tab) {
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
    const inExplorer = sidebar.open && sidebarViewRef.current === "explorer";
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
              isAutofocusActive(
                found.tab,
                autofocusMode,
                !!found.workspace.workspaceRoot,
              )
            ) {
              focusSidebar(
                tabWorktree(
                  found.tab,
                  useAgentStore.getState().sessions[tabId]?.meta?.worktreeCwd,
                ) ?? cwd,
                { fromShortcut: false },
              );
            }
          }
        }
      },
      onRunningCommand: (tabId, cmd, started) => {
        const found = findTabGlobal(tabId);
        if (found) {
          setTerminalRunningCommand(
            found.workspace.id,
            tabId,
            displayedRunningCommand(cmd, getRunningScriptCommand(tabId)),
          );
        }
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
            p.kind === "editor" || p.kind === "markdown"
              ? { ...p, dirty, ...(dirty ? { preview: false } : {}) }
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
        if (tabId === activeTabId) setActiveMarkdownHandle(handle);
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
        if (found?.tab.kind !== "git-diff") return;
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
      onWakeTab: (tabId) => void wakeAndFocusTab(tabId),
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
      wakeAndFocusTab,
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

  const activeTabKind = activeTab?.kind;
  const searchTarget = useMemo<SearchTarget>(
    () =>
      buildSearchTarget({
        tabKind: activeTabKind,
        tabId: activeTabId,
        terminalAddon: activeSearchAddon,
        editorHandle: activeEditorHandle,
        markdownHandle: activeMarkdownHandle,
        gitHistoryHandle,
        focusTerminal: requestLeafFocus,
      }),
    [
      activeTabKind,
      activeTabId,
      activeSearchAddon,
      activeEditorHandle,
      activeMarkdownHandle,
      gitHistoryHandle,
    ],
  );

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
    // The native menu reaches this without passing through `shortcutsDisabled`.
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

  // "Close All Tabs" in the workspace menu: every unlocked tab of every pane,
  // not just the focused one. Locked tabs are protected like in the pane action.
  const closeAllTabsInWorkspace = useCallback((workspaceId: string) => {
    const ws = workspacesRef.current.find((w) => w.id === workspaceId);
    if (!ws) return;
    const ids = allPanes(ws.paneTree).flatMap((pane) => bulkClosableIds(pane.tabs));
    if (ids.length) void closeTabsRef.current(ids);
  }, []);

  const tabCallbacksRef = useRef(tabCallbacks);
  tabCallbacksRef.current = tabCallbacks;
  const saveTabRef = useRef(saveTabReportingErrors);
  saveTabRef.current = saveTabReportingErrors;
  const toggleHibernateRef = useRef(toggleTabHibernate);
  toggleHibernateRef.current = toggleTabHibernate;
  const sidebarTabMenu = useSidebarTabMenuActions({ workspacesRef, closeTabsRef, saveTabRef, toggleHibernateRef, tabCallbacksRef });
  const sidebarGit = useMemo<SidebarGit>(
    () => ({
      workspaceId: activeWorkspaceId,
      status: sourceControl.status,
      statusMap: sourceControl.status ? buildGitStatusMap(sourceControl.status) : null,
      scheme: gitColorScheme,
    }),
    [activeWorkspaceId, sourceControl.status, gitColorScheme],
  );

  const detailFilter = useDetailFilter();
  const cycleLinear = useCallback(
    (delta: 1 | -1) => {
      if (!activeWorkspaceId) return;
      const visible = visibleWorkspaceOrder(
        workspaces,
        groups,
        collapsedGroups,
        activeWorkspaceId,
      );
      const { sessions, notifications, tabLocations: live } =
        useAgentStore.getState();
      const entries = entriesByWorkspace(
        buildAgentEntries(sessions, notifications, live),
      );
      const navWorkspaces = visible.map((w) => {
        const tabs =
          w.detailExpanded
            ? allPanes(w.paneTree).flatMap((p) => p.tabs)
            : [];
        const agentTabIds = new Set(
          tabs.filter((t) => t.kind === "terminal" && sessions[t.id]).map((t) => t.id),
        );
        const rows = workspaceDetailRows(
          tabs,
          agentTabIds,
          entries[w.id] ?? [],
          detailFilter,
        );
        return { id: w.id, rowTabIds: rows.map((r) => r.tabId) };
      });
      const current = visible.find((w) => w.id === activeWorkspaceId);
      const target = linearNavTarget(
        navWorkspaces,
        {
          workspaceId: activeWorkspaceId,
          tabId: current ? focusedTabId(current.paneTree, current.activePaneId) : null,
        },
        delta,
      );
      if (!target) return;
      if (target.workspaceId !== activeWorkspaceId) {
        setActiveWorkspaceId(target.workspaceId);
      }
      if (target.tabId) onActivateTabStable(target.workspaceId, target.tabId);
    },
    [
      workspaces,
      groups,
      collapsedGroups,
      activeWorkspaceId,
      detailFilter,
      setActiveWorkspaceId,
      onActivateTabStable,
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
    if (sidebar.open && sidebarViewRef.current === "explorer") {
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

  const paletteTerminalTargetRef = useRef<TerminalTarget | null>(null);
  const onPaletteTerminalTargetChange = useCallback(
    (target: TerminalTarget | null) => {
      paletteTerminalTargetRef.current = target;
    },
    [],
  );
  const openTerminalAtPaletteTarget = useCallback(
    async (target: TerminalTarget) => {
      setCommandPaletteOpen(false);
      const ws =
        workspacesRef.current.find((w) => w.id === target.workspaceId) ??
        workspacesRef.current.find((w) => w.id === activeWorkspaceIdRef.current);
      if (!ws) return;
      const beside = target.besideTabId
        ? findTabPane(ws.paneTree, target.besideTabId)
        : null;
      const pane = beside?.pane ?? findPane(ws.paneTree, ws.activePaneId);
      if (!pane) return;
      const index = beside
        ? pane.tabs.findIndex((t) => t.id === target.besideTabId) + 1
        : undefined;
      const id = newTabId();
      setActiveWorkspaceId(ws.id);
      openTab(ws.id, pane.id, { id, kind: "terminal", cwd: target.cwd }, index);
      activateTab(ws.id, id);
    },
    [setActiveWorkspaceId, openTab, activateTab],
  );
  const dismissPalettes = useCallback(() => {
    setCommandPaletteOpen(false);
    setFolderPaletteOpen(false);
  }, []);
  const shortcutHandlers = useMemo<ShortcutHandlers>(
    () => ({
      "commandPalette.open": () => openCommandPalette("commands"),
      "commandPalette.content": () => openCommandPalette("content"),
      "commandPalette.history": () => {
        // The sync gate in shortcutsDisabled cannot see an agent that fakes the
        // shell's prompt markers (omp renders OSC 133 A/B/C/D around each user
        // message, which clears the running command); the process tree can.
        const tabId = activeTabId;
        if (!tabId || activeTab?.kind !== "terminal") return;
        void leafHasForegroundProcess(tabId).then((foreground) => {
          if (foreground === null) openCommandPalette("history");
        });
      },
      "palette.folderCurrent": () => void runPaletteShortcut("folderCurrent"),
      "palette.folderRoot": () => void runPaletteShortcut("folderRoot", 1),
      "palette.folderMain": () => void runPaletteShortcut("folderMain", 2),
      "palette.folderHome": () => void runPaletteShortcut("folderHome", 3),
      "palette.worktrees": () => void runPaletteShortcut("worktrees"),
      "palette.menuAction": (e) => void runPaletteShortcut("menuAction", parseInt(e.key, 10)),
      "tab.new": () => {
        if (runPaletteShortcut("newTab")) return;
        const target = paletteTerminalTargetRef.current;
        if (target) void openTerminalAtPaletteTarget(target);
        else if (commandPaletteOpenRef.current) {
          setCommandPaletteOpen(false);
          window.setTimeout(() => openNewTerminal(), 0);
        } else openNewTerminal();
      },
      "workspace.new": () => addWorkspace(home ?? undefined),
      "workspace.close": () => {
        if (runPaletteShortcut("closeWorkspace")) return;
        if (activeWorkspace) void requestCloseWorkspace(activeWorkspace.id);
      },
      "workspace.rename": () => {
        useContextMenuCloseStore.getState().closeAll();
        const store = useWorkspaceRenameStore.getState();
        if (store.renamingId !== null) {
          store.toggleTemplates();
          return;
        }
        if (activeWorkspaceId) store.startRename(activeWorkspaceId);
      },
      "tab.hibernate": () => {
        if (activeTabId) toggleTabHibernate(activeTabId);
      },
      "tab.wake": () => {
        if (activeTabId) void wakeAndFocusTab(activeTabId);
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
        else if (action === "toggle") store.toggleTemplates();
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
        dismissPalettes();
        if (!activeWorkspace || !activePane) return;
        const tabs = activePane.tabs;
        if (tabs.length < 2) return;
        const idx = tabs.findIndex((p) => p.id === activePane.activeTabId);
        const next = tabs[(idx + 1) % tabs.length];
        onActivateTabStable(activeWorkspace.id, next.id);
      },
      "tab.prev": () => {
        dismissPalettes();
        if (!activeWorkspace || !activePane) return;
        const tabs = activePane.tabs;
        if (tabs.length < 2) return;
        const idx = tabs.findIndex((p) => p.id === activePane.activeTabId);
        const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
        onActivateTabStable(activeWorkspace.id, prev.id);
      },
      "tab.selectByIndex": (e) => {
        dismissPalettes();
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
      "explorer.search": () => {
        dismissPalettes();
        handleExplorerSearch();
      },
      "terminal.clear": () => {
        clearFocusedTerminal();
      },
      "terminal.scratchpad": () => {
        if (activeTabId && activeTab?.kind === "terminal") {
          toggleScratchpad(activeTabId);
        }
      },
      "search.focus": () => {
        dismissPalettes();
        searchInlineRef.current?.focus();
      },
      "settings.open": () => void openSettingsWindow(),
      "notifications.toggle": () => useBellStore.getState().toggle(),
      "window.new": () => void native.openMainWindow(),
      "nav.prev": () => {
        dismissPalettes();
        cycleLinear(-1);
      },
      "nav.next": () => {
        dismissPalettes();
        cycleLinear(1);
      },
      "workspace.selectByIndex": (e) => {
        dismissPalettes();
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
        if (found) updateTabData(found.workspace.id, activeTabId, toggleTabLock);
      },
      "tab.focusOnExplorer": focusActiveTabInExplorer,
      "path.copy": () => {
        if (!activeTab) return;
        let value: string | undefined;
        let label: string;
        if (activeTab.kind === "editor" || activeTab.kind === "markdown") {
          value = activeTab.path;
          label = "Copied current Editor file path";
        } else if (activeTab.kind === "terminal") {
          value = scriptFocusFolderRef.current ?? activeTab.cwd;
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
      dismissPalettes,
      cycleLinear,
      onActivateTabStable,
      handleCloseActiveTab,
      reopenClosed,
      requestCloseWorkspace,
      focusSidebar,
      agentWorktree,
      openNewTerminal,
      openTerminalAtPaletteTarget,
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
      activeTabId,
      toggleTabHibernate,
    ],
  );

  const shortcutContext = useMemo(
    () => ({
      activeTab,
      hasWorkspaceRoot: !!activeWorkspace?.workspaceRoot,
    }),
    [activeWorkspace?.workspaceRoot, activeWorkspace?.actions, activeTab],
  );

  const shortcutsDisabled = useCallback(
    (id: ShortcutId, e: KeyboardEvent) => {
      // The global listener runs in capture phase before the Radix dialog, so a modal does not block it; without this a shortcut could switch or close the workspace, or retarget the dialog.
      if (workspaceDialogPending(hibernateFlow.pending, closeFlow.pending?.id)) return true;
      if (
        shortcutUnavailableBehindPalette(id, shortcutContext, {
          open: commandPaletteOpenRef.current || folderPaletteOpenRef.current,
          ownsTabShortcut: isPaletteTabShortcut(id),
        })
      ) {
        return true;
      }
      if (
        shortcutBlockedByPalette(
          id,
          openPaletteOf(commandPaletteOpenRef.current, folderPaletteOpenRef.current),
        )
      ) {
        return true;
      }
      if (id === "tab.wake") {
        return (
          enterBelongsToFocusedElement(e.target as Element | null) ||
          !!sidebarRef.current?.isExplorerFocused()
        );
      }
      if (id === "terminal.clear") {
        const target =
          (e.target as HTMLElement | null) ?? document.activeElement;
        return !(target as HTMLElement | null)?.closest?.(".xterm");
      }
      if (id === "commandPalette.history") {
        // Live reads: a command starting or ending does not re-render the app.
        if (!activeTabId || activeTab?.kind !== "terminal") return true;
        return historyPaletteShortcutUnavailable({
          activeTab,
          promptReady: leafPromptReady(activeTabId),
          runningCommand: getRunningCommand(activeTabId),
        });
      }
      if (id === "file.rename") {
        if (sidebarRef.current?.isExplorerFocused()) return true;
        return !!(document.activeElement as HTMLElement | null)?.closest?.(
          "[data-scm-panel]",
        );
      }

      return false;
    },
    [shortcutContext, hibernateFlow.pending, closeFlow.pending?.id],
  );

  const globalShortcutHandlers = useMemo(
    () => withPaletteTabShortcuts(shortcutHandlers, runPaletteTabItem),
    [shortcutHandlers],
  );
  useGlobalShortcuts(globalShortcutHandlers, { isDisabled: shortcutsDisabled });

  // ── Agent activation ──────────────────────────────────────────────────────

  useEffect(() => {
    useAgentStore.getState().setTabLocations(tabLocations(workspaces));
    useAgentStore.getState().setUserTabTitles(userTabTitles(workspaces));
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
    let disposed = false;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .listen<{ workspaceId: string; tabId: string }>(
        "kex:activate-tab",
        (e) => {
          onActivateAgent(e.payload.workspaceId, e.payload.tabId);
        },
      )
      .then((u) => {
        if (disposed) {
          u();
          return;
        }
        unlisten = u;
      })
      .catch((e) => console.error("[kex] kex:activate-tab listen failed:", e));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onActivateAgent]);

  // ── Native macOS menu wiring ──────────────────────────────────────────────
  // The menu (built in Rust) emits `kex:menu` with the item id; dispatch to the
  // same handlers the shortcuts use. Kept in a ref so the listener stays stable.
  const menuDispatchRef = useRef<(id: string) => void>(() => {});
  menuDispatchRef.current = (id: string) => {
    if (
      menuItemBlockedByPalette(
        id,
        openPaletteOf(commandPaletteOpenRef.current, folderPaletteOpenRef.current),
      )
    ) {
      return;
    }
    switch (id) {
      case "settings":
        void openSettingsWindow();
        break;
      case "new_window":
        void native.openMainWindow();
        break;
      case "new_workspace":
        addWorkspace(home ?? undefined);
        break;
      case "new_terminal":
        if (runPaletteShortcut("folderCurrent")) break;
        shortcutHandlers["tab.new"]?.(new KeyboardEvent("keydown"));
        break;
      case "new_browser":
        openBrowserInTab("");
        break;
      case "toggle_autosave":
        void setEditorAutoSave(!usePreferencesStore.getState().editorAutoSave);
        break;
      case "close_tab":
        if (runPaletteTabItem("close")) break;
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
    let disposed = false;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .listen<string>("kex:menu", (e) => menuDispatchRef.current(e.payload))
      .then((u) => {
        if (disposed) {
          u();
          return;
        }
        unlisten = u;
      })
      .catch((e) => console.error("[kex] kex:menu listen failed:", e));
    return () => {
      disposed = true;
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
    }).catch((e) => console.error("[kex] sync_menu failed:", e));
  }, [editorAutoSave, sidebarOpen, sidebarView, sidebarSide, activeShowHidden]);

  // ── Command palette ───────────────────────────────────────────────────────

  const paletteDirs = useMemo(
    () =>
      commandPaletteOpen
        ? workspaces.flatMap((w) =>
            allPanes(w.paneTree).flatMap((p) =>
              p.tabs.map((t) => tabDirIn(t, useAgentStore.getState().sessions[t.id]?.meta?.worktreeCwd) ?? ""),
            ),
          )
        : [],
    [commandPaletteOpen, workspaces],
  );
  const dirGitVersion = usePaletteGit(commandPaletteOpen, paletteDirs);
  const paletteSources = useMemo(
    () => (commandPaletteOpen ? liveTabSources() : null),
    // dirGitVersion: branches arrive after the palette opens, and the entries must pick them up.
    [commandPaletteOpen, workspaces, dirGitVersion],
  );
  const paletteTabEntries = useMemo(
    () => (paletteSources ? buildTabEntries(workspaces, paletteSources) : []),
    [paletteSources, workspaces],
  );
  const paletteWorkspaceEntries = useMemo(
    () => (paletteSources ? buildWorkspaceEntries(workspaces, paletteSources) : []),
    [paletteSources, workspaces],
  );

  // ── Ask-me folder palette data ────────────────────────────────────────────
  // Every folder the palette can list shows its branch: tab folders, workspace roots and home.
  const folderPaletteDirs = useMemo(
    () =>
      folderPaletteOpen
        ? [
            homeRef.current ?? "",
            ...workspaces.flatMap((w) => [
              w.workspaceRoot ?? w.fsRoot ?? "",
              ...allPanes(w.paneTree).flatMap((p) =>
                p.tabs.map((t) => tabDirIn(t, useAgentStore.getState().sessions[t.id]?.meta?.worktreeCwd) ?? ""),
              ),
            ]),
          ]
        : [],
    [folderPaletteOpen, workspaces],
  );
  const folderDirGitVersion = usePaletteGit(folderPaletteOpen, folderPaletteDirs);
  const folderSources = useMemo(
    () => (folderPaletteOpen ? liveTabSources() : null),
    // dirGitVersion: branches arrive after the palette opens, and the entries must pick them up.
    [folderPaletteOpen, workspaces, folderDirGitVersion],
  );
  const folderTabEntries = useMemo(
    () => (folderSources ? buildTabEntries(workspaces, folderSources) : []),
    [folderSources, workspaces],
  );
  const folderWorkspaceEntries = useMemo(
    () => (folderSources ? buildWorkspaceEntries(workspaces, folderSources) : []),
    [folderSources, workspaces],
  );
  const folderActiveEntry =
    folderTabEntries.find((e) => e.tabId === activeTabId) ?? null;
  const folderRepoRoots = useMemo(
    () =>
      folderSources
        ? folderPaletteDirs.map((dir) => (dir ? folderSources.git(dir).repoRoot : ""))
        : [],
    [folderSources, folderPaletteDirs],
  );
  const folderWorktrees = useRepoWorktrees(folderPaletteOpen, folderRepoRoots);
  // Repositories whose worktrees the user added with Tab, and the workspace they went to.
  const [folderExpansions, setFolderExpansions] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  // The worktree that had the focus when its repository was collapsed stays listed.
  const [folderKept, setFolderKept] = useState<
    ReadonlyMap<string, { workspaceId: string; path: string }>
  >(() => new Map());
  useEffect(() => {
    setFolderExpansions(new Map());
    setFolderKept(new Map());
  }, [folderPaletteOpen]);
  const onFolderToggleWorktrees = useCallback(
    (row: FolderRow) => {
      const repoKey = row.repoKey;
      if (!repoKey) return;
      const collapsing = folderExpansions.has(repoKey);
      setFolderExpansions((prev) => {
        const next = new Map(prev);
        if (collapsing) next.delete(repoKey);
        else next.set(repoKey, row.workspaceId);
        return next;
      });
      if (!collapsing) return;
      setFolderKept((prev) => {
        const next = new Map(prev);
        if (row.nested) next.set(repoKey, { workspaceId: row.workspaceId, path: row.path });
        else next.delete(repoKey);
        return next;
      });
    },
    [folderExpansions],
  );
  const folderGroups = useMemo(
    () =>
      folderSources
        ? buildFolderGroups({
            workspaces,
            workspaceEntries: folderWorkspaceEntries,
            activeWorkspaceId,
            home: homeRef.current,
            activeTabEntry: folderActiveEntry,
            entries: folderTabEntries,
            branchOf: (dir) => folderSources.git(dir).branch,
            repoOf: (dir) => folderSources.git(dir).repoRoot,
            worktreesByRepo: folderWorktrees,
            expansions: folderExpansions,
            kept: folderKept,
          })
        : [],
    [
      folderSources,
      workspaces,
      folderWorkspaceEntries,
      activeWorkspaceId,
      folderTabEntries,
      folderActiveEntry,
      folderWorktrees,
      folderExpansions,
      folderKept,
    ],
  );

  const onFolderPick = useCallback(
    async (row: FolderRow) => {
      setFolderPaletteOpen(false);
      const pending = folderAskTarget;
      setFolderAskTarget(null);
      // An entry point aimed at a specific pane (welcome, split): the anchor is
      // fixed and only the folder comes from the palette.
      if (pending?.wsId && pending.paneId) {
        if (pending.split) {
          if (canSplitTerminal(pending.wsId, pending.paneId, pending.split)) {
            splitAndOpenTerminal(pending.wsId, pending.paneId, pending.split, row.path);
          }
        } else {
          openTab(pending.wsId, pending.paneId, {
            id: newTabId(),
            kind: "terminal",
            cwd: row.path,
          });
        }
        return;
      }
      const target = workspacesRef.current.find((w) => w.id === row.workspaceId);
      if (!target) return;
      setActiveWorkspaceId(target.id);
      // openTab inserts right after the pane's focused tab and makes the new tab active.
      openTab(target.id, target.activePaneId, {
        id: newTabId(),
        kind: "terminal",
        cwd: row.path,
      });
    },
    [
      folderAskTarget,
      canSplitTerminal,
      splitAndOpenTerminal,
      openTab,
      setActiveWorkspaceId,
    ],
  );

  const [tabHistoryRecords, setTabHistoryRecords] = useState<TabHistoryRecord[]>([]);
  useEffect(() => {
    if (!commandPaletteOpen) return;
    let cancelled = false;
    void loadTabHistory().then((records) => {
      if (!cancelled) setTabHistoryRecords(records);
    });
    return () => {
      cancelled = true;
    };
  }, [commandPaletteOpen]);
  const paletteClosedEntries = useMemo(
    () =>
      paletteSources
        ? buildClosedTabEntries(tabHistoryRecords, workspaces, paletteTabEntries, (ws) =>
            paletteSources.workspaceTitle(ws),
          )
        : [],
    [paletteSources, tabHistoryRecords, workspaces, paletteTabEntries],
  );

  const onPaletteRunClosed = useCallback(
    async (entry: ClosedTabEntry) => {
      let target = workspacesRef.current.find((w) => w.id === entry.workspaceId);
      if (!target) {
        target = workspacesRef.current.find(
          (w) => w.id === activeWorkspaceIdRef.current,
        );
      }
      if (!target) return;
      setActiveWorkspaceId(target.id);
      if (entry.kind === "terminal") {
        openTab(target.id, target.activePaneId, {
          id: newTabId(),
          kind: "terminal",
          cwd: entry.path,
        });
      } else {
        openFileInTab(entry.path, true, target.id);
      }
    },
    [setActiveWorkspaceId, openTab, openFileInTab],
  );
  const onPaletteSelectTab = useCallback(
    (entry: TabEntry) => {
      void selectTab(entry, {
        wake: (workspaceId, tabId) => wakeTabs(workspaceId, [tabId]),
        goToTab: (id) => {
          goToTab(id);
          // A woken tab is not mounted yet, so the focus the line above asked for found nothing.
          setTimeout(() => focusTab(id), 50);
        },
      });
    },
    [wakeTabs, goToTab, focusTab],
  );
  const onPaletteCloseTab = useCallback((entry: TabEntry) => {
    if (entry.tab.locked) {
      flashLockIcon(entry.tabId);
      return;
    }
    return closeTabsRef.current([entry.tabId]);
  }, []);
  const onPaletteHibernateTab = useCallback(
    async (tabId: string) => {
      const found = findTabGlobal(tabId);
      if (found?.tab.kind !== "terminal" || found.tab.hibernation) return;
      await requestHibernate(found.workspace.id, [tabId]);
    },
    [findTabGlobal, requestHibernate],
  );
  const onPaletteRenameWorkspace = useCallback((workspaceId: string) => {
    useContextMenuCloseStore.getState().closeAll();
    useWorkspaceRenameStore.getState().startRename(workspaceId);
  }, []);
  const onPaletteCloseAllTabs = useCallback(
    (workspaceId: string) => void closeAllTabsInWorkspace(workspaceId),
    [closeAllTabsInWorkspace],
  );
  const onPaletteSelectWorkspace = useCallback(
    (entry: WorkspaceEntry) => {
      selectWorkspace(entry, { activate: setActiveWorkspaceId });
    },
    [setActiveWorkspaceId],
  );

  const commandPaletteItems = useMemo(
    () =>
      commandPaletteOpen
        ? createCommandItems({
            activeWorkspacePaneTree: activeWorkspace?.paneTree ?? null,
            workspacePaneLimit,
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
            hibernated: isHibernatedTab(activeTab),
            activePaneTabCount: activePane?.tabs.length ?? 0,
            hasActiveTab: !!activeTab,
            hasActiveTabTitle: !!activeTab?.title,
            closeOtherTabs: handleCloseOtherTabs,
            closeAllTabs: handleCloseAllTabs,
            resetActiveTabTitle: () => {
              if (activeTab && activeWorkspace)
                updateTabData(activeWorkspace.id, activeTab.id, (p) => ({ ...p, title: undefined }));
            },
            openActionsConfiguration: () => void openWorkspaceActionsSettings(),
            shortcutHandlers,
            isShortcutAvailable: (id) => !paletteShortcutUnavailable(id, shortcutContext),
            openSettingsSection: (section) => void openSettingsWindow(section),
            hasActiveTabNote: !!activeTab && hasTabNote(activeTab),
            removeActiveTabNote: () => {
              if (activeTab && activeWorkspace)
                updateTabData(activeWorkspace.id, activeTab.id, removeTabNote);
            },
            splitBrowserRight: () => {
              if (activeWorkspace)
                onSplitBrowserRightStable(activeWorkspace.id, activeWorkspace.activePaneId);
            },
            splitBrowserDown: () => {
              if (activeWorkspace)
                onSplitBrowserDownStable(activeWorkspace.id, activeWorkspace.activePaneId);
            },
            profilerRunning: performanceProfiler,
            toggleProfiler: () => void setPerformanceProfiler(!performanceProfiler),
          })
        : [],
    [
      commandPaletteOpen,
      activeWorkspace,
      workspacePaneLimit,
      performanceProfiler,
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
      activePane,
      handleCloseOtherTabs,
      handleCloseAllTabs,
      shortcutHandlers,
      shortcutContext,
      updateTabData,
      onSplitBrowserRightStable,
      onSplitBrowserDownStable,
    ],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const barOps = useMemo(
    () =>
      createBarOps({
        workspaceId: () => activeWorkspaceIdRef.current ?? undefined,
        updateWorkspaceAction,
        removeWorkspaceAction,
        reorderWorkspaceActions,
        placeWorkspaceAction,
        promoteWorkspaceAction,
        demoteGlobalAction,
        global: globalActions,
        unlink: unlinkRemovedActions,
        fail: (message, err) => {
          console.error(message, err);
          toast.error(message);
        },
      }),
    [updateWorkspaceAction, removeWorkspaceAction, reorderWorkspaceActions, placeWorkspaceAction, promoteWorkspaceAction, demoteGlobalAction],
  );

  const actionsController = useMemo(
    () => ({
      run: runAction,
      stop: stopAction,
      focus: focusActionTab,
      edit: (scope: "workspace" | "global", id: string) => void openActionSettings(scope, id),
      ...barOps,
    }),
    [runAction, stopAction, focusActionTab, barOps],
  );

  // Settings owns the Actions editor now; the workspace scope flows to it through the
  // broadcast and every edit comes back as an operation the stores apply.
  const workspaceActionsMutators = useMemo(
    () => ({
      add: addWorkspaceAction,
      update: (workspaceId: string, actionId: string, action: Action) => {
        const { id: _id, ...patch } = action;
        updateWorkspaceAction(workspaceId, actionId, patch);
      },
      remove: removeWorkspaceAction,
      reorder: reorderWorkspaceActions,
      toGlobal: promoteWorkspaceAction,
      toWorkspace: demoteGlobalAction,
    }),
    [addWorkspaceAction, updateWorkspaceAction, removeWorkspaceAction, reorderWorkspaceActions, promoteWorkspaceAction, demoteGlobalAction],
  );
  useWorkspaceActionsBroadcast({ workspace: activeWorkspace ?? null, mutators: workspaceActionsMutators });

  const onOpenActionsSettings = useCallback(() => {
    void openWorkspaceActionsSettings();
  }, []);

  // The dashed add of the Header leads straight to the editor, no scope menu in between:
  // Settings opens on the Global tab, where both add buttons wait.
  const onAddAction = useCallback(() => {
    void openGlobalActionsSettings();
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
        workspaceRoot: w.workspaceRoot,
        color: w.color,
        icon: w.icon,
        groupId: w.groupId,
        focusedTab: focusedTab(w.paneTree, w.activePaneId),
        tabs: w.detailExpanded
          ? allPanes(w.paneTree).flatMap((p) => p.tabs)
          : NO_TABS,
        tabCount: workspaceTabCount(w),
        focusedTabId: focusedTabId(w.paneTree, w.activePaneId),
        visibleTabIds: allPanes(w.paneTree)
          .map((p) => p.activeTabId)
          .filter(Boolean)
          .join(","),
        detailExpanded: w.detailExpanded,
        canHibernate: awakeTerminalTabs(w).length > 0,
      })),
    [workspaces],
  );

  const shell = (
    <ThemeProvider>
      <TooltipProvider>
        <ActionMenuProvider run={runAction} ws={activeWorkspace ?? null}>
        <div className="zoom-content relative flex h-[calc(100vh/var(--app-zoom))] flex-col overflow-hidden bg-background text-foreground">
          <Header
            onToggleSidebar={toggleSidebar}
            sidebarSide={sidebarSide}
            onOpenCommandPalette={() => openCommandPalette("commands")}
            onActivateAgent={onActivateAgent}
            onOpenSettings={() => void openSettingsWindow()}
            searchTarget={searchTarget}
            searchRef={searchInlineRef}
            actionsController={actionsController}
            onOpenActionsSettings={onOpenActionsSettings}
            onAddAction={onAddAction}
            activeWorkspace={activeWorkspace ?? null}
            activeTab={activeTab}
            groups={groups}
            onRestoreFocus={restoreLeafFocus}
          />

          {/* 3-column layout */}
          <div className="flex min-h-0 flex-1">
            <WorkspaceMoveProvider workspaces={workspaces} onMoveTab={handleMoveTabFromMenu}>
            <SidebarTabMenuProvider value={sidebarTabMenu}>
            <SidebarGitProvider value={sidebarGit}>
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
              onCloseAllTabs={(wsId) => void closeAllTabsInWorkspace(wsId)}
              onRename={(id, title) => setWorkspaceTitle(id, title)}
              onHibernate={hibernateAllInWorkspace}
              onWakeTab={(_workspaceId, tabId) => void wakeAndFocusTab(tabId)}
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
                {sidebarOpen && sidebarSide === "left" && (
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
                        workspaceId={activeWorkspaceId}
                        initialExplorer={activeWorkspace?.sidebar ?? null}
                        onExplorerSnapshot={handleExplorerSnapshot}
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
                        onOpenFile={openFileAndFocus}
                        onPathRenamed={handlePathRenamed}
                        onRevealInTerminal={openFolderInTerminal}
                        onNewWorkspaceFromFolder={newWorkspaceFromFolder}
                        onAddToGitignore={handleAddToGitignore}
                        onFocusOnExplorer={tabCallbacks.onFocusOnExplorer}
                        onPickWorkspaceRoot={pickWorkspaceRoot}
                        onExplorerSearchClose={onExplorerSearchClose}
                        openFiles={openFiles}
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
                {sidebarOpen && sidebarSide === "right" && (
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
                        workspaceId={activeWorkspaceId}
                        initialExplorer={activeWorkspace?.sidebar ?? null}
                        onExplorerSnapshot={handleExplorerSnapshot}
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
                        onOpenFile={openFileAndFocus}
                        onPathRenamed={handlePathRenamed}
                        onRevealInTerminal={openFolderInTerminal}
                        onNewWorkspaceFromFolder={newWorkspaceFromFolder}
                        onAddToGitignore={handleAddToGitignore}
                        onFocusOnExplorer={tabCallbacks.onFocusOnExplorer}
                        onPickWorkspaceRoot={pickWorkspaceRoot}
                        onExplorerSearchClose={onExplorerSearchClose}
                        openFiles={openFiles}
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
            </SidebarGitProvider>
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
            restoreFocus={focusActiveTab}
            initialMode={paletteInitialMode}
            commandItems={commandPaletteItems}
            actionsWorkspace={activeWorkspace ?? null}
            onRunAction={(item) => {
              if (item.state !== "idle" && focusActionTab(item.action)) return;
              runAction(item.action);
            }}
            onStopAction={(item) => stopAction(item.action)}
            onEditAction={(item) =>
              void openActionSettings(item.global ? "global" : "workspace", item.id)
            }
            workspaceRoot={explorerRoot}
            onOpenContentHit={openContentHit}
            insertCommand={insertHistoryCommand}
            activeTabId={activeTabId}
            activeWorkspaceId={activeWorkspaceId}
            tabEntries={paletteTabEntries}
            workspaceEntries={paletteWorkspaceEntries}
            closedEntries={paletteClosedEntries}
            onSelectTab={onPaletteSelectTab}
            onSelectWorkspace={onPaletteSelectWorkspace}
            onRunClosed={onPaletteRunClosed}
            onMoveTabToWorkspace={moveTabFromPalette}
            onUpdateTab={sidebarTabMenu.onUpdateTab}
            onSaveTab={sidebarTabMenu.onSaveTab}
            onHibernateTab={onPaletteHibernateTab}
            onWakeTab={(workspaceId, tabId) => wakeTabs(workspaceId, [tabId])}
            onGoToTab={goToTab}
            onTerminalTargetChange={onPaletteTerminalTargetChange}
            onOpenTerminalAt={openTerminalAtPaletteTarget}
            onCloseTab={onPaletteCloseTab}
            onCloseWorkspace={closeFlow.requestCloseAndWait}
            onRenameWorkspace={onPaletteRenameWorkspace}
            onHibernateWorkspace={hibernateAllInWorkspace}
            onCloseAllTabs={onPaletteCloseAllTabs}
          />

          <FolderPalette
            open={folderPaletteOpen}
            onOpenChange={setFolderPaletteOpen}
            restoreFocus={focusActiveTab}
            groups={folderGroups}
            onPick={onFolderPick}
            onToggleWorktrees={onFolderToggleWorktrees}
            workspaceOf={findWorkspaceById}
          />

          <NewEditorDialog
            open={newEditorOpen}
            onOpenChange={setNewEditorOpen}
            rootPath={explorerRoot ?? home}
            onCreated={(path) => openFileInTab(path, true)}
          />

          <UpdaterDialog />

          <HibernateDialog
            workspace={
              workspaces.find((w) => w.id === hibernateFlow.pending?.workspaceId) ??
              null
            }
            tabIds={hibernateFlow.pending?.tabIds}
            groupLabel={groupLabelOf(
              workspaces.find((w) => w.id === hibernateFlow.pending?.workspaceId)?.groupId,
              groups,
            )}
            onClose={hibernateFlow.cancel}
            onConfirm={handleHibernateFromDialog}
            onSaveTab={saveTabReportingErrors}
            onGoToTab={goToTab}
            onStopBusy={(row) => interruptAgentLeaf(row.tabId)}
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
            onClose={closeFlow.cancel}
            onConfirm={() => {
              const id = closeFlow.pending?.id;
              if (id) void closeFlow.performClose(id);
            }}
            onSaveTab={saveTabReportingErrors}
            onGoToTab={goToTab}
            onStopBusy={() => {}}
          />

          <HibernateDialog
            mode="close-tab"
            workspace={closeTabDialogWorkspace}
            tabIds={pendingTerminalCloseTab ? [pendingTerminalCloseTab.id] : undefined}
            groupLabel={groupLabelOf(closeTabDialogWorkspace?.groupId, groups)}
            onClose={() => resolveTerminal({ type: "cancel" })}
            onConfirm={() => resolveTerminal({ type: "close" })}
            onSaveTab={saveTabReportingErrors}
            onGoToTab={goToTab}
            onStopBusy={() => {}}
          />

          <CloseDialogs
            pendingCloseTab={pendingCloseTab}
            onCancelClose={() => resolveEditor({ type: "cancel" })}
            onSaveClose={() => resolveEditor({ type: "save" })}
            onDontSaveClose={() => resolveEditor({ type: "dont-save" })}
          />
        </div>
        </ActionMenuProvider>
      </TooltipProvider>
    </ThemeProvider>
  );

  return shell;
}
