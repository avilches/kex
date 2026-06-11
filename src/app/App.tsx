import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getLaunchDir } from "@/lib/launchDir";
import { native } from "@/lib/native";
import { quoteShellArg } from "@/lib/shellQuote";
import { useZoom } from "@/lib/useZoom";
import { AgentNotificationsBridge } from "@/modules/agents";
import {
  CommandPalette,
  createCommandItems,
} from "@/modules/command-palette";
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
import type { PreviewPaneHandle } from "@/modules/preview";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setRightPanelOpen } from "@/modules/settings/store";
import {
  useGlobalShortcuts,
  type ShortcutHandlers,
  type ShortcutId,
} from "@/modules/shortcuts";
import { useSourceControlContext } from "@/modules/source-control";
import { StatusBar } from "@/modules/statusbar";
import {
  clearFocusedTerminal,
  disposeSession,
  type TerminalPaneHandle,
  useTerminalFileDrop,
  writeToSession,
} from "@/modules/terminal";
import { ThemeProvider, useThemeFileEditing } from "@/modules/theme";
import { UpdaterDialog } from "@/modules/updater";
import { useWorkspaceEnvStore } from "@/modules/workspace";
import {
  allPaneIds,
  allPanes,
  findPane,
  panelTitle,
  type Panel,
  type PanelCallbacks,
  useWorkspaces,
  WorkspaceView,
} from "@/modules/workspaces";
import type { SearchAddon } from "@xterm/addon-search";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloseDialogs } from "./components/CloseDialogs";
import { RightPanel, type RightPanelHandle } from "./components/RightPanel";
import {
  TOGGLE_BLOCK_INPUT_EVENT,
  WorkspaceInputBar,
} from "./components/WorkspaceInputBar";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { useTabCloseGuards } from "./hooks/useTabCloseGuards";
import { useWorkspaceSwitcher } from "./hooks/useWorkspaceSwitcher";
import {
  getSavedWorkspaceState,
  saveWorkspaceState,
} from "@/modules/workspaces/lib/workspaceState";

function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export default function App() {
  const savedState = getSavedWorkspaceState();
  const launchDir = getLaunchDir();
  const initialOpts = savedState
    ? { initialWorkspaces: savedState.workspaces, initialActiveIndex: savedState.activeIndex }
    : launchDir
      ? { cwd: launchDir }
      : undefined;

  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    activeWorkspace,
    addWorkspace,
    reorderWorkspaces,
    splitPane,
    focusPane,
    setPaneDivider,
    movePanel,
    reorderPanel,
    splitPaneAndPlace,
    openPanel,
    activatePanel,
    closePanel,
    updatePanelData,
    setTerminalPanelCwd,
    setTerminalRunningCommand,
    findPanelGlobal,
    resetWorkspaces,
  } = useWorkspaces(initialOpts);

  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;

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
  const activeCwd = isTerminalPanel ? ((activePanel as { cwd?: string }).cwd ?? null) : null;

  // ── Handle maps ───────────────────────────────────────────────────────────

  const searchAddons = useRef<Map<string, SearchAddon>>(new Map());
  const [activeSearchAddon, setActiveSearchAddon] = useState<SearchAddon | null>(null);
  const searchInlineRef = useRef<SearchInlineHandle | null>(null);
  const terminalHandles = useRef<Map<string, TerminalPaneHandle>>(new Map());
  const editorHandles = useRef<Map<string, EditorPaneHandle>>(new Map());
  const previewHandles = useRef<Map<string, PreviewPaneHandle>>(new Map());
  const [activeEditorHandle, setActiveEditorHandle] = useState<EditorPaneHandle | null>(null);
  const [gitHistoryHandle, setGitHistoryHandle] = useState<GitHistorySearchHandle | null>(null);
  const pendingGotoLine = useRef<Map<string, number>>(new Map());

  const { zoomIn, zoomOut, zoomReset } = useZoom();
  useTerminalFileDrop();

  // ── Workspace state persistence ───────────────────────────────────────────

  useEffect(() => {
    const activeIdx = workspaces.findIndex((w) => w.id === activeWorkspaceId);
    saveWorkspaceState(workspaces, activeIdx);
  }, [workspaces, activeWorkspaceId]);

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
        if (!focused) return;
        const ws = workspacesRef.current.find((w) => w.id === activeWorkspaceId);
        if (!ws) return;
        const pane = findPane(ws.paneTree, ws.activePaneId);
        if (!pane?.activePanelId) return;
        requestAnimationFrame(() => {
          terminalHandles.current.get(pane.activePanelId!)?.focus();
        });
      })
      .then((u) => { unlisten = u; })
      .catch(() => {});
    return () => unlisten?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  const init = usePreferencesStore((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);

  const rightPanelRef = useRef<RightPanelHandle>(null);
  const rightPanelOpen = usePreferencesStore((s) => s.rightPanelOpen);
  const rightPanelSide = usePreferencesStore((s) => s.rightPanelSide);

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
      }
    }
    livePanelIdsRef.current = live;
    for (const k of [...editorHandles.current.keys()]) {
      const found = findPanelGlobal(k);
      if (!found) editorHandles.current.delete(k);
    }
    for (const k of [...previewHandles.current.keys()]) {
      const found = findPanelGlobal(k);
      if (!found) previewHandles.current.delete(k);
    }
  }, [workspaces, findPanelGlobal]);

  // Update active search addon / editor handle when active panel changes
  useEffect(() => {
    setActiveSearchAddon(
      activePanelId !== null ? (searchAddons.current.get(activePanelId) ?? null) : null,
    );
    setActiveEditorHandle(
      activePanelId !== null ? (editorHandles.current.get(activePanelId) ?? null) : null,
    );
  }, [activePanelId]);

  // ── Workspace state management ────────────────────────────────────────────

  const clearWorkspaceState = useCallback(() => {
    for (const id of livePanelIdsRef.current) disposeSession(id);
    searchAddons.current.clear();
    terminalHandles.current.clear();
    editorHandles.current.clear();
    previewHandles.current.clear();
    setActiveSearchAddon(null);
    setActiveEditorHandle(null);
  }, []);

  const workspaceEnv = useWorkspaceEnvStore((s) => s.env);
  const setWorkspaceEnv = useWorkspaceEnvStore((s) => s.setEnv);
  const { home, launchCwd, launchCwdResolved, switchWorkspace } =
    useWorkspaceSwitcher({
      workspacesRef,
      workspaceEnv,
      setWorkspaceEnv,
      resetToHome: (home) => { clearWorkspaceState(); resetWorkspaces(home); },
      clearWorkspaceState,
    });

  // ── Last known terminal cwd for explorer root / new workspace inheritance ──

  const lastTerminalCwdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeCwd) lastTerminalCwdRef.current = activeCwd;
  }, [activeCwd]);

  const explorerRoot = useMemo<string | null>(() => {
    if (activeCwd) return activeCwd;
    if (lastTerminalCwdRef.current) return lastTerminalCwdRef.current;
    for (const ws of workspaces) {
      for (const pane of allPanes(ws.paneTree)) {
        for (const panel of pane.panels) {
          if (panel.kind === "terminal" && panel.cwd) return panel.cwd;
        }
      }
    }
    return home;
  }, [activeCwd, workspaces, home]);

  const inheritedCwd = useCallback((): string | undefined => {
    return activeCwd ?? lastTerminalCwdRef.current ?? home ?? undefined;
  }, [activeCwd, home]);

  // ── Window title ──────────────────────────────────────────────────────────

  useEffect(() => {
    const project = explorerRoot ? basename(explorerRoot) : "";
    const label = activePanel ? (activeCwd ? basename(activeCwd) : panelTitle(activePanel)) : "";
    let title: string;
    if (project && label && label !== project) title = `${project} — ${label}`;
    else title = project || label || "Terax";
    document.title = title;
    void getCurrentWindow().setTitle(title).catch(() => {});
  }, [explorerRoot, activeCwd, activePanel]);

  // ── Dialogs ───────────────────────────────────────────────────────────────

  const [newEditorOpen, setNewEditorOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paletteInitialMode, setPaletteInitialMode] = useState<"commands" | "content">("commands");
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
      // Check if already open; activate it
      for (const pane of allPanes(activeWorkspace.paneTree)) {
        const existing = pane.panels.find(
          (p) => p.kind === "editor" && (p as { path: string }).path === path,
        );
        if (existing) {
          activatePanel(activeWorkspace.id, existing.id);
          return existing.id;
        }
      }
      const panelId = crypto.randomUUID();
      openPanel(activeWorkspace.id, activeWorkspace.activePaneId, {
        id: panelId,
        kind: "editor",
        path,
        dirty: false,
        preview: !(pin ?? false),
      });
      return panelId;
    },
    [activeWorkspace, activatePanel, openPanel],
  );

  const openGitDiffInPanel = useCallback(
    (params: { repoRoot: string; path: string; mode: "-" | "+"; originalPath: string | null }) => {
      if (!activeWorkspace) return;
      openPanel(activeWorkspace.id, activeWorkspace.activePaneId, {
        id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
        kind: "git-history",
        repoRoot: args.repoRoot,
      });
    },
    [activeWorkspace, openPanel],
  );

  const openPreviewInPanel = useCallback(
    (url: string) => {
      if (!activeWorkspace) return undefined;
      const panelId = crypto.randomUUID();
      openPanel(activeWorkspace.id, activeWorkspace.activePaneId, {
        id: panelId,
        kind: "preview",
        url,
      });
      if (!url) {
        setTimeout(() => previewHandles.current.get(panelId)?.focusAddressBar(), 0);
      }
      return panelId;
    },
    [activeWorkspace, openPanel],
  );

  const openMarkdownInPanel = useCallback(
    (path: string) => {
      if (!activeWorkspace) return;
      openPanel(activeWorkspace.id, activeWorkspace.activePaneId, {
        id: crypto.randomUUID(),
        kind: "markdown",
        path,
      });
    },
    [activeWorkspace, openPanel],
  );

  // ── PanelCallbacks ────────────────────────────────────────────────────────

  const authorizedCwds = useRef(new Set<string>());

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
          if (cwd && !authorizedCwds.current.has(cwd)) {
            authorizedCwds.current.add(cwd);
            native.workspaceAuthorize(cwd).catch(() => {
              authorizedCwds.current.delete(cwd);
            });
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
            p.kind === "editor" ? { ...p, dirty } : p,
          );
      },
      onEditorClose: (panelId) => {
        const found = findPanelGlobal(panelId);
        if (found) closePanel(found.workspace.id, panelId);
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
      onPreviewUrlChange: (panelId, url) => {
        const found = findPanelGlobal(panelId);
        if (found)
          updatePanelData(found.workspace.id, panelId, (p) =>
            p.kind === "preview" ? { ...p, url } : p,
          );
      },
      registerPreviewHandle: (panelId, h) => {
        if (h) previewHandles.current.set(panelId, h);
        else previewHandles.current.delete(panelId);
      },
      onOpenCommitFile: (input) => {
        if (!activeWorkspace) return;
        openPanel(activeWorkspace.id, activeWorkspace.activePaneId, {
          id: crypto.randomUUID(),
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
    }),
    [
      activePanelId,
      findPanelGlobal,
      closePanel,
      setTerminalPanelCwd,
      setTerminalRunningCommand,
      updatePanelData,
      activeWorkspace,
      openPanel,
    ],
  );

  // ── Close guards ──────────────────────────────────────────────────────────

  const {
    pendingClosePanel,
    pendingTerminalClosePanel,
    pendingDeletePanels,
    handleClose: handleCloseGuard,
    confirmClose,
    cancelClose,
    confirmTerminalClose,
    cancelTerminalClose,
    confirmDeleteClose,
    cancelDeleteClose,
    handlePathDeleted,
  } = useTabCloseGuards({
    workspaces,
    disposePanel: (workspaceId, panelId) => closePanel(workspaceId, panelId),
    findPanel: findPanelGlobal,
  });

  // ── Path rename ───────────────────────────────────────────────────────────

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
                p.kind === "editor" ? { ...p, path: to, title: i === -1 ? to : to.slice(i + 1) } : p,
              );
            } else if (ep.path.startsWith(`${from}/`)) {
              const newPath = `${to}${ep.path.slice(from.length)}`;
              const i = newPath.lastIndexOf("/");
              updatePanelData(ws.id, panel.id, (p) =>
                p.kind === "editor" ? { ...p, path: newPath, title: i === -1 ? newPath : newPath.slice(i + 1) } : p,
              );
            }
          }
        }
      }
    },
    [updatePanelData],
  );

  // ── useEditorFileSync (editor panel shim) ─────────────────────────────────

  type EditorShim = { kind: "editor"; id: string; path: string; dirty: boolean; preview: boolean };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const editorPanels = useMemo<EditorShim[]>(() => {
    const acc: EditorShim[] = [];
    for (const ws of workspaces) {
      for (const pane of allPanes(ws.paneTree)) {
        for (const panel of pane.panels) {
          if (panel.kind === "editor") {
            const ep = panel as EditorShim;
            acc.push({ kind: "editor", id: ep.id, path: ep.path, dirty: ep.dirty, preview: ep.preview });
          }
        }
      }
    }
    return acc;
  }, [workspaces]);
  const editorPanelsRef = useRef(editorPanels);
  editorPanelsRef.current = editorPanels;

  useEditorFileSync({ tabs: editorPanels, tabsRef: editorPanelsRef, editorRefs: editorHandles });

  // ── useThemeFileEditing ───────────────────────────────────────────────────

  useThemeFileEditing({ tabsRef: editorPanelsRef, openFileTab: (path) => openFileInPanel(path, true) });

  // ── Source control ────────────────────────────────────────────────────────

  const activeFilePath = (() => {
    if (activePanel?.kind === "editor") return (activePanel as { path: string }).path;
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
      launchCwd,
      launchCwdResolved,
      home,
      sidebarView: "source-control",
      cycleSidebarView: toggleRightPanel,
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

  const cdInNewWorkspace = useCallback(
    (path: string) => {
      const wsId = addWorkspace(path);
      setTimeout(() => {
        const ws = workspacesRef.current.find((w) => w.id === wsId);
        if (!ws) return;
        const pane = allPanes(ws.paneTree)[0];
        if (!pane) return;
        const panel = pane.activePanelId
          ? pane.panels.find((p) => p.id === pane.activePanelId)
          : pane.panels[0];
        if (!panel) return;
        const t = terminalHandles.current.get(panel.id);
        if (!t) return;
        t.write(`cd ${quoteShellArg(path)}\r`);
        t.focus();
      }, 80);
    },
    [addWorkspace],
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

  // ── Shortcuts ─────────────────────────────────────────────────────────────

  const [zenMode, setZenMode] = useState(false);

  const handleCloseActivePanel = useCallback(() => {
    if (!activeWorkspace || !activePanelId) return;
    void handleCloseGuard(activeWorkspace.id, activePanelId);
  }, [activeWorkspace, activePanelId, handleCloseGuard]);

  const cycleWorkspace = useCallback(
    (delta: 1 | -1) => {
      if (workspaces.length < 2) return;
      const idx = workspaces.findIndex((w) => w.id === activeWorkspaceId);
      const nextIdx = (idx + delta + workspaces.length) % workspaces.length;
      setActiveWorkspaceId(workspaces[nextIdx].id);
    },
    [workspaces, activeWorkspaceId, setActiveWorkspaceId],
  );

  const shortcutHandlers = useMemo<ShortcutHandlers>(
    () => ({
      "commandPalette.open": () => openCommandPalette("commands"),
      "commandPalette.content": () => openCommandPalette("content"),
      "tab.new": () => {
        if (!activeWorkspace) return;
        openPanel(activeWorkspace.id, activeWorkspace.activePaneId, {
          id: crypto.randomUUID(),
          kind: "terminal",
          cwd: activeWorkspace.cwd,
        });
      },
      "workspace.new": () => addWorkspace(inheritedCwd()),
      "tab.newPreview": () => openPreviewInPanel(""),
      "tab.newEditor": () => setNewEditorOpen(true),
      "tab.close": handleCloseActivePanel,
      "tab.next": () => cycleWorkspace(1),
      "tab.prev": () => cycleWorkspace(-1),
      "tab.selectByIndex": (e) => {
        const idx = parseInt(e.key, 10) - 1;
        if (idx >= 0 && idx < workspaces.length) setActiveWorkspaceId(workspaces[idx].id);
      },
      "pane.splitRight": () => {
        if (!activeWorkspace) return;
        const { paneSplitLimit, workspacePaneLimit } = usePreferencesStore.getState();
        if (allPanes(activeWorkspace.paneTree).length >= workspacePaneLimit) return;
        const el = document.querySelector<HTMLElement>(`[data-pane-id="${activeWorkspace.activePaneId}"]`);
        if (!el || el.getBoundingClientRect().width < paneSplitLimit.width) return;
        const newPaneId = splitPane(activeWorkspace.id, activeWorkspace.activePaneId, "horizontal");
        openPanel(activeWorkspace.id, newPaneId, { id: crypto.randomUUID(), kind: "terminal", cwd: activeWorkspace.cwd });
      },
      "pane.splitDown": () => {
        if (!activeWorkspace) return;
        const { paneSplitLimit, workspacePaneLimit } = usePreferencesStore.getState();
        if (allPanes(activeWorkspace.paneTree).length >= workspacePaneLimit) return;
        const el = document.querySelector<HTMLElement>(`[data-pane-id="${activeWorkspace.activePaneId}"]`);
        if (!el || el.getBoundingClientRect().height < paneSplitLimit.height) return;
        const newPaneId = splitPane(activeWorkspace.id, activeWorkspace.activePaneId, "vertical");
        openPanel(activeWorkspace.id, newPaneId, { id: crypto.randomUUID(), kind: "terminal", cwd: activeWorkspace.cwd });
      },
      "pane.focusNext": () => {
        if (!activeWorkspace) return;
        const ids = allPaneIds(activeWorkspace.paneTree);
        const idx = ids.indexOf(activeWorkspace.activePaneId);
        const next = ids[(idx + 1) % ids.length];
        if (next) focusPane(activeWorkspace.id, next);
      },
      "pane.focusPrev": () => {
        if (!activeWorkspace) return;
        const ids = allPaneIds(activeWorkspace.paneTree);
        const idx = ids.indexOf(activeWorkspace.activePaneId);
        const prev = ids[(idx - 1 + ids.length) % ids.length];
        if (prev) focusPane(activeWorkspace.id, prev);
      },
      "pane.source": toggleSourceControl,
      "terminal.clear": () => { clearFocusedTerminal(); },
      "terminal.toggleInput": () =>
        window.dispatchEvent(new CustomEvent(TOGGLE_BLOCK_INPUT_EVENT)),
      "search.focus": () => searchInlineRef.current?.focus(),
      "settings.open": () => void openSettingsWindow(),
      "rightPanel.toggle": () => {
        void setRightPanelOpen(!usePreferencesStore.getState().rightPanelOpen);
      },
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
    }),
    [
      activeWorkspace,
      activeWorkspaceId,
      activePanelId,
      workspaces,
      openCommandPalette,
      cycleWorkspace,
      handleCloseActivePanel,
      inheritedCwd,
      addWorkspace,
      openPanel,
      openPreviewInPanel,
      splitPane,
      focusPane,
      toggleSourceControl,
      setActiveWorkspaceId,
      zoomIn,
      zoomOut,
      zoomReset,
    ],
  );

  const shortcutsDisabled = useCallback(
    (id: ShortcutId, e: KeyboardEvent) => {
      if (id === "editor.undo" || id === "editor.redo") {
        return activePanel?.kind !== "editor";
      }
      if (id === "terminal.clear") {
        const target = (e.target as HTMLElement | null) ?? document.activeElement;
        return !(target as HTMLElement | null)?.closest?.(".xterm");
      }
      if (id === "terminal.toggleInput") {
        return activePanel?.kind !== "terminal";
      }
      if (id === "rightPanel.toggle") {
        const target = (e.target as HTMLElement | null) ?? document.activeElement;
        const inTerminal = !!(target as HTMLElement | null)?.closest?.(".xterm");
        return inTerminal && !e.shiftKey;
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
    },
    [setActiveWorkspaceId, activatePanel],
  );

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
              if (!activeWorkspace) return;
              openPanel(activeWorkspace.id, activeWorkspace.activePaneId, {
                id: crypto.randomUUID(),
                kind: "terminal",
                cwd: activeWorkspace.cwd,
              });
            },
            openNewWorkspace: () => addWorkspace(inheritedCwd()),
            openNewBlock: () => addWorkspace(inheritedCwd()),
            openNewEditor: () => setNewEditorOpen(true),
            openNewPreview: () => openPreviewInPanel(""),
            openGitGraph: openGitGraphFromContext,
            toggleSourceControl,
            closeActiveTabOrPane: handleCloseActivePanel,
            splitPaneRight: () => {
              if (!activeWorkspace) return;
              const { paneSplitLimit, workspacePaneLimit } = usePreferencesStore.getState();
              if (allPanes(activeWorkspace.paneTree).length >= workspacePaneLimit) return;
              const el = document.querySelector<HTMLElement>(`[data-pane-id="${activeWorkspace.activePaneId}"]`);
              if (!el || el.getBoundingClientRect().width < paneSplitLimit.width) return;
              const newPaneId = splitPane(activeWorkspace.id, activeWorkspace.activePaneId, "horizontal");
              openPanel(activeWorkspace.id, newPaneId, { id: crypto.randomUUID(), kind: "terminal", cwd: activeWorkspace.cwd });
            },
            splitPaneDown: () => {
              if (!activeWorkspace) return;
              const { paneSplitLimit, workspacePaneLimit } = usePreferencesStore.getState();
              if (allPanes(activeWorkspace.paneTree).length >= workspacePaneLimit) return;
              const el = document.querySelector<HTMLElement>(`[data-pane-id="${activeWorkspace.activePaneId}"]`);
              if (!el || el.getBoundingClientRect().height < paneSplitLimit.height) return;
              const newPaneId = splitPane(activeWorkspace.id, activeWorkspace.activePaneId, "vertical");
              openPanel(activeWorkspace.id, newPaneId, { id: crypto.randomUUID(), kind: "terminal", cwd: activeWorkspace.cwd });
            },
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
      openPanel,
      inheritedCwd,
      openPreviewInPanel,
      openGitGraphFromContext,
      toggleSourceControl,
      handleCloseActivePanel,
      splitPane,
      toggleRightPanel,
    ],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const rightPanelRepoRoot =
    sourceControl.repo?.repoRoot ?? explorerRoot ?? home ?? "";

  const shell = (
    <ThemeProvider>
      <TooltipProvider>
        <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
          {!zenMode && (
            <Header
              onToggleSidebar={toggleRightPanel}
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
              workspaces={workspaces.map((w) => ({ id: w.id, title: w.title, kind: "terminal" }))}
              activeId={activeWorkspaceId}
              onSelect={setActiveWorkspaceId}
              onNew={() => addWorkspace(inheritedCwd())}
              onReorder={reorderWorkspaces}
            />

            {/* CENTER + TOOL PANEL: resizable, side configurable */}
            <ResizablePanelGroup
              orientation="horizontal"
              className="min-h-0 flex-1"
            >
              {/* Tool panel on LEFT when rightPanelSide === "left" */}
              {rightPanelOpen && rightPanelSide === "left" && (
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
                      activeFilePath={explorerActiveFilePath ?? null}
                      onOpenFile={(path, pin) => openFileInPanel(path, pin)}
                      onPathRenamed={handlePathRenamed}
                      onPathDeleted={handlePathDeleted}
                      onRevealInTerminal={cdInNewWorkspace}
                      onOpenMarkdownPreview={openMarkdownInPanel}
                      sourceControl={sourceControl}
                      onOpenDiff={openGitDiffInPanel}
                      onOpenGitGraph={openGitGraphFromContext}
                      repoRoot={rightPanelRepoRoot}
                      onOpenCommitFile={(params) => {
                        if (!activeWorkspace) return;
                        openPanel(activeWorkspace.id, activeWorkspace.activePaneId, {
                          id: crypto.randomUUID(),
                          kind: "git-commit-file",
                          repoRoot: params.repoRoot,
                          sha: params.sha,
                          path: params.path,
                          originalPath: params.originalPath,
                        });
                      }}
                      onSearchHandle={setGitHistoryHandle}
                    />
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                </>
              )}

              <ResizablePanel id="center" minSize="30%">
                <div className="zoom-content flex h-full min-h-0 flex-col">
                  <div className="relative min-h-0 flex-1">
                    <WorkspaceView
                      workspaces={workspaces}
                      activeWorkspaceId={activeWorkspaceId}
                      onActivatePanel={(wsId, panelId) => activatePanel(wsId, panelId)}
                      onClosePanel={(wsId, panelId) => {
                        const found = findPanelGlobal(panelId);
                        if (found?.panel.kind === "terminal") disposeSession(panelId);
                        closePanel(wsId, panelId);
                      }}
                      onFocusPane={(wsId, paneId) => focusPane(wsId, paneId)}
                      onNewTerminal={(wsId, paneId) => {
                        const ws = workspaces.find((w) => w.id === wsId);
                        openPanel(wsId, paneId, {
                          id: crypto.randomUUID(),
                          kind: "terminal",
                          cwd: ws?.cwd,
                        });
                      }}
                      onDividerChange={(wsId, splitId, pos) => setPaneDivider(wsId, splitId, pos)}
                      onMovePanel={movePanel}
                      onReorderPanel={reorderPanel}
                      onSplitPaneAndPlace={splitPaneAndPlace}
                      callbacks={panelCallbacks}
                    />
                  </div>

                  <WorkspaceInputBar
                    isBlockTab={false}
                    activeLeafId={activePanelId}
                  />
                </div>
              </ResizablePanel>

              {/* Tool panel on RIGHT when rightPanelSide === "right" (default) */}
              {rightPanelOpen && rightPanelSide === "right" && (
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
                      activeFilePath={explorerActiveFilePath ?? null}
                      onOpenFile={(path, pin) => openFileInPanel(path, pin)}
                      onPathRenamed={handlePathRenamed}
                      onPathDeleted={handlePathDeleted}
                      onRevealInTerminal={cdInNewWorkspace}
                      onOpenMarkdownPreview={openMarkdownInPanel}
                      sourceControl={sourceControl}
                      onOpenDiff={openGitDiffInPanel}
                      onOpenGitGraph={openGitGraphFromContext}
                      repoRoot={rightPanelRepoRoot}
                      onOpenCommitFile={(params) => {
                        if (!activeWorkspace) return;
                        openPanel(activeWorkspace.id, activeWorkspace.activePaneId, {
                          id: crypto.randomUUID(),
                          kind: "git-commit-file",
                          repoRoot: params.repoRoot,
                          sha: params.sha,
                          path: params.path,
                          originalPath: params.originalPath,
                        });
                      }}
                      onSearchHandle={setGitHistoryHandle}
                    />
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
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
            onCreated={(path) => openFileInPanel(path)}
          />

          <UpdaterDialog />

          <CloseDialogs
            pendingClosePanel={pendingClosePanel}
            onCancelClose={cancelClose}
            onConfirmClose={confirmClose}
            pendingTerminalClosePanel={pendingTerminalClosePanel}
            onCancelTerminalClose={cancelTerminalClose}
            onConfirmTerminalClose={confirmTerminalClose}
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
