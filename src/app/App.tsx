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
import { newPanelId } from "@/lib/ids";
import { quoteShellArg } from "@/lib/shellQuote";
import { useZoom } from "@/lib/useZoom";
import { useEditorFont } from "@/modules/editor/lib/useEditorFont";
import { isMarkdownPath } from "@/lib/utils";
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
import type { BrowserPaneHandle } from "@/modules/browser";
import { useFloatBrowser } from "@/modules/browser/useFloatBrowser";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setEditorAutoSave,
  setPanelSide,
  setRightPanelOpen,
  setRightPanelActiveTab,
  setShowHidden,
  setWarnOnCloseTabWithRunningProcess,
} from "@/modules/settings/store";
import {
  useGlobalShortcuts,
  type ShortcutHandlers,
  type ShortcutId,
} from "@/modules/shortcuts";
import { useSourceControlContext } from "@/modules/source-control";
import { StatusBar } from "@/modules/statusbar";
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
  navigateFocusedBlocks,
  type TerminalPaneHandle,
  useTerminalFileDrop,
  writeToSession,
} from "@/modules/terminal";
import { ThemeProvider, useThemeFileEditing } from "@/modules/theme";
import { UpdaterDialog } from "@/modules/updater";
import { useWorkspaceEnvStore } from "@/modules/workspace";
import {
  allPanes,
  findPane,
  findPaneInDirection,
  panelTitle,
  type Panel,
  type PanelCallbacks,
  type Rect,
  useWorkspaces,
  WorkspaceView,
} from "@/modules/workspaces";
import { WorkspaceDndProvider } from "@/modules/workspaces/WorkspaceDndProvider";
import { flashLockIcon } from "@/modules/workspaces/lib/lockFlashStore";
import type { SearchAddon } from "@xterm/addon-search";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IS_MAC } from "@/lib/platform";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloseDialogs } from "./components/CloseDialogs";
import { RightPanel, type RightPanelHandle } from "./components/RightPanel";
import { WorkspaceInputBar } from "./components/WorkspaceInputBar";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { setEditorFlush } from "./lib/editorFlush";
import { useTabCloseGuards } from "./hooks/useTabCloseGuards";
import { useWorkspaceSwitcher } from "./hooks/useWorkspaceSwitcher";
import {
  getSavedWorkspaceState,
  saveWorkspaceState,
} from "@/modules/workspaces/lib/workspaceState";
import { useTabRenameStore } from "@/modules/workspaces/lib/tabRenameStore";
import { useFileRenameStore } from "@/modules/workspaces/lib/fileRenameStore";
import { clearRunningCommandEntry } from "@/modules/workspaces/lib/terminalEphemeralStore";
import {
  resolveExplorerRoot,
  resolveFocusTarget,
  isFilesystemRoot,
  parentRoot,
  type ExplorerRootMode,
} from "@/modules/workspaces/lib/explorerRoot";
import type { RevealRequest } from "@/modules/explorer";
import { panelFilePath } from "@/modules/workspaces/lib/panelPath";

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
    movePanel,
    reorderPanel,
    splitPaneAndPlace,
    splitPaneAndOpenPanel,
    openPanel,
    activatePanel,
    closePanel,
    updatePanelData,
    replacePanel,
    setTerminalPanelCwd,
    setWorkspaceCwd,
    setExplorerRootMode,
    setPinnedRoot,
    setFsRoot,
    setTerminalRunningCommand,
    setPanelView,
    findPanelGlobal,
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
  } = useFloatBrowser({ updatePanelData, findPanelGlobal });

  const activeCwdRef = useRef<string | null>(null);

  // ── Active panel derivation ───────────────────────────────────────────────

  const activePane = activeWorkspace
    ? findPane(activeWorkspace.paneTree, activeWorkspace.activePaneId)
    : null;
  const activePanelId = activePane?.activePanelId ?? null;
  const activePanel = activePanelId
    ? (activePane?.panels.find((p) => p.id === activePanelId) ?? null)
    : null;

  const isTerminalPanel = activePanel?.kind === "terminal";
  const isEditorPanel = activePanel?.kind === "editor";
  const isGitHistoryPanel = activePanel?.kind === "git-history";
  const activeCwd = isTerminalPanel
    ? ((activePanel as { cwd?: string }).cwd ?? null)
    : null;
  activeCwdRef.current = activeCwd;

  // ── Handle maps ───────────────────────────────────────────────────────────

  const searchAddons = useRef<Map<string, SearchAddon>>(new Map());
  const [activeSearchAddon, setActiveSearchAddon] =
    useState<SearchAddon | null>(null);
  const searchInlineRef = useRef<SearchInlineHandle | null>(null);
  const terminalHandles = useRef<Map<string, TerminalPaneHandle>>(new Map());
  const editorHandles = useRef<Map<string, EditorPaneHandle>>(new Map());
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  activeWorkspaceIdRef.current = activeWorkspaceId;
  const closePanelsRef = useRef<(panelIds: string[]) => void>(() => {});
  const browserHandles = useRef<Map<string, BrowserPaneHandle>>(new Map());
  const [activeEditorHandle, setActiveEditorHandle] =
    useState<EditorPaneHandle | null>(null);
  const [gitHistoryHandle, setGitHistoryHandle] =
    useState<GitHistorySearchHandle | null>(null);
  const pendingGotoLine = useRef<Map<string, number>>(new Map());

  const { zoomIn, zoomOut, zoomReset } = useZoom();
  useEditorFont();
  useTerminalFileDrop();

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
          for (const panel of pane.panels) {
            if (panel.kind === "terminal") knownIds.add(panel.id);
          }
        }
      }
      pruneOrphanedPlans(knownIds);
    });
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
    if (!pane?.activePanelId) return;
    const panelId = pane.activePanelId;
    const raf = requestAnimationFrame(() => {
      terminalHandles.current.get(panelId)?.focus();
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
        if (!pane?.activePanelId) return;
        requestAnimationFrame(() => {
          terminalHandles.current.get(pane.activePanelId!)?.focus();
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
    if (!pane?.activePanelId) return;
    const panelId = pane.activePanelId;
    const raf = requestAnimationFrame(() => {
      terminalHandles.current.get(panelId)?.focus();
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

  const rightPanelRef = useRef<RightPanelHandle>(null);
  const [revealRequest, setRevealRequest] = useState<RevealRequest | null>(
    null,
  );
  const rightPanelOpen = usePreferencesStore((s) => s.rightPanelOpen);
  const rightPanelActiveTab = usePreferencesStore((s) => s.rightPanelActiveTab);
  const panelSide = usePreferencesStore((s) => s.panelSide);
  const editorAutoSave = usePreferencesStore((s) => s.editorAutoSave);
  const showHidden = usePreferencesStore((s) => s.showHidden);
  const gitColorScheme = usePreferencesStore((s) => s.explorerGitColorScheme);
  const pendingExplorerSearch = useRef(false);

  // ── Live terminal panel tracking for session disposal ─────────────────────

  const livePanelIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const live = new Set<string>();
    for (const ws of workspaces) {
      for (const pane of allPanes(ws.paneTree)) {
        for (const panel of pane.panels) {
          if (panel.kind === "terminal") live.add(panel.id);
        }
      }
    }
    for (const id of livePanelIdsRef.current) {
      if (!live.has(id)) {
        disposeSession(id);
        searchAddons.current.delete(id);
        terminalHandles.current.delete(id);
        clearRunningCommandEntry(id);
      }
    }
    livePanelIdsRef.current = live;
    for (const k of [...editorHandles.current.keys()]) {
      const found = findPanelGlobal(k);
      if (!found) editorHandles.current.delete(k);
    }
    for (const k of [...browserHandles.current.keys()]) {
      const found = findPanelGlobal(k);
      if (!found) browserHandles.current.delete(k);
    }
  }, [workspaces, findPanelGlobal]);

  // Update active search addon / editor handle when active panel changes.
  // Switching tab or workspace flushes any dirty editor we just left.
  useEffect(() => {
    void flushDirtyEditorsRef.current();
    setActiveSearchAddon(
      activePanelId !== null
        ? (searchAddons.current.get(activePanelId) ?? null)
        : null,
    );
    setActiveEditorHandle(
      activePanelId !== null
        ? (editorHandles.current.get(activePanelId) ?? null)
        : null,
    );
  }, [activePanelId]);

  // ── Workspace state management ────────────────────────────────────────────

  const clearWorkspaceState = useCallback(() => {
    for (const id of livePanelIdsRef.current) {
      disposeSession(id);
      clearRunningCommandEntry(id);
    }
    searchAddons.current.clear();
    terminalHandles.current.clear();
    editorHandles.current.clear();
    browserHandles.current.clear();
    setActiveSearchAddon(null);
    setActiveEditorHandle(null);
  }, []);

  const handleCloseWorkspace = useCallback(
    async (wsId: string) => {
      await destroyWorkspaceFloats(wsId, workspacesRef.current);
      closeWorkspace(wsId);
    },
    [closeWorkspace, destroyWorkspaceFloats],
  );
  // Stored in a ref so Task 5 (WorkspaceSidebar close button) can consume it
  // without re-triggering effects that depend on the callback identity.
  const handleCloseWorkspaceRef = useRef(handleCloseWorkspace);
  handleCloseWorkspaceRef.current = handleCloseWorkspace;

  const workspaceEnv = useWorkspaceEnvStore((s) => s.env);
  const setWorkspaceEnv = useWorkspaceEnvStore((s) => s.setEnv);
  const { home, launchCwd, launchCwdResolved, switchWorkspace } =
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

  // When Cmd+Shift+F is pressed while the panel is closed, the panel opens
  // asynchronously (Tauri IPC). This effect fires once both conditions are met
  // and calls focusExplorer() to open and focus the search input.
  useEffect(() => {
    if (
      rightPanelOpen &&
      rightPanelActiveTab === "explorer" &&
      pendingExplorerSearch.current
    ) {
      pendingExplorerSearch.current = false;
      rightPanelRef.current?.focusExplorer();
    }
  }, [rightPanelOpen, rightPanelActiveTab]);

  // ── Last known terminal cwd for explorer root / new workspace inheritance ──

  const lastTerminalCwdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeCwd) lastTerminalCwdRef.current = activeCwd;
  }, [activeCwd]);

  const activeRootMode: ExplorerRootMode =
    activeWorkspace?.explorerRootMode ?? "filesystem";

  const terminalRootCwd = useMemo<string | null>(() => {
    if (activeCwd) return activeCwd;
    if (lastTerminalCwdRef.current) return lastTerminalCwdRef.current;
    for (const ws of workspaces) {
      for (const pane of allPanes(ws.paneTree)) {
        for (const panel of pane.panels) {
          if (panel.kind === "terminal" && panel.cwd) return panel.cwd;
        }
      }
    }
    return null;
  }, [activeCwd, workspaces]);

  // Git root of the current cwd, plus a per-workspace last-known fallback that
  // survives leaving a repo. Runtime only; re-derived from cwd on restart.
  const [currentGitRoot, setCurrentGitRoot] = useState<string | null>(null);
  const [gitRootByWs, setGitRootByWs] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!terminalRootCwd) {
      setCurrentGitRoot(null);
      return;
    }
    const ws = activeWorkspace;
    let cancelled = false;
    void native
      .gitResolveRepo(terminalRootCwd)
      .then((info) => {
        if (cancelled) return;
        const root = info?.repoRoot ?? null;
        setCurrentGitRoot(root);
        if (root && ws) {
          setGitRootByWs((prev) =>
            prev[ws.id] === root ? prev : { ...prev, [ws.id]: root },
          );
        }
      })
      .catch(() => {
        if (!cancelled) setCurrentGitRoot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [terminalRootCwd, activeWorkspace]);

  const gitRoot =
    currentGitRoot ??
    (activeWorkspace ? (gitRootByWs[activeWorkspace.id] ?? null) : null);

  const workspaceRootPath = activeWorkspace?.pinnedRoot ?? null;
  const fsFolderRoot = activeWorkspace?.fsRoot ?? null;

  const explorerRoot = useMemo<string | null>(
    () =>
      resolveExplorerRoot({
        mode: activeRootMode,
        pinnedRoot: workspaceRootPath,
        fsRoot: fsFolderRoot,
        home,
      }),
    [activeRootMode, workspaceRootPath, fsFolderRoot, home],
  );

  const canNavigateUp =
    activeRootMode === "filesystem" &&
    explorerRoot !== null &&
    !isFilesystemRoot(explorerRoot);

  const fsRootPath = fsFolderRoot ?? home;

  const handleChangeRootMode = useCallback(
    (mode: ExplorerRootMode) => {
      if (activeWorkspace) setExplorerRootMode(activeWorkspace.id, mode);
    },
    [activeWorkspace, setExplorerRootMode],
  );

  const handleSetAsRoot = useCallback(
    (path: string) => {
      if (activeWorkspace) setPinnedRoot(activeWorkspace.id, path);
    },
    [activeWorkspace, setPinnedRoot],
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

  const handleFocusOnExplorer = useCallback(
    (file: string) => {
      void setRightPanelOpen(true);
      void setRightPanelActiveTab("explorer");
      if (activeWorkspace) {
        const target = resolveFocusTarget({
          file,
          mode: activeRootMode,
          currentRoot: explorerRoot,
          fsRoot: fsFolderRoot,
          home,
        });
        if (target) {
          setExplorerRootMode(activeWorkspace.id, target.nextMode);
          setFsRoot(activeWorkspace.id, target.nextFsRoot);
        }
      }
      setRevealRequest((r) => ({ path: file, nonce: (r?.nonce ?? 0) + 1 }));
    },
    [
      activeWorkspace,
      activeRootMode,
      explorerRoot,
      fsFolderRoot,
      home,
      setExplorerRootMode,
      setFsRoot,
    ],
  );

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

  const openNewTerminal = useCallback(
    (targetPaneId?: string, targetWsId?: string) => {
      const ws = targetWsId
        ? workspacesRef.current.find((w) => w.id === targetWsId)
        : workspacesRef.current.find(
            (w) => w.id === activeWorkspaceIdRef.current,
          );
      if (!ws) return;
      openPanel(ws.id, targetPaneId ?? ws.activePaneId, {
        id: newPanelId(),
        kind: "terminal",
        cwd: activeCwdRef.current ?? ws.cwd,
      });
    },
    [openPanel],
  );

  const openNewBlock = useCallback(
    (targetPaneId?: string) => {
      if (!activeWorkspace) return;
      openPanel(
        activeWorkspace.id,
        targetPaneId ?? activeWorkspace.activePaneId,
        {
          id: newPanelId(),
          kind: "terminal",
          blocks: true,
          cwd: activeCwd ?? activeWorkspace.cwd,
        },
      );
    },
    [activeWorkspace, activeCwd, openPanel],
  );

  // ── Window title ──────────────────────────────────────────────────────────

  useEffect(() => {
    const project = explorerRoot ? basename(explorerRoot) : "";
    const label = activePanel
      ? activeCwd
        ? basename(activeCwd)
        : panelTitle(activePanel)
      : "";
    let title: string;
    if (project && label && label !== project) title = `${project} — ${label}`;
    else title = project || label || "Kex";
    document.title = title;
    void getCurrentWindow()
      .setTitle(title)
      .catch(() => {});
  }, [explorerRoot, activeCwd, activePanel]);

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
        const existing = pane.panels.find(
          (p) =>
            (p.kind === "editor" || p.kind === "markdown") &&
            (p as { path: string }).path === path,
        );
        if (existing) {
          if (pin && existing.kind === "editor" && existing.preview) {
            updatePanelData(activeWorkspace.id, existing.id, (p) =>
              p.kind === "editor" ? { ...p, preview: false } : p,
            );
          }
          activatePanel(activeWorkspace.id, existing.id);
          return existing.id;
        }
      }
      const panelId = newPanelId();
      const isPreview = !(pin ?? false);

      if (!markdown && isPreview) {
        const activePane = allPanes(activeWorkspace.paneTree).find(
          (p) => p.id === activeWorkspace.activePaneId,
        );
        const existingPreview = activePane?.panels.find(
          (p) => p.kind === "editor" && p.preview,
        );
        if (existingPreview) {
          replacePanel(
            activeWorkspace.id,
            activeWorkspace.activePaneId,
            existingPreview.id,
            {
              id: panelId,
              kind: "editor",
              path,
              dirty: false,
              preview: true,
            },
          );
          return panelId;
        }
      }

      openPanel(
        activeWorkspace.id,
        activeWorkspace.activePaneId,
        markdown
          ? { id: panelId, kind: "markdown", path }
          : {
              id: panelId,
              kind: "editor",
              path,
              dirty: false,
              preview: isPreview,
            },
      );
      return panelId;
    },
    [activeWorkspace, activatePanel, openPanel, replacePanel],
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
        id: newPanelId(),
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
        id: newPanelId(),
        kind: "git-history",
        repoRoot: args.repoRoot,
      });
    },
    [activeWorkspace, openPanel],
  );

  const openBrowserInPanel = useCallback(
    (url: string) => {
      if (!activeWorkspace) return undefined;
      const panelId = newPanelId();
      openPanel(activeWorkspace.id, activeWorkspace.activePaneId, {
        id: panelId,
        kind: "browser",
        url,
      });
      if (!url) {
        setTimeout(
          () => browserHandles.current.get(panelId)?.focusAddressBar(),
          0,
        );
      }
      return panelId;
    },
    [activeWorkspace, openPanel],
  );

  // ── Float browser callbacks ───────────────────────────────────────────────

  const onFloatBrowserPanel = useCallback(
    (panelId: string) => {
      const found = findPanelGlobal(panelId);
      if (!found || found.panel.kind !== "browser") return;
      void floatPanel(found.panel, found.workspace.id);
    },
    [findPanelGlobal, floatPanel],
  );

  const onDockBrowserPanel = useCallback(
    (panelId: string) => {
      void dockViaCommand(panelId);
    },
    [dockViaCommand],
  );

  const onFocusFloatBrowserPanel = useCallback(
    (panelId: string) => {
      void focusFloatWindow(panelId);
    },
    [focusFloatWindow],
  );

  const onNavigateFloatBrowserPanel = useCallback(
    (panelId: string, url: string) => {
      void navigateFloatWindow(panelId, url);
    },
    [navigateFloatWindow],
  );

  // ── WorkspaceView stable callbacks (use refs to avoid recreating on cd) ──

  const onActivatePanelStable = useCallback(
    (wsId: string, panelId: string) => activatePanel(wsId, panelId),
    [activatePanel],
  );

  const onClosePanelStable = useCallback((_wsId: string, panelId: string) => {
    closePanelsRef.current([panelId]);
  }, []);

  const onCloseManyPanelsStable = useCallback((_wsId: string, panelIds: string[]) => {
    closePanelsRef.current(panelIds);
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
      openPanel(wsId, newPaneId, {
        id: newPanelId(),
        kind: "terminal",
        cwd: activeCwdRef.current ?? ws.cwd,
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
      openPanel(wsId, newPaneId, {
        id: newPanelId(),
        kind: "terminal",
        cwd: activeCwdRef.current ?? ws.cwd,
      });
    },
    [splitPane, openPanel],
  );

  const onNewBrowserStable = useCallback(
    (wsId: string, paneId: string) => {
      const panelId = newPanelId();
      openPanel(wsId, paneId, { id: panelId, kind: "browser", url: "" });
      setTimeout(
        () => browserHandles.current.get(panelId)?.focusAddressBar(),
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
      const panelId = newPanelId();
      openPanel(wsId, newPaneId, { id: panelId, kind: "browser", url: "" });
      setTimeout(
        () => browserHandles.current.get(panelId)?.focusAddressBar(),
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
      const panelId = newPanelId();
      openPanel(wsId, newPaneId, { id: panelId, kind: "browser", url: "" });
      setTimeout(
        () => browserHandles.current.get(panelId)?.focusAddressBar(),
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
        id: newPanelId(),
        kind: "git-commit-file",
        repoRoot: params.repoRoot,
        sha: params.sha,
        path: params.path,
        originalPath: params.originalPath,
      });
    },
    [activeWorkspaceId, openPanel],
  );

  // ── PanelCallbacks ────────────────────────────────────────────────────────

  const handlePathRenamed = useCallback(
    (from: string, to: string) => {
      for (const ws of workspacesRef.current) {
        for (const pane of allPanes(ws.paneTree)) {
          for (const panel of pane.panels) {
            if (panel.kind !== "editor") continue;
            const ep = panel as { path: string };
            if (ep.path === from) {
              const i = to.lastIndexOf("/");
              updatePanelData(ws.id, panel.id, (p) =>
                p.kind === "editor"
                  ? { ...p, path: to, title: i === -1 ? to : to.slice(i + 1) }
                  : p,
              );
            } else if (ep.path.startsWith(`${from}/`)) {
              const newPath = `${to}${ep.path.slice(from.length)}`;
              const i = newPath.lastIndexOf("/");
              updatePanelData(ws.id, panel.id, (p) =>
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
    [updatePanelData],
  );

  const handleRenameFileFromTab = useCallback(
    async (panelId: string, newName: string) => {
      const found = findPanelGlobal(panelId);
      if (!found) return;
      const panel = found.panel;
      if (panel.kind !== "editor" && panel.kind !== "markdown") return;
      const oldPath = panel.path;
      const lastSlash = oldPath.lastIndexOf("/");
      const parent = lastSlash >= 0 ? oldPath.slice(0, lastSlash) : oldPath;
      const newPath = `${parent}/${newName}`;
      try {
        await native.renameFile(oldPath, newPath);
        handlePathRenamed(oldPath, newPath);
        rightPanelRef.current?.refreshExplorer(parent);
      } catch (e) {
        toast.error("Failed to rename file", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [findPanelGlobal, handlePathRenamed],
  );

  const panelCallbacks = useMemo<PanelCallbacks>(
    () => ({
      onSearchReady: (panelId, addon) => {
        searchAddons.current.set(panelId, addon);
        if (panelId === activePanelId) setActiveSearchAddon(addon);
      },
      onExit: (panelId, _code) => {
        const found = findPanelGlobal(panelId);
        if (found) closePanel(found.workspace.id, panelId);
      },
      onCwd: (panelId, cwd) => {
        const found = findPanelGlobal(panelId);
        if (found) {
          setTerminalPanelCwd(found.workspace.id, panelId, cwd);
          if (
            found.workspace.activePaneId === found.pane.id &&
            found.pane.activePanelId === panelId
          ) {
            setWorkspaceCwd(found.workspace.id, cwd);
          }
        }
      },
      onRunningCommand: (panelId, cmd) => {
        const found = findPanelGlobal(panelId);
        if (found) setTerminalRunningCommand(found.workspace.id, panelId, cmd);
      },
      registerTerminalHandle: (panelId, h) => {
        if (h) terminalHandles.current.set(panelId, h);
        else terminalHandles.current.delete(panelId);
      },
      onEditorDirtyChange: (panelId, dirty) => {
        const found = findPanelGlobal(panelId);
        if (found)
          updatePanelData(found.workspace.id, panelId, (p) =>
            p.kind === "editor"
              ? { ...p, dirty, ...(dirty ? { preview: false } : {}) }
              : p,
          );
      },
      onEditorClose: (panelId) => {
        const found = findPanelGlobal(panelId);
        if (found) closePanel(found.workspace.id, panelId);
      },
      onSetMarkdownView: (panelId, mode) => {
        const found = findPanelGlobal(panelId);
        if (found) setPanelView(found.workspace.id, panelId, mode);
      },
      registerEditorHandle: (panelId, h) => {
        if (h) {
          editorHandles.current.set(panelId, h);
          const line = pendingGotoLine.current.get(panelId);
          if (line != null) {
            pendingGotoLine.current.delete(panelId);
            h.gotoLine(line);
          }
        } else {
          editorHandles.current.delete(panelId);
        }
        if (panelId === activePanelId) setActiveEditorHandle(h);
      },
      onBrowserUrlChange: (panelId, url) => {
        const found = findPanelGlobal(panelId);
        if (found)
          updatePanelData(found.workspace.id, panelId, (p) =>
            p.kind === "browser" ? { ...p, url } : p,
          );
      },
      registerBrowserHandle: (panelId, h) => {
        if (h) browserHandles.current.set(panelId, h);
        else browserHandles.current.delete(panelId);
      },
      onOpenCommitFile: (input) => {
        if (!activeWorkspace) return;
        openPanel(activeWorkspace.id, activeWorkspace.activePaneId, {
          id: newPanelId(),
          kind: "git-commit-file",
          repoRoot: input.repoRoot,
          sha: input.sha,
          path: input.path,
          originalPath: input.originalPath,
        });
      },
      onGitHistorySearchHandle: (_panelId, handle) => {
        setGitHistoryHandle(handle);
      },
      onRenamePanel: (panelId, title) => {
        const found = findPanelGlobal(panelId);
        if (found)
          updatePanelData(found.workspace.id, panelId, (p) => ({
            ...p,
            title,
          }));
      },
      onUpdatePanel: (panelId, updater) => {
        const found = findPanelGlobal(panelId);
        if (found) updatePanelData(found.workspace.id, panelId, updater);
      },
      onRenameFile: (panelId, newName) => {
        void handleRenameFileFromTab(panelId, newName);
      },
      onFocusOnExplorer: (filePath) => handleFocusOnExplorer(filePath),
    }),
    [
      activePanelId,
      findPanelGlobal,
      closePanel,
      setTerminalPanelCwd,
      setWorkspaceCwd,
      setTerminalRunningCommand,
      setPanelView,
      updatePanelData,
      activeWorkspace,
      openPanel,
      handleRenameFileFromTab,
      handleFocusOnExplorer,
    ],
  );

  // ── Close guards ──────────────────────────────────────────────────────────

  const savePanel = useCallback(async (panelId: string) => {
    await editorHandles.current.get(panelId)?.save();
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

  const focusActivePanel = useCallback(() => {
    const ws = workspacesRef.current.find(
      (w) => w.id === activeWorkspaceIdRef.current,
    );
    if (!ws) return;
    const pane = findPane(ws.paneTree, ws.activePaneId);
    const panelId = pane?.activePanelId;
    if (!panelId) return;
    const kind = findPanelGlobal(panelId)?.panel.kind;
    requestAnimationFrame(() => {
      if (kind === "editor") editorHandles.current.get(panelId)?.focus();
      else terminalHandles.current.get(panelId)?.focus();
    });
  }, [findPanelGlobal]);

  const {
    pendingClosePanel,
    pendingTerminalClosePanel,
    pendingDeletePanels,
    closePanels,
    resolveEditor,
    resolveTerminal,
    confirmDeleteClose,
    cancelDeleteClose,
    handlePathDeleted,
  } = useTabCloseGuards({
    workspaces,
    disposePanel: (workspaceId, panelId) => {
      const found = findPanelGlobal(panelId);
      if (found?.panel.kind === "browser" && found.panel.floating) {
        void closeFloatWindow(panelId);
      }
      closePanel(workspaceId, panelId);
    },
    findPanel: findPanelGlobal,
    savePanel,
    focusActivePanel,
    isWarnEnabled: () =>
      usePreferencesStore.getState().warnOnCloseTabWithRunningProcess,
    setWarnEnabled: setWarnOnCloseTabWithRunningProcess,
    isAutoSaveEnabled: () => usePreferencesStore.getState().editorAutoSave,
  });

  closePanelsRef.current = closePanels;

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
        for (const panel of pane.panels) {
          if (panel.kind === "editor") {
            const ep = panel as EditorShim;
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

  // ── useThemeFileEditing ───────────────────────────────────────────────────

  useThemeFileEditing({
    tabsRef: editorPanelsRef,
    openFileTab: (path) => openFileInPanel(path, true),
  });

  // ── Source control ────────────────────────────────────────────────────────

  const activeFilePath = (() => {
    if (activePanel?.kind === "editor")
      return (activePanel as { path: string }).path;
    if (activePanel?.kind === "git-diff") {
      const p = activePanel as { path: string; repoRoot: string };
      if (/^([A-Za-z]:|\/|\\)/.test(p.path)) return p.path;
      return `${p.repoRoot.replace(/[\\/]+$/, "")}/${p.path.replace(/^[\\/]+/, "")}`;
    }
    if (activePanel?.kind === "git-commit-file") {
      const p = activePanel as { path: string; repoRoot: string };
      return `${p.repoRoot.replace(/[\\/]+$/, "")}/${p.path.replace(/^[\\/]+/, "")}`;
    }
    return null;
  })();

  const explorerActiveFilePath =
    activePanel?.kind === "editor" || activePanel?.kind === "markdown"
      ? (activePanel as { path: string }).path
      : null;

  const toggleRightPanel = useCallback(() => {
    void setRightPanelOpen(!usePreferencesStore.getState().rightPanelOpen);
  }, []);

  const navigateRightPanelTo = useCallback(
    (tab: "explorer" | "git" | "history") => {
      const state = usePreferencesStore.getState();
      if (!state.rightPanelOpen) {
        void setRightPanelOpen(true);
        void setRightPanelActiveTab(tab);
      } else if (state.rightPanelActiveTab === tab) {
        void setRightPanelOpen(false);
      } else {
        void setRightPanelActiveTab(tab);
      }
    },
    [],
  );

  const showRightPanelTab = useCallback(
    (tab: "explorer" | "git" | "history") => {
      const state = usePreferencesStore.getState();
      if (!state.rightPanelOpen) {
        void setRightPanelOpen(true);
      }
      void setRightPanelActiveTab(tab);
    },
    [],
  );

  const showExplorerWithMode = useCallback(
    (mode: ExplorerRootMode) => {
      const state = usePreferencesStore.getState();
      if (!state.rightPanelOpen) {
        void setRightPanelOpen(true);
      }
      void setRightPanelActiveTab("explorer");
      handleChangeRootMode(mode);
    },
    [handleChangeRootMode],
  );

  const allPanelsFlat = useMemo(() => {
    const panels: Panel[] = [];
    for (const ws of workspaces) {
      for (const pane of allPanes(ws.paneTree)) {
        for (const p of pane.panels) panels.push(p);
      }
    }
    return panels;
  }, [workspaces]);

  const { sourceControl, toggleSourceControl, openGitGraphFromContext } =
    useSourceControlContext({
      activeTab: activePanel ?? undefined,
      tabs: allPanelsFlat,
      activeTerminalLeafCwd: activeCwd,
      explorerRoot,
      explorerRootMode: activeRootMode,
      launchCwd,
      launchCwdResolved,
      home,
      sidebarView: "source-control",
      cycleSidebarView: () => navigateRightPanelTo("git"),
      openCommitHistoryTab: openGitHistoryInPanel,
    });

  // ── Terminal helpers ──────────────────────────────────────────────────────

  const sendCd = useCallback(
    (path: string) => {
      if (activePanelId === null) return;
      const term = terminalHandles.current.get(activePanelId);
      if (!term) return;
      term.write(`cd ${quoteShellArg(path)}\r`);
      term.focus();
    },
    [activePanelId],
  );

  const openFolderInTerminal = useCallback(
    (path: string) => {
      if (!activeWorkspace) return;
      const panelId = newPanelId();
      openPanel(activeWorkspace.id, activeWorkspace.activePaneId, {
        id: panelId,
        kind: "terminal",
        cwd: path,
      });
      setTimeout(() => terminalHandles.current.get(panelId)?.focus(), 80);
    },
    [activeWorkspace, openPanel],
  );

  const newWorkspaceFromFolder = useCallback(
    (path: string) => {
      const wsId = addWorkspace(path);
      setPinnedRoot(wsId, path);
      setTimeout(() => {
        const ws = workspacesRef.current.find((w) => w.id === wsId);
        if (!ws) return;
        const pane = allPanes(ws.paneTree)[0];
        const panel = pane?.activePanelId
          ? pane.panels.find((p) => p.id === pane.activePanelId)
          : pane?.panels[0];
        if (panel) terminalHandles.current.get(panel.id)?.focus();
      }, 80);
    },
    [addWorkspace, setPinnedRoot],
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
      isTerminalPanel && activePanelId !== null
        ? (cmd: string) => {
            writeToSession(activePanelId, cmd);
            terminalHandles.current.get(activePanelId)?.focus();
          }
        : null,
    [isTerminalPanel, activePanelId],
  );

  // ── Search ────────────────────────────────────────────────────────────────

  const searchTarget = useMemo<SearchTarget>(() => {
    if (isTerminalPanel && activePanelId !== null && activeSearchAddon)
      return {
        kind: "terminal",
        addon: activeSearchAddon,
        focus: () => terminalHandles.current.get(activePanelId)?.focus(),
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
    activePanelId,
    activeSearchAddon,
    activeEditorHandle,
    gitHistoryHandle,
  ]);

  const onExplorerSearchClose = useCallback(() => {
    searchTarget?.focus();
  }, [searchTarget]);

  // ── Shortcuts ─────────────────────────────────────────────────────────────

  const [zenMode, setZenMode] = useState(false);

  const handleCloseActivePanel = useCallback(() => {
    if (!activeWorkspace || !activePanelId) return;
    if (
      (activePanel?.kind === "terminal" || activePanel?.kind === "editor") &&
      activePanel.locked
    ) {
      flashLockIcon(activePanelId);
      return;
    }
    closePanelsRef.current([activePanelId]);
  }, [activeWorkspace, activePanelId, activePanel]);

  const handleCloseOtherPanels = useCallback(() => {
    if (!activePane || !activePanelId) return;
    const ids = activePane.panels
      .filter(
        (p) => p.id !== activePanelId && !(p as { locked?: boolean }).locked,
      )
      .map((p) => p.id);
    if (ids.length) closePanelsRef.current(ids);
  }, [activePane, activePanelId]);

  const handleCloseAllPanels = useCallback(() => {
    if (!activePane) return;
    const ids = activePane.panels
      .filter((p) => !(p as { locked?: boolean }).locked)
      .map((p) => p.id);
    if (ids.length) closePanelsRef.current(ids);
  }, [activePane]);

  const cycleWorkspace = useCallback(
    (delta: 1 | -1) => {
      if (workspaces.length < 2) return;
      const idx = workspaces.findIndex((w) => w.id === activeWorkspaceId);
      const nextIdx = (idx + delta + workspaces.length) % workspaces.length;
      setActiveWorkspaceId(workspaces[nextIdx].id);
    },
    [workspaces, activeWorkspaceId, setActiveWorkspaceId],
  );

  function focusPaneInDirection(dir: "up" | "down" | "left" | "right") {
    if (!activeWorkspace) return;
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

  const shortcutHandlers = useMemo<ShortcutHandlers>(
    () => ({
      "commandPalette.open": () => openCommandPalette("commands"),
      "commandPalette.content": () => openCommandPalette("content"),
      "tab.new": () => {
        openNewTerminal();
      },
      "tab.newBlock": () => openNewBlock(),
      "workspace.new": () => addWorkspace(home ?? undefined),
      "tab.newBrowser": () => openBrowserInPanel(""),
      "tab.newEditor": () => setNewEditorOpen(true),
      "tab.close": handleCloseActivePanel,
      "tab.rename": () => {
        const active = document.activeElement;
        const tag = active?.tagName;
        if (
          (tag === "INPUT" || tag === "TEXTAREA") &&
          !active?.classList.contains("xterm-helper-textarea")
        )
          return;
        if (!activePanelId) return;
        useTabRenameStore.getState().startRename(activePanelId);
      },
      "file.rename": () => {
        const active = document.activeElement;
        const tag = active?.tagName;
        if (
          (tag === "INPUT" || tag === "TEXTAREA") &&
          !active?.classList.contains("xterm-helper-textarea")
        )
          return;
        if (!activePanelId) return;
        const panel = findPanelGlobal(activePanelId)?.panel;
        if (panel?.kind === "editor" || panel?.kind === "markdown") {
          useFileRenameStore.getState().trigger(activePanelId);
        }
      },
      "tab.next": () => {
        if (!activeWorkspace || !activePane) return;
        const panels = activePane.panels;
        if (panels.length < 2) return;
        const idx = panels.findIndex((p) => p.id === activePane.activePanelId);
        const next = panels[(idx + 1) % panels.length];
        activatePanel(activeWorkspace.id, next.id);
      },
      "tab.prev": () => {
        if (!activeWorkspace || !activePane) return;
        const panels = activePane.panels;
        if (panels.length < 2) return;
        const idx = panels.findIndex((p) => p.id === activePane.activePanelId);
        const prev = panels[(idx - 1 + panels.length) % panels.length];
        activatePanel(activeWorkspace.id, prev.id);
      },
      "tab.selectByIndex": (e) => {
        const idx = parseInt(e.key, 10) - 1;
        if (idx >= 0 && idx < workspaces.length)
          setActiveWorkspaceId(workspaces[idx].id);
      },
      "pane.splitRight": doSplitRight,
      "pane.splitDown": doSplitDown,
      "pane.focusUp": () => focusPaneInDirection("up"),
      "pane.focusDown": () => focusPaneInDirection("down"),
      "pane.focusLeft": () => focusPaneInDirection("left"),
      "pane.focusRight": () => focusPaneInDirection("right"),
      "sidebar.toggle": toggleRightPanel,
      "sidebar.showExplorer": () => showRightPanelTab("explorer"),
      "sidebar.showGit": () => showRightPanelTab("git"),
      "sidebar.showHistory": () => showRightPanelTab("history"),
      "explorer.viewFilesystem": () => showExplorerWithMode("filesystem"),
      "explorer.viewPinned": () => showExplorerWithMode("pinned"),
      "explorer.toggleHidden": () =>
        void setShowHidden(!usePreferencesStore.getState().showHidden),
      "explorer.search": () => {
        const state = usePreferencesStore.getState();
        if (state.rightPanelOpen && state.rightPanelActiveTab === "explorer") {
          // Panel already visible on explorer: toggle search open/closed.
          rightPanelRef.current?.toggleExplorerSearch?.();
        } else {
          // Panel closed or on another tab: open it, switch to explorer,
          // then open search once the async IPC resolves and the panel mounts.
          pendingExplorerSearch.current = true;
          void setRightPanelOpen(true);
          void setRightPanelActiveTab("explorer");
        }
      },
      "terminal.clear": () => {
        clearFocusedTerminal();
      },
      "blocks.prev": () => navigateFocusedBlocks(-1),
      "blocks.next": () => navigateFocusedBlocks(1),
      "search.focus": () => searchInlineRef.current?.focus(),
      "settings.open": () => void openSettingsWindow(),
      "notifications.toggle": () => useBellStore.getState().toggle(),
      "window.new": () => void native.openMainWindow(),
      "workspace.prev": () => cycleWorkspace(-1),
      "workspace.next": () => cycleWorkspace(1),
      "view.zoomIn": zoomIn,
      "view.zoomOut": zoomOut,
      "view.zoomReset": zoomReset,
      "view.zenMode": () => setZenMode((v) => !v),
      "editor.undo": () => {
        if (activePanelId) editorHandles.current.get(activePanelId)?.undo();
      },
      "editor.redo": () => {
        if (activePanelId) editorHandles.current.get(activePanelId)?.redo();
      },
      "notifications.jumpToLast": () => {
        const first = useAgentStore.getState().notifications[0];
        if (!first) return;
        setActiveWorkspaceId(first.tabId);
        activatePanel(first.tabId, first.panelId);
        setTimeout(
          () => terminalHandles.current.get(first.panelId)?.focus(),
          50,
        );
      },
      "tab.lock": () => {
        if (!activePanelId) return;
        if (activePanel?.kind !== "terminal" && activePanel?.kind !== "editor")
          return;
        const found = findPanelGlobal(activePanelId);
        if (found)
          updatePanelData(found.workspace.id, activePanelId, (p) => {
            if (p.kind === "terminal") return { ...p, locked: !p.locked };
            if (p.kind === "editor") {
              const newLocked = !p.locked;
              return {
                ...p,
                locked: newLocked,
                ...(newLocked ? { preview: false } : {}),
              };
            }
            return p;
          });
      },
      "tab.focusOnExplorer": () => {
        if (!activePanel) return;
        const target =
          panelFilePath(activePanel) ??
          (activePanel.kind === "terminal" ? (activePanel.cwd ?? null) : null);
        if (target) handleFocusOnExplorer(target);
      },
      "path.copy": () => {
        if (!activePanel) return;
        let path: string | undefined;
        if (activePanel.kind === "editor" || activePanel.kind === "markdown") {
          path = activePanel.path;
        } else if (activePanel.kind === "terminal") {
          path = activePanel.cwd;
        } else if (activePanel.kind === "browser") {
          path = activePanel.url;
        }
        if (!path) return;
        void navigator.clipboard.writeText(path).then(() => {
          toast.success("Path copied");
        });
      },
    }),
    [
      activeWorkspace,
      activeWorkspaceId,
      activePane,
      activePanelId,
      activePanel,
      activeCwd,
      workspaces,
      findPanelGlobal,
      updatePanelData,
      openCommandPalette,
      cycleWorkspace,
      activatePanel,
      handleCloseActivePanel,
      handleFocusOnExplorer,
      openNewTerminal,
      openNewBlock,
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
      toggleRightPanel,
      showRightPanelTab,
      showExplorerWithMode,
    ],
  );

  const shortcutsDisabled = useCallback(
    (id: ShortcutId, e: KeyboardEvent) => {
      if (id === "editor.undo" || id === "editor.redo") {
        return activePanel?.kind !== "editor";
      }
      if (id === "terminal.clear") {
        const target =
          (e.target as HTMLElement | null) ?? document.activeElement;
        return !(target as HTMLElement | null)?.closest?.(".xterm");
      }
      if (id === "blocks.prev" || id === "blocks.next") {
        return !(
          activePanel?.kind === "terminal" &&
          (activePanel as { blocks?: boolean }).blocks === true
        );
      }
      if (id === "file.rename") {
        return rightPanelRef.current?.isExplorerFocused() ?? false;
      }
      if (id === "tab.lock") {
        return (
          activePanel?.kind !== "terminal" && activePanel?.kind !== "editor"
        );
      }

      return false;
    },
    [activePanel],
  );

  useGlobalShortcuts(shortcutHandlers, { isDisabled: shortcutsDisabled });

  // ── Agent activation ──────────────────────────────────────────────────────

  const onActivateAgent = useCallback(
    (workspaceId: string, panelId: string) => {
      setActiveWorkspaceId(workspaceId);
      activatePanel(workspaceId, panelId);
      setTimeout(() => terminalHandles.current.get(panelId)?.focus(), 50);
    },
    [setActiveWorkspaceId, activatePanel],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .listen<{ workspaceId: string; panelId: string }>(
        "kex:activate-panel",
        (e) => {
          onActivateAgent(e.payload.workspaceId, e.payload.panelId);
        },
      )
      .then((u) => {
        unlisten = u;
      })
      .catch((e) =>
        console.error("[kex] kex:activate-panel listen failed:", e),
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
        toggleRightPanel();
        break;
      case "toggle_explorer":
        showRightPanelTab("explorer");
        break;
      case "toggle_git":
        showRightPanelTab("git");
        break;
      case "toggle_history":
        showRightPanelTab("history");
        break;
      case "toggle_hidden":
        void setShowHidden(!usePreferencesStore.getState().showHidden);
        break;
      case "toggle_panel_side":
        void setPanelSide(
          usePreferencesStore.getState().panelSide === "left"
            ? "right"
            : "left",
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
        sidebarOpen: rightPanelOpen,
        activeTab: rightPanelActiveTab,
        panelSide,
        showHidden,
      },
    }).catch(() => {});
  }, [editorAutoSave, rightPanelOpen, rightPanelActiveTab, panelSide, showHidden]);

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
            openNewBlock: () => openNewBlock(),
            openNewEditor: () => setNewEditorOpen(true),
            openNewBrowser: () => openBrowserInPanel(""),
            openGitGraph: openGitGraphFromContext,
            toggleSourceControl,
            closeActiveTabOrPane: handleCloseActivePanel,
            splitPaneRight: doSplitRight,
            splitPaneDown: doSplitDown,
            focusSearch: () => searchInlineRef.current?.focus(),
            focusExplorerSearch: () => rightPanelRef.current?.focusExplorer(),
            toggleSidebar: toggleRightPanel,
            openSettings: () => void openSettingsWindow(),
            openKeyboardShortcuts: () => void openSettingsWindow("shortcuts"),
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
      openNewBlock,
      openBrowserInPanel,
      openGitGraphFromContext,
      toggleSourceControl,
      handleCloseActivePanel,
      doSplitRight,
      doSplitDown,
      toggleRightPanel,
    ],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const rightPanelRepoRoot =
    sourceControl.repo?.repoRoot ?? explorerRoot ?? home ?? "";

  const shell = (
    <ThemeProvider>
      <TooltipProvider>
        <div className="zoom-content relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
          {!zenMode && (
            <Header
              onToggleSidebar={toggleRightPanel}
              panelSide={panelSide}
              onOpenCommandPalette={() => openCommandPalette("commands")}
              onActivateAgent={onActivateAgent}
              onOpenSettings={() => void openSettingsWindow()}
              searchTarget={searchTarget}
              searchRef={searchInlineRef}
            />
          )}

          {/* 3-column layout */}
          <div className="flex min-h-0 flex-1">
            {/* LEFT: 52px workspace sidebar */}
            <WorkspaceSidebar
              workspaces={workspaces.map((w) => ({
                id: w.id,
                title: w.title,
                kind: "terminal",
                cwd: w.cwd,
              }))}
              activeId={activeWorkspaceId}
              onSelect={setActiveWorkspaceId}
              onNew={() => addWorkspace(home ?? undefined)}
              onReorder={reorderWorkspaces}
              onClose={(wsId) => handleCloseWorkspaceRef.current(wsId)}
            />

            {/* CENTER + TOOL PANEL: resizable, side configurable */}
            <WorkspaceDndProvider
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              onMovePanel={movePanel}
              onReorderPanel={reorderPanel}
              onSplitPaneAndPlace={splitPaneAndPlace}
              onSplitPaneAndOpenPanel={splitPaneAndOpenPanel}
              onOpenPanel={openPanel}
            >
              <ResizablePanelGroup
                orientation="horizontal"
                className="min-h-0 flex-1"
              >
                {/* Tool panel on LEFT when panelSide === "left" */}
                {rightPanelOpen && panelSide === "left" && (
                  <>
                    <ResizablePanel
                      id="tool-panel"
                      defaultSize="20%"
                      minSize="12%"
                      maxSize="35%"
                    >
                      <RightPanel
                        ref={rightPanelRef}
                        rootPath={explorerRoot}
                        rootMode={activeRootMode}
                        onChangeRootMode={handleChangeRootMode}
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
                        activeFilePath={explorerActiveFilePath ?? null}
                        revealRequest={revealRequest}
                        onOpenFile={(path, pin) => openFileInPanel(path, pin)}
                        onPathRenamed={handlePathRenamed}
                        onPathDeleted={handlePathDeleted}
                        onRevealInTerminal={openFolderInTerminal}
                        onNewWorkspaceFromFolder={newWorkspaceFromFolder}
                        onAddToGitignore={handleAddToGitignore}
                        onExplorerSearchClose={onExplorerSearchClose}
                        sourceControl={sourceControl}
                        onOpenDiff={openGitDiffInPanel}
                        onOpenGitGraph={openGitGraphFromContext}
                        repoRoot={rightPanelRepoRoot}
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
                      <WorkspaceView
                        workspaces={workspaces}
                        activeWorkspaceId={activeWorkspaceId}
                        onActivatePanel={onActivatePanelStable}
                        onClosePanel={onClosePanelStable}
                        onCloseManyPanels={onCloseManyPanelsStable}
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
                      />
                    </div>

                    <WorkspaceInputBar
                      isBlockTab={false}
                      activeLeafId={activePanelId}
                    />
                  </div>
                </ResizablePanel>

                {/* Tool panel on RIGHT when panelSide === "right" (default) */}
                {rightPanelOpen && panelSide === "right" && (
                  <>
                    <ResizableHandle withHandle />
                    <ResizablePanel
                      id="tool-panel"
                      defaultSize="20%"
                      minSize="12%"
                      maxSize="35%"
                    >
                      <RightPanel
                        ref={rightPanelRef}
                        rootPath={explorerRoot}
                        rootMode={activeRootMode}
                        onChangeRootMode={handleChangeRootMode}
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
                        activeFilePath={explorerActiveFilePath ?? null}
                        revealRequest={revealRequest}
                        onOpenFile={(path, pin) => openFileInPanel(path, pin)}
                        onPathRenamed={handlePathRenamed}
                        onPathDeleted={handlePathDeleted}
                        onRevealInTerminal={openFolderInTerminal}
                        onNewWorkspaceFromFolder={newWorkspaceFromFolder}
                        onAddToGitignore={handleAddToGitignore}
                        onExplorerSearchClose={onExplorerSearchClose}
                        sourceControl={sourceControl}
                        onOpenDiff={openGitDiffInPanel}
                        onOpenGitGraph={openGitGraphFromContext}
                        repoRoot={rightPanelRepoRoot}
                        onOpenCommitFile={onOpenCommitFileStable}
                        onSearchHandle={setGitHistoryHandle}
                      />
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
            </WorkspaceDndProvider>
          </div>

          {!zenMode && (
            <StatusBar
              cwd={activeCwd}
              filePath={activeFilePath}
              home={home}
              onCd={sendCd}
              onWorkspaceChange={switchWorkspace}
              privateActive={false}
            />
          )}

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

          <CloseDialogs
            pendingClosePanel={pendingClosePanel}
            onCancelClose={() => resolveEditor({ type: "cancel" })}
            onSaveClose={() => resolveEditor({ type: "save" })}
            onDontSaveClose={() => resolveEditor({ type: "dont-save" })}
            pendingTerminalClosePanel={pendingTerminalClosePanel}
            onCancelTerminalClose={() => resolveTerminal({ type: "cancel" })}
            onConfirmTerminalClose={(dontAskAgain) =>
              resolveTerminal({ type: "close", dontAskAgain })
            }
            pendingDeletePanels={pendingDeletePanels}
            onCancelDeleteClose={cancelDeleteClose}
            onConfirmDeleteClose={confirmDeleteClose}
          />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );

  return shell;
}
