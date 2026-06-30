import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getLaunchDir } from "@/lib/launchDir";
import { native } from "@/lib/native";
import { newTabId } from "@/lib/ids";
import { useZoom } from "@/lib/useZoom";
import { useEditorFont } from "@/modules/editor/lib/useEditorFont";
import { isMarkdownPath, isHtmlPath } from "@/lib/utils";
import { AgentNotificationsBridge, useBellStore } from "@/modules/agents";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import {
  loadRestorePlans,
  pruneOrphanedPlans,
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
  setWarnOnCloseWorkspace,
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
  cycleScratchpad,
  disposeSession,
  leafHasForegroundProcess,
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
  findPane,
  findPaneInDirection,
  findTabPane,
  tabTitle,
  siblingPane,
  type Tab,
  type TabCallbacks,
  type Rect,
  useWorkspaces,
  WorkspaceView,
} from "@/modules/workspaces";
import type { Script } from "@/modules/workspaces/lib/types";
import type { WelcomeActions } from "@/modules/workspaces/EmptyPaneWelcome";
import { WorkspaceDndProvider } from "@/modules/workspaces/WorkspaceDndProvider";
import { EditorChromeProvider } from "@/modules/workspaces/EditorChromeContext";
import { flashLockIcon } from "@/modules/workspaces/lib/lockFlashStore";
import { flashTab } from "@/modules/workspaces/lib/tabFlashStore";
import type { SearchAddon } from "@xterm/addon-search";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { IS_MAC } from "@/lib/platform";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CloseDialogs } from "./components/CloseDialogs";
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
import { useSidebarState } from "@/modules/workspaces/lib/useSidebarState";
import { useTabRenameStore } from "@/modules/workspaces/lib/tabRenameStore";
import { useWorkspaceRenameStore } from "@/modules/workspaces/lib/workspaceRenameStore";
import { useWorkspaceSettingsStore } from "@/modules/workspaces/lib/workspaceSettingsStore";
import { useFileRenameStore } from "@/modules/workspaces/lib/fileRenameStore";
import {
  clearRunningCommandEntry,
  clearScriptRunningEntry,
  getRunningCommandsSnapshot,
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
import { isAutofocusTab } from "@/modules/workspaces/lib/types";

function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

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
    reorderTab,
    splitPaneAndPlace,
    splitPaneAndOpenPanel,
    openPanel,
    activateTab,
    closeTab,
    reopenClosed,
    updateTabData,
    replaceTab,
    setTerminalPanelCwd,
    setWorkspaceCwd,
    setExplorerRootMode,
    setShowHidden,
    setWorkspaceRoot,
    clearWorkspaceRoot,
    setFsRoot,
    setWorkspaceTitle,
    setWorkspaceColor,
    setWorkspaceIcon,
    setWorkspaceStatus,
    setWorkspaceGitConfig,
    addScript,
    updateScript,
    removeScript,
    reorderScripts,
    setActiveScript,
    validateScriptTabs,
    setScriptPaneId,
    setTerminalRunningCommand,
    setTabView,
    toggleOverlayPreview,
    toggleSplitPreview,
    findTabGlobal,
    resetWorkspaces,
  } = useWorkspaces(initialOpts);

  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;

  const {
    floatPanel,
    closeFloatWindow,
    focusFloatWindow,
    dockViaCommand,
    navigateFloatWindow,
    restoreFloatingPanels,
    destroyWorkspaceFloats,
  } = useFloatBrowser({ updateTabData, findTabGlobal });

  const activeCwdRef = useRef<string | null>(null);
  const contextCwdRef = useRef<string | null>(null);
  const homeRef = useRef<string | null>(null);

  // ── Active panel derivation ───────────────────────────────────────────────

  const activePane = activeWorkspace
    ? findPane(activeWorkspace.paneTree, activeWorkspace.activePaneId)
    : null;

  useTerminalMetricsSampler(activeWorkspace?.paneTree ?? null);

  const activeTabId = activePane?.activeTabId ?? null;
  const activeTab = activeTabId
    ? (activePane?.tabs.find((p) => p.id === activeTabId) ?? null)
    : null;

  const isTerminalPanel = activeTab?.kind === "terminal";
  const isEditorPanel = activeTab?.kind === "editor";
  const isGitHistoryPanel = activeTab?.kind === "git-history";
  const activeCwd = isTerminalPanel
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
        return activeWorkspace?.cwd ? { path: activeWorkspace.cwd, kind: "dir" } : null;
      default:
        return null;
    }
  }, [activeTab, activeWorkspace]);

  const contextCwdFilePath = activeTab ? tabFilePath(activeTab) : null;
  const contextCwd =
    activeTab?.kind === "terminal"
      ? (activeTab.cwd ?? null)
      : contextCwdFilePath
        ? (contextCwdFilePath.split(/[\\/]/).slice(0, -1).join("/") || null)
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
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  activeWorkspaceIdRef.current = activeWorkspaceId;
  const closeTabsRef = useRef<(tabIds: string[]) => void>(() => {});
  const browserHandles = useRef<Map<string, BrowserPaneHandle>>(new Map());
  const [activeEditorHandle, setActiveEditorHandle] =
    useState<EditorPaneHandle | null>(null);
  const [gitHistoryHandle, setGitHistoryHandle] =
    useState<GitHistorySearchHandle | null>(null);
  const pendingGotoLine = useRef<Map<string, number>>(new Map());
  const fileLinkHandlerRef = useRef<(path: string, cwd: string | null, line?: number, col?: number, sourceTabId?: string) => void>(
    () => {},
  );
  const cwdResolverRef = useRef<(leafId: string) => string | null>(() => null);

  const { zoomIn, zoomOut, zoomReset } = useZoom();
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
    void loadRestorePlans().then(() => {
      const knownIds = new Set<string>();
      for (const ws of workspacesRef.current) {
        for (const pane of allPanes(ws.paneTree)) {
          for (const tab of pane.tabs) {
            if (tab.kind === "terminal") knownIds.add(tab.id);
          }
        }
      }
      pruneOrphanedPlans(knownIds);
    });
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
    void restoreFloatingPanels(workspacesRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus the active terminal when the active workspace changes (tab/workspace switch).
  useEffect(() => {
    const ws = workspacesRef.current.find((w) => w.id === activeWorkspaceId);
    if (!ws) return;
    const pane = findPane(ws.paneTree, ws.activePaneId);
    if (!pane?.activeTabId) return;
    const tabId = pane.activeTabId;
    const raf = requestAnimationFrame(() => {
      terminalHandles.current.get(tabId)?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [activeWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-focus the active terminal when this window regains OS focus (e.g. Cmd+Tab back).
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
          (w) => w.id === activeWorkspaceId,
        );
        if (!ws) return;
        const pane = findPane(ws.paneTree, ws.activePaneId);
        if (!pane?.activeTabId) return;
        requestAnimationFrame(() => {
          terminalHandles.current.get(pane.activeTabId!)?.focus();
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
      terminalHandles.current.get(tabId)?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [bellOpen, activeWorkspaceId]);

  const init = usePreferencesStore((s) => s.init);
  const rawWorkspaceStatuses = usePreferencesStore((s) => s.workspaceStatuses);
  const workspaceStatuses = useMemo(
    () => rawWorkspaceStatuses.filter((s) => s.label?.trim()),
    [rawWorkspaceStatuses],
  );
  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!prefsHydrated) return;
    const validIds = new Set(workspaceStatuses.map((s) => s.id));
    for (const w of workspaces) {
      if (w.statusId && !validIds.has(w.statusId)) {
        setWorkspaceStatus(w.id, null);
      }
    }
  }, [prefsHydrated]);

  useEffect(() => {
    initDuplicateProgressListener();
  }, []);

  const sidebarRef = useRef<SidebarHandle>(null);
  const [revealRequest, setRevealRequest] = useState<RevealRequest | null>(
    null,
  );
  const windowLabel = useMemo(() => getCurrentWebviewWindow().label, []);
  const [workspaceBarWidth, setWorkspaceBarWidth] = useState(getSavedWorkspaceBarWidth);
  const handleBarWidthChange = useCallback((w: number) => {
    setWorkspaceBarWidth(w);
    saveWorkspaceBarWidth(windowLabel, w);
  }, [windowLabel]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(getSavedCollapsedGroups()),
  );
  const handleToggleGroup = useCallback(
    (statusId: string) => {
      const next = new Set(collapsedGroups);
      if (next.has(statusId)) {
        next.delete(statusId);
      } else {
        next.add(statusId);
      }
      setCollapsedGroups(next);
      saveCollapsedGroups(windowLabel, [...next]);
    },
    [collapsedGroups, windowLabel],
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

  // ── Live terminal panel tracking for session disposal ─────────────────────

  const liveTabIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const live = new Set<string>();
    for (const ws of workspaces) {
      for (const pane of allPanes(ws.paneTree)) {
        for (const tab of pane.tabs) {
          if (tab.kind === "terminal") live.add(tab.id);
        }
      }
    }
    for (const id of liveTabIdsRef.current) {
      if (!live.has(id)) {
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

  // Update active search addon / editor handle when active panel changes.
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

  const runWorkspaceConfig = useCallback(
    (config: Script) => {
      if (!activeWorkspace) return;

      // Case 1: panel already exists -- focus it and re-run if idle
      if (config.tabId) {
        const found = findTabGlobal(config.tabId);
        if (found) {
          setActiveWorkspaceId(found.workspace.id);
          activateTab(found.workspace.id, config.tabId);
          if (!getScriptRunningSnapshot().get(config.tabId)) {
            const tabId = config.tabId;
            const tryWrite = (attempts = 0) => {
              const handle = terminalHandles.current.get(tabId);
              if (handle) {
                handle.write(config.command + "\r");
                setScriptRunning(tabId, "running");
              } else if (attempts < 20) {
                setTimeout(() => tryWrite(attempts + 1), 100);
              }
            };
            setTimeout(tryWrite, 50);
          }
          return;
        }
      }

      const freshTabId = newTabId();
      const panelCwd = config.cwd ?? activeWorkspace.workspaceRoot ?? activeWorkspace.cwd;
      const tab: Tab = { id: freshTabId, kind: "terminal", cwd: panelCwd, title: config.name || undefined };

      // Case 2: existing script pane -- add panel to it without splitting
      const existingScriptPane = activeWorkspace.scriptPaneId
        ? findPane(activeWorkspace.paneTree, activeWorkspace.scriptPaneId)
        : null;

      if (existingScriptPane) {
        openPanel(activeWorkspace.id, activeWorkspace.scriptPaneId!, tab);
        setActiveWorkspaceId(activeWorkspace.id);
        activateTab(activeWorkspace.id, freshTabId);
      } else {
        // Case 3: no script pane yet -- split and record the new pane
        const { workspacePaneLimit } = usePreferencesStore.getState();
        const atLimit = allPanes(activeWorkspace.paneTree).length >= workspacePaneLimit;
        if (atLimit) {
          openPanel(activeWorkspace.id, activeWorkspace.activePaneId, tab);
          setScriptPaneId(activeWorkspace.id, activeWorkspace.activePaneId);
        } else {
          const freshPaneId = splitPaneAndOpenPanel(
            activeWorkspace.id,
            activeWorkspace.activePaneId,
            "bottom",
            tab,
          );
          setScriptPaneId(activeWorkspace.id, freshPaneId);
        }
      }

      updateScript(activeWorkspace.id, config.id, { tabId: freshTabId });

      const tryWrite = (attempts = 0) => {
        const handle = terminalHandles.current.get(freshTabId);
        if (handle) {
          handle.write(config.command + "\r");
          setScriptRunning(freshTabId, "running");
        } else if (attempts < 20) {
          setTimeout(() => tryWrite(attempts + 1), 100);
        }
      };
      setTimeout(tryWrite, 150);
    },
    [activeWorkspace, findTabGlobal, setActiveWorkspaceId, activateTab, splitPaneAndOpenPanel, updateScript, openPanel, setScriptPaneId],
  );

  const stopWorkspaceConfig = useCallback(
    (config: Script) => {
      if (!config.tabId) return;
      // Focus the terminal so OSC 133;D can be received and update the waiting state
      activateTab(activeWorkspace?.id ?? "", config.tabId);
      setScriptRunning(config.tabId, "waiting");
      const handle = terminalHandles.current.get(config.tabId);
      handle?.write("\x03");
    },
    [activateTab, activeWorkspace?.id],
  );

  const handleCloseWorkspace = useCallback(
    async (wsId: string) => {
      await destroyWorkspaceFloats(wsId, workspacesRef.current);
      closeWorkspace(wsId);
    },
    [closeWorkspace, destroyWorkspaceFloats],
  );
  // Stored in a ref so Task 5 (WorkspaceBar close button) can consume it
  // without re-triggering effects that depend on the callback identity.
  const handleCloseWorkspaceRef = useRef(handleCloseWorkspace);
  handleCloseWorkspaceRef.current = handleCloseWorkspace;

  const [pendingCloseWorkspace, setPendingCloseWorkspace] = useState<
    { id: string; scriptCount: number } | null
  >(null);
  const [pendingWorkspaceProcesses, setPendingWorkspaceProcesses] = useState<
    { id: string; processes: { tabId: string; label: string }[] } | null
  >(null);

  const requestCloseWorkspace = useCallback(async (wsId: string) => {
    const prefs = usePreferencesStore.getState();
    const ws = workspacesRef.current.find((w) => w.id === wsId);
    if (prefs.warnOnCloseTabWithRunningProcess && ws) {
      const processes = await collectRunningTerminals(
        ws,
        leafHasForegroundProcess,
        (id) => getRunningCommandsSnapshot().get(id),
      );
      if (processes.length > 0) {
        setPendingWorkspaceProcesses({ id: wsId, processes });
        return;
      }
    }
    if (prefs.warnOnCloseWorkspace) {
      const scriptCount = ws?.scripts?.filter((s) => s.command.trim()).length ?? 0;
      setPendingCloseWorkspace({ id: wsId, scriptCount });
      return;
    }
    void handleCloseWorkspaceRef.current(wsId);
  }, []);

  const workspaceEnv = useWorkspaceEnvStore((s) => s.env);
  const setWorkspaceEnv = useWorkspaceEnvStore((s) => s.setEnv);
  const { home, launchCwd, launchCwdResolved } =
    useWorkspaceSwitcher({
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

  // When Cmd+Shift+F is pressed while the panel is closed, the panel opens
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
        setFsRoot(activeWorkspace.id, path);
      }
    },
    [activeWorkspace, setFsRoot],
  );

  const focusSidebar = useCallback(
    (folder: string, opts: { fromShortcut: boolean; pendingAction?: RevealAction }) => {
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
          setRevealRequest((r) => ({ path: folder, nonce: (r?.nonce ?? 0) + 1, pendingAction: opts.pendingAction }));
        });

      if (opts.fromShortcut || opts.pendingAction) {
        const panel = sidebarStateRef.current;
        if (!panel.open) setSidebarOpen(true);
        if (panel.view !== "explorer") {
          setSidebarView("explorer");
        }
      }
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

  // Drive the sidebar when the ACTIVE panel becomes an autofocus terminal,
  // whether by gaining focus or by turning autofocus on while already focused
  // (shortcut / hover / context menu). Toggling autofocus on a non-active tab
  // does nothing here because the active panel does not change. The startup
  // mount is skipped so restoring a session never auto-fires.
  const prevAutofocusSignalRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const ap = activeTab;
    const target =
      ap && isAutofocusTab(ap) && ap.autofocus
        ? (tabFilePath(ap) ??
          (ap.kind === "terminal" ? (ap.cwd ?? null) : null))
        : null;
    const signal = target ? activeTabId : null;
    const prev = prevAutofocusSignalRef.current;
    prevAutofocusSignalRef.current = signal;
    if (prev === undefined) return; // skip initial mount
    if (signal && signal !== prev && target) {
      focusSidebar(target, { fromShortcut: false });
    }
  }, [activeTabId, activeTab, focusSidebar]);

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
      openPanel(ws.id, targetPaneId ?? ws.activePaneId, {
        id: newTabId(),
        kind: "terminal",
        cwd: resolveNewTerminalCwd({
          mode: terminalNewFolderMode,
          home: homeRef.current,
          lastFolder: contextCwdRef.current ?? ws.cwd ?? null,
          workspaceRoot: ws.workspaceRoot ?? ws.fsRoot ?? null,
        }),
      });
    },
    [openPanel],
  );

  // ── Window title ──────────────────────────────────────────────────────────

  useEffect(() => {
    const project = explorerRoot ? basename(explorerRoot) : "";
    const label = activeTab
      ? activeCwd
        ? basename(activeCwd)
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

  // ── Open panel helpers ────────────────────────────────────────────────────

  const openFileInPanel = useCallback(
    (path: string, pin?: boolean) => {
      if (!activeWorkspace) return undefined;
      const markdown = isMarkdownPath(path);
      // Check if already open (as editor or rendered markdown); activate it.
      for (const pane of allPanes(activeWorkspace.paneTree)) {
        const existing = pane.tabs.find(
          (p) =>
            (p.kind === "editor" || p.kind === "markdown") &&
            (p as { path: string }).path === path,
        );
        if (existing) {
          if (pin && existing.kind === "editor" && existing.preview) {
            updateTabData(activeWorkspace.id, existing.id, (p) =>
              p.kind === "editor" ? { ...p, preview: false } : p,
            );
          }
          activateTab(activeWorkspace.id, existing.id);
          flashTab(existing.id);
          return existing.id;
        }
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

      openPanel(
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
    [activeWorkspace, activateTab, openPanel, replaceTab],
  );

  const openFileInRightSplit = useCallback(
    (path: string, sourceTabId?: string) => {
      if (!activeWorkspace) return undefined;
      const markdown = isMarkdownPath(path);
      for (const pane of allPanes(activeWorkspace.paneTree)) {
        const existing = pane.tabs.find(
          (p) =>
            (p.kind === "editor" || p.kind === "markdown") &&
            (p as { path: string }).path === path,
        );
        if (existing) {
          activateTab(activeWorkspace.id, existing.id);
          flashTab(existing.id);
          return existing.id;
        }
      }
      const tabId = newTabId();
      const panel = markdown
        ? ({ id: tabId, kind: "markdown" as const, path } as const)
        : ({ id: tabId, kind: "editor" as const, path, dirty: false, preview: false } as const);
      const sourcePaneId = sourceTabId
        ? findTabPane(activeWorkspace.paneTree, sourceTabId)?.pane.id
        : undefined;
      if (sourcePaneId) {
        const sibling = siblingPane(activeWorkspace.paneTree, sourcePaneId);
        if (sibling) {
          openPanel(activeWorkspace.id, sibling.id, panel);
        } else {
          splitPaneAndOpenPanel(activeWorkspace.id, sourcePaneId, "right", panel);
        }
      } else {
        openPanel(activeWorkspace.id, activeWorkspace.activePaneId, panel);
      }
      return tabId;
    },
    [activeWorkspace, activateTab, openPanel, splitPaneAndOpenPanel],
  );

  const openGitDiffInPanel = useCallback(
    (params: {
      repoRoot: string;
      path: string;
      mode: "-" | "+";
      originalPath: string | null;
    }) => {
      if (!activeWorkspace) return;
      openPanel(activeWorkspace.id, activeWorkspace.activePaneId, {
        id: newTabId(),
        kind: "git-diff",
        ...params,
      });
    },
    [activeWorkspace, openPanel],
  );

  const openGitHistoryInPanel = useCallback(
    (args: { repoRoot: string; branch: string | null }) => {
      if (!activeWorkspace) return;
      openPanel(activeWorkspace.id, activeWorkspace.activePaneId, {
        id: newTabId(),
        kind: "git-history",
        repoRoot: args.repoRoot,
      });
    },
    [activeWorkspace, openPanel],
  );

  const openBrowserInPanel = useCallback(
    (url: string) => {
      if (!activeWorkspace) return undefined;
      const tabId = newTabId();
      openPanel(activeWorkspace.id, activeWorkspace.activePaneId, {
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
    [activeWorkspace, openPanel],
  );

  fileLinkHandlerRef.current = (path, cwd, line, _col, sourceTabId) => {
    let absPath = path;
    if (path.startsWith("~/")) {
      absPath = home ? `${home}/${path.slice(2)}` : path;
    } else if (!path.startsWith("/") && cwd) {
      absPath = `${cwd}/${path}`;
    }
    void invoke<{ kind: "file" | "dir" | "symlink" }>("fs_stat", { path: absPath })
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
      onFileLink: (path, cwd, line, col, sourceTabId) => fileLinkHandlerRef.current(path, cwd, line, col, sourceTabId),
      resolveLeafCwd: (leafId) => cwdResolverRef.current(leafId),
    });
  }, []);

  // ── Float browser callbacks ───────────────────────────────────────────────

  const onFloatBrowserPanel = useCallback(
    (tabId: string) => {
      const found = findTabGlobal(tabId);
      if (!found || found.tab.kind !== "browser") return;
      void floatPanel(found.tab, found.workspace.id);
    },
    [findTabGlobal, floatPanel],
  );

  const onDockBrowserPanel = useCallback(
    (tabId: string) => {
      void dockViaCommand(tabId);
    },
    [dockViaCommand],
  );

  const onFocusFloatBrowserPanel = useCallback(
    (tabId: string) => {
      void focusFloatWindow(tabId);
    },
    [focusFloatWindow],
  );

  const onNavigateFloatBrowserPanel = useCallback(
    (tabId: string, url: string) => {
      void navigateFloatWindow(tabId, url);
    },
    [navigateFloatWindow],
  );

  // ── WorkspaceView stable callbacks (use refs to avoid recreating on cd) ──

  const onActivateTabStable = useCallback(
    (wsId: string, tabId: string) => activateTab(wsId, tabId),
    [activateTab],
  );

  const onCloseTabStable = useCallback((_wsId: string, tabId: string) => {
    closeTabsRef.current([tabId]);
  }, []);

  const onCloseManyTabsStable = useCallback((_wsId: string, tabIds: string[]) => {
    closeTabsRef.current(tabIds);
  }, []);

  const onFocusPaneStable = useCallback(
    (wsId: string, paneId: string) => focusPane(wsId, paneId),
    [focusPane],
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
      openPanel(wsId, newPaneId, {
        id: newTabId(),
        kind: "terminal",
        cwd: resolveNewTerminalCwd({
          mode: terminalNewFolderMode,
          home: homeRef.current,
          lastFolder: contextCwdRef.current ?? ws.cwd ?? null,
          workspaceRoot: ws.workspaceRoot ?? ws.fsRoot ?? null,
        }),
      });
    },
    [splitPane, openPanel],
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
      openPanel(wsId, newPaneId, {
        id: newTabId(),
        kind: "terminal",
        cwd: resolveNewTerminalCwd({
          mode: terminalNewFolderMode,
          home: homeRef.current,
          lastFolder: contextCwdRef.current ?? ws.cwd ?? null,
          workspaceRoot: ws.workspaceRoot ?? ws.fsRoot ?? null,
        }),
      });
    },
    [splitPane, openPanel],
  );

  const onNewBrowserStable = useCallback(
    (wsId: string, paneId: string) => {
      const tabId = newTabId();
      openPanel(wsId, paneId, { id: tabId, kind: "browser", url: "" });
      setTimeout(
        () => browserHandles.current.get(tabId)?.focusAddressBar(),
        0,
      );
    },
    [openPanel],
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
      openPanel(wsId, newPaneId, { id: tabId, kind: "browser", url: "" });
      setTimeout(
        () => browserHandles.current.get(tabId)?.focusAddressBar(),
        0,
      );
    },
    [splitPane, openPanel],
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
      openPanel(wsId, newPaneId, { id: tabId, kind: "browser", url: "" });
      setTimeout(
        () => browserHandles.current.get(tabId)?.focusAddressBar(),
        0,
      );
    },
    [splitPane, openPanel],
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
    }) => {
      const ws = workspacesRef.current.find((w) => w.id === activeWorkspaceId);
      if (!ws) return;
      openPanel(ws.id, ws.activePaneId, {
        id: newTabId(),
        kind: "git-commit-file",
        repoRoot: params.repoRoot,
        sha: params.sha,
        path: params.path,
        originalPath: params.originalPath,
      });
    },
    [activeWorkspaceId, openPanel],
  );

  // ── TabCallbacks ─────────────────────────────────────────────────────────

  const handlePathRenamed = useCallback(
    (from: string, to: string) => {
      for (const ws of workspacesRef.current) {
        for (const pane of allPanes(ws.paneTree)) {
          for (const tab of pane.tabs) {
            if (tab.kind !== "editor") continue;
            const ep = tab as { path: string };
            if (ep.path === from) {
              const i = to.lastIndexOf("/");
              updateTabData(ws.id, tab.id, (p) =>
                p.kind === "editor"
                  ? { ...p, path: to, title: i === -1 ? to : to.slice(i + 1) }
                  : p,
              );
            } else if (ep.path.startsWith(`${from}/`)) {
              const newPath = `${to}${ep.path.slice(from.length)}`;
              const i = newPath.lastIndexOf("/");
              updateTabData(ws.id, tab.id, (p) =>
                p.kind === "editor"
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
      const panel = found.tab;
      if (panel.kind !== "editor" && panel.kind !== "markdown") return;
      const oldPath = panel.path;
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
    await editorHandles.current.get(tabId)?.save();
  }, []);

  // Autosave-on-focus-loss: save every dirty editor (save() no-ops when clean).
  // Gated on the autosave preference; triggered by tab/workspace switch, window
  // blur, tab close, and app close.
  const flushDirtyEditors = useCallback(async () => {
    if (!usePreferencesStore.getState().editorAutoSave) return;
    const handles = [...editorHandles.current.values()];
    await Promise.all(handles.map((h) => h.save().catch(() => {})));
  }, []);
  const flushDirtyEditorsRef = useRef(flushDirtyEditors);
  flushDirtyEditorsRef.current = flushDirtyEditors;

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
    const kind = findTabGlobal(tabId)?.tab.kind;
    requestAnimationFrame(() => {
      if (kind === "editor") editorHandles.current.get(tabId)?.focus();
      else terminalHandles.current.get(tabId)?.focus();
    });
  }, [findTabGlobal]);

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
    focusActiveTab,
    isWarnEnabled: () =>
      usePreferencesStore.getState().warnOnCloseTabWithRunningProcess,
    setWarnEnabled: setWarnOnCloseTabWithRunningProcess,
    isAutoSaveEnabled: () => usePreferencesStore.getState().editorAutoSave,
  });

  closeTabsRef.current = closeTabs;

  // ── Path rename ───────────────────────────────────────────────────────────

  // ── useEditorFileSync (editor panel shim) ─────────────────────────────────

  type EditorShim = {
    kind: "editor";
    id: string;
    path: string;
    dirty: boolean;
    preview: boolean;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const editorPanels = useMemo<EditorShim[]>(() => {
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
          }
        }
      }
    }
    return acc;
  }, [workspaces]);
  const editorPanelsRef = useRef(editorPanels);
  editorPanelsRef.current = editorPanels;

  useEditorFileSync({
    tabs: editorPanels,
    tabsRef: editorPanelsRef,
    editorRefs: editorHandles,
  });

  // ── useThemeFileEditing ───────────────────────────────────────────────────

  useThemeFileEditing({
    tabsRef: editorPanelsRef,
    openFileTab: (path) => openFileInPanel(path, true),
  });

  // ── Source control ────────────────────────────────────────────────────────

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(!sidebarStateRef.current.open);
  }, [setSidebarOpen]);

  const navigateSidebarTo = useCallback(
    (tab: "explorer" | "git" | "history") => {
      const panel = sidebarStateRef.current;
      if (!panel.open) {
        setSidebarOpen(true);
        setSidebarView(tab);
      } else if (panel.view === tab) {
        setSidebarOpen(false);
      } else {
        setSidebarView(tab);
      }
    },
    [setSidebarOpen, setSidebarView],
  );

  const showSidebarView = useCallback(
    (tab: "explorer" | "git" | "history") => {
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
    const panel = sidebarStateRef.current;
    const inExplorer = panel.open && panel.view === "explorer";
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
      openCommitHistoryTab: openGitHistoryInPanel,
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
      const open = editorPanelsRef.current.find((p) => p.path === gitignorePath);
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
          openFileInPanel(gitignorePath, true);
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
        await native.writeFile(gitignorePath, appendGitignoreEntry(content, entry));
      }
      openFileInPanel(gitignorePath, true);
    },
    [gitRoot, openFileInPanel],
  );

  // ── Terminal helpers ──────────────────────────────────────────────────────

  const openFolderInTerminal = useCallback(
    (path: string) => {
      if (!activeWorkspace) return;
      const tabId = newTabId();
      openPanel(activeWorkspace.id, activeWorkspace.activePaneId, {
        id: tabId,
        kind: "terminal",
        cwd: path,
      });
      setTimeout(() => terminalHandles.current.get(tabId)?.focus(), 80);
    },
    [activeWorkspace, openPanel],
  );

  const newWorkspaceFromFolder = useCallback(
    (path: string) => {
      const wsId = addWorkspace(path);
      setWorkspaceRoot(wsId, path);
      setTimeout(() => {
        const ws = workspacesRef.current.find((w) => w.id === wsId);
        if (!ws) return;
        const pane = allPanes(ws.paneTree)[0];
        const panel = pane?.activeTabId
          ? pane.tabs.find((p) => p.id === pane.activeTabId)
          : pane?.tabs[0];
        if (panel) terminalHandles.current.get(panel.id)?.focus();
      }, 80);
    },
    [addWorkspace, setWorkspaceRoot],
  );

  const panelCallbacks = useMemo<TabCallbacks>(
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
          setTerminalPanelCwd(found.workspace.id, tabId, cwd);
          const isFocused =
            found.workspace.activePaneId === found.pane.id &&
            found.pane.activeTabId === tabId;
          if (isFocused) {
            setWorkspaceCwd(found.workspace.id, cwd);
            if (
              found.workspace.id === activeWorkspace?.id &&
              found.tab.kind === "terminal" &&
              found.tab.autofocus
            ) {
              focusSidebar(cwd, { fromShortcut: false });
            }
          }
        }
      },
      onRunningCommand: (tabId, cmd) => {
        const found = findTabGlobal(tabId);
        if (found) setTerminalRunningCommand(found.workspace.id, tabId, cmd);
        if (cmd !== null) {
          scriptCommandSeen.current.add(tabId);
        } else if (
          scriptCommandSeen.current.has(tabId) &&
          getScriptRunningSnapshot().has(tabId)
        ) {
          setScriptRunning(tabId, false);
          scriptCommandSeen.current.delete(tabId);
        }
      },
      onScratchpadState: (tabId, state) => {
        const found = findTabGlobal(tabId);
        if (found)
          updateTabData(found.workspace.id, tabId, (p) =>
            p.kind === "terminal" ? { ...p, scratchpad: state } : p,
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
              : p,
          );
      },
      onEditorClose: (tabId) => {
        const found = findTabGlobal(tabId);
        if (found) closeTab(found.workspace.id, tabId);
      },
      onSetMarkdownView: (tabId, mode) => {
        const found = findTabGlobal(tabId);
        if (found) setTabView(found.workspace.id, tabId, mode);
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
        openPanel(activeWorkspace.id, activeWorkspace.activePaneId, {
          id: newTabId(),
          kind: "git-commit-file",
          repoRoot: input.repoRoot,
          sha: input.sha,
          path: input.path,
          originalPath: input.originalPath,
        });
      },
      onGitHistorySearchHandle: (_tabId, handle) => {
        setGitHistoryHandle(handle);
      },
      onRenamePanel: (tabId, title) => {
        const found = findTabGlobal(tabId);
        if (found)
          updateTabData(found.workspace.id, tabId, (p) => ({
            ...p,
            title,
          }));
      },
      onUpdatePanel: (tabId, updater) => {
        const found = findTabGlobal(tabId);
        if (found) updateTabData(found.workspace.id, tabId, updater);
      },
      onRenameFile: (tabId, newName) => {
        void handleRenameFileFromTab(tabId, newName);
      },
      onFocusOnExplorer: (filePath, pendingAction) => focusSidebar(filePath, { fromShortcut: true, pendingAction }),
      onSetAsRoot: handleSetAsRoot,
      onNewWorkspaceFromFolder: newWorkspaceFromFolder,
      onRevealInTerminal: openFolderInTerminal,
      onAddToGitignore: handleAddToGitignore,
    }),
    [
      activeTabId,
      findTabGlobal,
      closeTab,
      setTerminalPanelCwd,
      setWorkspaceCwd,
      setTerminalRunningCommand,
      setTabView,
      toggleOverlayPreview,
      toggleSplitPreview,
      updateTabData,
      activeWorkspace,
      openPanel,
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
      const id = openFileInPanel(path, true);
      if (id == null) return;
      const h = editorHandles.current.get(id);
      if (h) h.gotoLine(line);
      else pendingGotoLine.current.set(id, line);
    },
    [openFileInPanel],
  );

  const insertHistoryCommand = useMemo(
    () =>
      isTerminalPanel && activeTabId !== null
        ? (cmd: string) => {
            writeToSession(activeTabId, cmd);
            terminalHandles.current.get(activeTabId)?.focus();
          }
        : null,
    [isTerminalPanel, activeTabId],
  );

  // ── Search ────────────────────────────────────────────────────────────────

  const searchTarget = useMemo<SearchTarget>(() => {
    if (isTerminalPanel && activeTabId !== null && activeSearchAddon)
      return {
        kind: "terminal",
        addon: activeSearchAddon,
        focus: () => terminalHandles.current.get(activeTabId)?.focus(),
      };
    if (isEditorPanel && activeEditorHandle)
      return {
        kind: "editor",
        handle: activeEditorHandle,
        focus: () => activeEditorHandle.focus(),
      };
    if (isGitHistoryPanel && gitHistoryHandle)
      return {
        kind: "git-history",
        handle: gitHistoryHandle,
        focus: () => {},
      };
    return null;
  }, [
    isTerminalPanel,
    isEditorPanel,
    isGitHistoryPanel,
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

  const handleCloseActivePanel = useCallback(() => {
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

  const handleCloseOtherPanels = useCallback(() => {
    if (!activePane || !activeTabId) return;
    const ids = activePane.tabs
      .filter(
        (p) => p.id !== activeTabId && !(p as { locked?: boolean }).locked,
      )
      .map((p) => p.id);
    if (ids.length) closeTabsRef.current(ids);
  }, [activePane, activeTabId]);

  const handleCloseAllPanels = useCallback(() => {
    if (!activePane) return;
    const ids = activePane.tabs
      .filter((p) => !(p as { locked?: boolean }).locked)
      .map((p) => p.id);
    if (ids.length) closeTabsRef.current(ids);
  }, [activePane]);

  const cycleWorkspace = useCallback(
    (delta: 1 | -1) => {
      const navigable = workspaces.filter(
        (w) => !w.statusId || !collapsedGroups.has(w.statusId),
      );
      if (navigable.length < 2) return;
      const idx = navigable.findIndex((w) => w.id === activeWorkspaceId);
      const baseIdx = idx === -1 ? 0 : idx;
      const nextIdx = (baseIdx + delta + navigable.length) % navigable.length;
      setActiveWorkspaceId(navigable[nextIdx].id);
    },
    [workspaces, collapsedGroups, activeWorkspaceId, setActiveWorkspaceId],
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
    if (target) focusPane(activeWorkspace.id, target);
  }

  const doSplitRight = useCallback(() => {
    if (!activeWorkspace) return;
    onSplitTerminalRightStable(activeWorkspace.id, activeWorkspace.activePaneId);
  }, [activeWorkspace, onSplitTerminalRightStable]);

  const doSplitDown = useCallback(() => {
    if (!activeWorkspace) return;
    onSplitTerminalDownStable(activeWorkspace.id, activeWorkspace.activePaneId);
  }, [activeWorkspace, onSplitTerminalDownStable]);

  const handleExplorerSearch = useCallback(() => {
    const panel = sidebarStateRef.current;
    if (panel.open && panel.view === "explorer") {
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
      onNewBrowser: () => openBrowserInPanel(""),
      onSearchFiles: handleExplorerSearch,
      onCommandPalette: () => openCommandPalette("commands"),
      onSettings: () => void openSettingsWindow(),
    }),
    [openNewTerminal, openBrowserInPanel, handleExplorerSearch, openCommandPalette],
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
        if (activeWorkspaceId) useWorkspaceRenameStore.getState().startRename(activeWorkspaceId);
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
      "tab.newBrowser": () => openBrowserInPanel(""),
      "tab.newEditor": () => setNewEditorOpen(true),
      "tab.close": handleCloseActivePanel,
      "tab.reopenClosed": () => {
        if (activeWorkspace) reopenClosed();
      },
      "tab.rename": () => {
        const active = document.activeElement;
        const tag = active?.tagName;
        if (
          (tag === "INPUT" || tag === "TEXTAREA") &&
          !active?.classList.contains("xterm-helper-textarea")
        )
          return;
        if (!activeTabId) return;
        useTabRenameStore.getState().startRename(activeTabId);
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
        const panel = findTabGlobal(activeTabId)?.tab;
        if (panel?.kind === "editor" || panel?.kind === "markdown") {
          useFileRenameStore.getState().trigger(activeTabId);
        }
      },
      "editor.markdown.toggleView": () => {
        if (!activeTab || !activeTabId || !activeWorkspaceId) return;
        if (activeTab.kind === "editor" && isMarkdownPath(activeTab.path)) {
          toggleOverlayPreview(activeWorkspaceId, activeTabId);
        } else if (activeTab.kind === "markdown") {
          setTabView(activeWorkspaceId, activeTabId, "raw");
        }
      },
      "editor.html.toggleView": () => {
        if (!activeTab || !activeTabId || !activeWorkspaceId) return;
        if (activeTab.kind === "editor" && isHtmlPath(activeTab.path)) {
          toggleOverlayPreview(activeWorkspaceId, activeTabId);
        }
      },
      "editor.preview.toggleSplit": () => {
        if (!activeTab || !activeTabId || !activeWorkspaceId) return;
        if (
          activeTab.kind === "editor" &&
          (isMarkdownPath(activeTab.path) || isHtmlPath(activeTab.path))
        ) {
          toggleSplitPreview(activeWorkspaceId, activeTabId);
        }
      },
      "editor.save": () => {
        if (!activeTabId) return;
        const handle = editorHandles.current.get(activeTabId);
        if (handle) void handle.save();
      },
      "tab.next": () => {
        if (!activeWorkspace || !activePane) return;
        const panels = activePane.tabs;
        if (panels.length < 2) return;
        const idx = panels.findIndex((p) => p.id === activePane.activeTabId);
        const next = panels[(idx + 1) % panels.length];
        activateTab(activeWorkspace.id, next.id);
      },
      "tab.prev": () => {
        if (!activeWorkspace || !activePane) return;
        const panels = activePane.tabs;
        if (panels.length < 2) return;
        const idx = panels.findIndex((p) => p.id === activePane.activeTabId);
        const prev = panels[(idx - 1 + panels.length) % panels.length];
        activateTab(activeWorkspace.id, prev.id);
      },
      "tab.selectByIndex": (e) => {
        if (!activeWorkspace || !activePane) return;
        const panels = activePane.tabs;
        if (panels.length === 0) return;
        const digit = parseInt(e.key, 10);
        const idx = digit === 0 ? panels.length - 1 : digit - 1;
        if (idx >= 0 && idx < panels.length)
          activateTab(activeWorkspace.id, panels[idx].id);
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
      "explorer.viewFilesystem": () => showExplorerWithMode("filesystem"),
      "explorer.viewPinned": () => showExplorerWithMode("workspace"),
      "explorer.toggleHidden": handleToggleShowHidden,
      "explorer.search": handleExplorerSearch,
      "terminal.clear": () => {
        clearFocusedTerminal();
      },
      "terminal.scratchpad": () => {
        if (activeTabId && activeTab?.kind === "terminal") {
          cycleScratchpad(activeTabId);
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
        if (idx >= 0 && idx < workspaces.length)
          setActiveWorkspaceId(workspaces[idx].id);
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
        const first = useAgentStore.getState().notifications[0];
        if (!first) return;
        setActiveWorkspaceId(first.workspaceId);
        activateTab(first.workspaceId, first.tabId);
        setTimeout(
          () => terminalHandles.current.get(first.tabId)?.focus(),
          50,
        );
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
      "tab.focusOnExplorer": () => {
        if (!activeTab) return;
        const target =
          tabFilePath(activeTab) ??
          (activeTab.kind === "terminal" ? (activeTab.cwd ?? null) : null);
        if (target) focusSidebar(target, { fromShortcut: true });
      },
      "tab.toggleAutofocus": () => {
        if (!activeTabId || !activeTab || !isAutofocusTab(activeTab))
          return;
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
      activeWorkspace,
      activeWorkspaceId,
      activePane,
      activeTabId,
      activeTab,
      activeCwd,
      workspaces,
      findTabGlobal,
      updateTabData,
      openCommandPalette,
      cycleWorkspace,
      activateTab,
      handleCloseActivePanel,
      reopenClosed,
      requestCloseWorkspace,
      focusSidebar,
      openNewTerminal,
      addWorkspace,
      openPanel,
      openBrowserInPanel,
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
    ],
  );

  const shortcutsDisabled = useCallback(
    (id: ShortcutId, e: KeyboardEvent) => {
      if (id === "editor.undo" || id === "editor.redo") {
        return activeTab?.kind !== "editor";
      }
      if (id === "editor.markdown.toggleView") {
        return !(
          activeTab?.kind === "markdown" ||
          (activeTab?.kind === "editor" && isMarkdownPath(activeTab.path))
        );
      }
      if (id === "editor.html.toggleView") {
        return !(
          activeTab?.kind === "editor" &&
          isHtmlPath(activeTab.path)
        );
      }
      if (id === "editor.preview.toggleSplit") {
        return !(
          activeTab?.kind === "editor" &&
          (isMarkdownPath(activeTab.path) || isHtmlPath(activeTab.path))
        );
      }
      if (id === "editor.save") {
        return activeTab?.kind !== "editor";
      }
      if (id === "terminal.clear") {
        const target =
          (e.target as HTMLElement | null) ?? document.activeElement;
        return !(target as HTMLElement | null)?.closest?.(".xterm");
      }
      if (id === "file.rename") {
        return sidebarRef.current?.isExplorerFocused() ?? false;
      }
      if (id === "tab.lock") {
        return (
          activeTab?.kind !== "terminal" && activeTab?.kind !== "editor"
        );
      }

      return false;
    },
    [activeTab],
  );

  useGlobalShortcuts(shortcutHandlers, { isDisabled: shortcutsDisabled });

  // ── Agent activation ──────────────────────────────────────────────────────

  const onActivateAgent = useCallback(
    (workspaceId: string, tabId: string) => {
      setActiveWorkspaceId(workspaceId);
      activateTab(workspaceId, tabId);
      setTimeout(() => terminalHandles.current.get(tabId)?.focus(), 50);
    },
    [setActiveWorkspaceId, activateTab],
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
      .catch((e) =>
        console.error("[kex] kex:activate-tab listen failed:", e),
      );
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
        openBrowserInPanel("");
        break;
      case "toggle_autosave":
        void setEditorAutoSave(!usePreferencesStore.getState().editorAutoSave);
        break;
      case "close_tab":
        handleCloseActivePanel();
        break;
      case "close_others":
        handleCloseOtherPanels();
        break;
      case "close_all":
        handleCloseAllPanels();
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
        setSidebarSide(sidebarStateRef.current.side === "left" ? "right" : "left");
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
            openNewBrowser: () => openBrowserInPanel(""),
            openGitGraph: openGitGraphFromContext,
            toggleSourceControl,
            closeActiveTabOrPane: handleCloseActivePanel,
            splitPaneRight: doSplitRight,
            splitPaneDown: doSplitDown,
            focusSearch: () => searchInlineRef.current?.focus(),
            focusExplorerSearch: () => sidebarRef.current?.focusExplorer(),
            toggleSidebar: toggleSidebar,
            openSettings: () => void openSettingsWindow(),
            openKeyboardShortcuts: () => void openSettingsWindow("shortcuts"),
            reopenClosedTab: () => { if (activeWorkspace) reopenClosed(); },
            openNewWindow: () => void native.openMainWindow(),
            clearTerminal: clearFocusedTerminal,
            toggleZenMode: () => {
              if (!activeWorkspace) return;
              if (allPanes(activeWorkspace.paneTree).length <= 1) return;
              setZenPaneId((prev) => prev !== null ? null : activeWorkspace.activePaneId);
            },
            hasActiveTerminal: activeTab?.kind === "terminal",
            openWorkspaceProperties: () =>
              useWorkspaceSettingsStore.getState().openSettings(activeWorkspaceId),
            openRunScriptConfiguration: () =>
              useWorkspaceSettingsStore.getState().openSettings(activeWorkspaceId, "scripts"),
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
      openBrowserInPanel,
      openGitGraphFromContext,
      toggleSourceControl,
      handleCloseActivePanel,
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
              useWorkspaceSettingsStore.getState().openSettings(activeWorkspaceId, "properties", "workspaceRoot")
            }
            scripts={activeWorkspace?.scripts ?? []}
            activeScript={activeWorkspace?.activeScript}
            onSelectScript={(id) => setActiveScript(activeWorkspaceId, id)}
            onRunScript={runWorkspaceConfig}
            onStopConfig={stopWorkspaceConfig}
            onOpenRunSettings={() =>
              useWorkspaceSettingsStore.getState().openSettings(activeWorkspaceId, "scripts")
            }
            activeWorkspace={activeWorkspace ?? null}
            activeTab={activeTab}
          />

          {/* 3-column layout */}
          <div className="flex min-h-0 flex-1">
            {/* LEFT: workspace bar */}
            <WorkspaceBar
              workspaces={workspaces.map((w) => ({
                id: w.id,
                title: w.title,
                kind: "terminal",
                cwd: w.cwd,
                color: w.color,
                icon: w.icon,
                statusId: w.statusId,
              }))}
              activeId={activeWorkspaceId}
              onSelect={setActiveWorkspaceId}
              onNew={() => addWorkspace(home ?? undefined)}
              onReorder={reorderWorkspaces}
              onClose={(wsId) => void requestCloseWorkspace(wsId)}
              onRename={(id, title) => setWorkspaceTitle(id, title)}
              onOpenSettings={(id) => useWorkspaceSettingsStore.getState().openSettings(id)}
              width={workspaceBarWidth}
              onWidthChange={handleBarWidthChange}
              workspaceStatuses={workspaceStatuses}
              onSetStatus={setWorkspaceStatus}
              collapsedGroups={collapsedGroups}
              onToggleGroup={handleToggleGroup}
            />

            {/* CENTER + TOOL PANEL: resizable, side configurable */}
            <WorkspaceDndProvider
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              onMoveTab={moveTab}
              onReorderTab={reorderTab}
              onSplitPaneAndPlace={splitPaneAndPlace}
              onSplitPaneAndOpenPanel={splitPaneAndOpenPanel}
              onOpenPanel={openPanel}
            >
              <ResizablePanelGroup
                orientation="horizontal"
                className="min-h-0 flex-1"
              >
                {/* Tool panel on LEFT when sidebarSide === "left" */}
                {sidebarOpen && sidebarSide === "left" && (
                  <>
                    <ResizablePanel
                      id="tool-panel"
                      defaultSize={`${sidebarWidth}%`}
                      minSize="12%"
                      maxSize="70%"
                      onResize={(size) => setSidebarWidth(size.asPercentage)}
                    >
                      <Sidebar
                        ref={sidebarRef}
                        view={sidebarView}
                        onChangeView={setSidebarView}
                        rootPath={explorerRoot}
                        rootMode={activeRootMode}
                        onChangeRootMode={handleChangeRootMode}
                        showHidden={activeShowHidden}
                        onToggleShowHidden={handleToggleShowHidden}
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
                        onOpenFile={(path, pin) => openFileInPanel(path, pin)}
                        onPathRenamed={handlePathRenamed}
                        onPathDeleted={handlePathDeleted}
                        onRevealInTerminal={openFolderInTerminal}
                        onNewWorkspaceFromFolder={newWorkspaceFromFolder}
                        onAddToGitignore={handleAddToGitignore}
                        onOpenWorkspaceProperties={() =>
                          useWorkspaceSettingsStore
                            .getState()
                            .openSettings(activeWorkspaceId, "properties", "workspaceRoot")
                        }
                        onExplorerSearchClose={onExplorerSearchClose}
                        workspaceCwd={explorerRoot}
                        sourceControl={sourceControl}
                        pushOnCommit={pushOnCommit}
                        onPushOnCommitChange={handlePushOnCommitChange}
                        gitWorkspaceId={activeWorkspaceId}
                        savedCommitMessage={savedCommitMessage}
                        onCommitMessagePersist={handleCommitMessagePersist}
                        onOpenDiff={openGitDiffInPanel}
                        onOpenGitGraph={openGitGraphFromContext}
                        onNavigateToWorktree={handleNavigateToWorktree}
                        repoRoot={sidebarRepoRoot}
                        onOpenCommitFile={onOpenCommitFileStable}
                        onSearchHandle={setGitHistoryHandle}
                      />
                    </ResizablePanel>
                    <ResizableHandle withHandle />
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
                        callbacks={panelCallbacks}
                        gitStatus={sourceControl.status}
                        gitColorScheme={gitColorScheme}
                        onFloatBrowserPanel={onFloatBrowserPanel}
                        onDockBrowserPanel={onDockBrowserPanel}
                        onFocusFloatBrowserPanel={onFocusFloatBrowserPanel}
                        onNavigateFloatBrowserPanel={onNavigateFloatBrowserPanel}
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

                {/* Tool panel on RIGHT when sidebarSide === "right" (default) */}
                {sidebarOpen && sidebarSide === "right" && (
                  <>
                    <ResizableHandle withHandle />
                    <ResizablePanel
                      id="tool-panel"
                      defaultSize={`${sidebarWidth}%`}
                      minSize="12%"
                      maxSize="70%"
                      onResize={(size) => setSidebarWidth(size.asPercentage)}
                    >
                      <Sidebar
                        ref={sidebarRef}
                        view={sidebarView}
                        onChangeView={setSidebarView}
                        rootPath={explorerRoot}
                        rootMode={activeRootMode}
                        onChangeRootMode={handleChangeRootMode}
                        showHidden={activeShowHidden}
                        onToggleShowHidden={handleToggleShowHidden}
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
                        onOpenFile={(path, pin) => openFileInPanel(path, pin)}
                        onPathRenamed={handlePathRenamed}
                        onPathDeleted={handlePathDeleted}
                        onRevealInTerminal={openFolderInTerminal}
                        onNewWorkspaceFromFolder={newWorkspaceFromFolder}
                        onAddToGitignore={handleAddToGitignore}
                        onOpenWorkspaceProperties={() =>
                          useWorkspaceSettingsStore
                            .getState()
                            .openSettings(activeWorkspaceId, "properties", "workspaceRoot")
                        }
                        onExplorerSearchClose={onExplorerSearchClose}
                        workspaceCwd={explorerRoot}
                        sourceControl={sourceControl}
                        pushOnCommit={pushOnCommit}
                        onPushOnCommitChange={handlePushOnCommitChange}
                        gitWorkspaceId={activeWorkspaceId}
                        savedCommitMessage={savedCommitMessage}
                        onCommitMessagePersist={handleCommitMessagePersist}
                        onOpenDiff={openGitDiffInPanel}
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
            onCreated={(path) => openFileInPanel(path, true)}
          />

          <UpdaterDialog />

          <WorkspaceSettingsDialog
            workspaces={workspaces}
            workspaceStatuses={workspaceStatuses}
            onSetStatus={setWorkspaceStatus}
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
            pendingCloseWorkspace={pendingCloseWorkspace}
            onCancelCloseWorkspace={() => setPendingCloseWorkspace(null)}
            onConfirmCloseWorkspace={(dontAskAgain) => {
              const id = pendingCloseWorkspace?.id;
              setPendingCloseWorkspace(null);
              if (dontAskAgain) void setWarnOnCloseWorkspace(false);
              if (id) void handleCloseWorkspaceRef.current(id);
            }}
            pendingWorkspaceProcesses={pendingWorkspaceProcesses}
            onCancelWorkspaceProcesses={() => setPendingWorkspaceProcesses(null)}
            onConfirmWorkspaceProcesses={(dontAskAgain) => {
              const id = pendingWorkspaceProcesses?.id;
              setPendingWorkspaceProcesses(null);
              if (dontAskAgain) void setWarnOnCloseTabWithRunningProcess(false);
              if (id) void handleCloseWorkspaceRef.current(id);
            }}
          />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );

  return shell;
}
