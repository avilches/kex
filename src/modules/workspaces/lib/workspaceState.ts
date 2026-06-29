import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { migrateExplorerRootMode } from "./explorerRoot";
import type { Panel, RunConfig, SplitNode, Workspace } from "./types";
import {
  setSavedRightPanelState,
  type RightPanelUiState,
} from "./windowUiState";
import { setSavedWorkspaceSidebarWidth } from "./workspaceSidebarState";

type SavedState = { workspaces: Workspace[]; activeIndex: number };

// WindowEntry mirrors the Rust WindowEntry struct (camelCase via serde rename_all).
type WindowEntry = {
  workspaces: Workspace[];
  activeIndex: number;
  rightPanel?: RightPanelUiState;
  workspaceSidebarWidth?: number;
};

let cached: SavedState | null = null;

export function sanitizePanel(p: Panel): Panel {
  // Migrate the legacy "preview" panel kind (renamed to "browser") so sessions
  // saved before the rename still restore.
  if ((p as { kind: string }).kind === "preview") {
    return { ...(p as object), kind: "browser" } as Panel;
  }
  if (p.kind === "editor") return { ...p, dirty: false };
  return p;
}

function sanitizeTree(node: SplitNode): SplitNode {
  if (node.kind === "pane") {
    return { ...node, panels: node.panels.map(sanitizePanel) };
  }
  return { ...node, first: sanitizeTree(node.first), second: sanitizeTree(node.second) };
}

export function migrateWorkspace(raw: Workspace): Workspace {
  let ws = { ...raw };

  // Migrate legacy "pinned" mode (now called "workspace")
  if ((ws.explorerRootMode as string) === "pinned") {
    ws = { ...ws, explorerRootMode: "workspace" };
  }

  // "workspace" mode requires a pinnedRoot; fall back gracefully if missing
  if (ws.explorerRootMode === "workspace" && !ws.pinnedRoot) {
    if (ws.cwd) {
      ws = { ...ws, pinnedRoot: ws.cwd };
    } else {
      ws = { ...ws, explorerRootMode: "filesystem" };
    }
  }

  // Migrate runConfigs -> scripts, activeRunConfigId -> activeScript
  const withOld = ws as Workspace & { runConfigs?: RunConfig[]; activeRunConfigId?: string };
  const migrated: Workspace = { ...ws };
  if ("runConfigs" in withOld && withOld.runConfigs !== undefined && !withOld.scripts) {
    migrated.scripts = withOld.runConfigs;
    delete (migrated as Record<string, unknown>).runConfigs;
  }
  if ("activeRunConfigId" in withOld && withOld.activeRunConfigId !== undefined && !withOld.activeScript) {
    migrated.activeScript = withOld.activeRunConfigId;
    delete (migrated as Record<string, unknown>).activeRunConfigId;
  }
  return migrated;
}

export function sanitizeWorkspace(w: Workspace): Workspace {
  return migrateWorkspace({
    ...w,
    explorerRootMode: migrateExplorerRootMode(w.explorerRootMode),
    showHidden: w.showHidden,
    paneTree: sanitizeTree(w.paneTree),
  });
}

export async function initWorkspaceState(): Promise<void> {
  try {
    const label = getCurrentWebviewWindow().label;
    if (import.meta.env.DEV) console.debug("[workspace-state] initWorkspaceState: window label =", label);
    const entry = await invoke<WindowEntry | null>("window_get_state", { label });
    if (import.meta.env.DEV) console.debug("[workspace-state] window_get_state response:", entry
      ? `${entry.workspaces.length} workspace(s), activeIndex=${entry.activeIndex}`
      : "null (no saved state)");
    if (entry && Array.isArray(entry.workspaces) && entry.workspaces.length > 0) {
      cached = { workspaces: entry.workspaces.map(sanitizeWorkspace), activeIndex: entry.activeIndex };
    }
    setSavedRightPanelState(entry?.rightPanel);
    setSavedWorkspaceSidebarWidth(entry?.workspaceSidebarWidth);
  } catch (err) {
    console.error("[workspace-state] initWorkspaceState error:", err);
    cached = null;
  }
}

export function getSavedWorkspaceState(): SavedState | null {
  return cached;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

// Last known state — updated immediately on every call so flushWorkspaceState
// can save it synchronously when the window is about to close.
let pendingWorkspaces: Workspace[] | null = null;
let pendingActiveIndex = 0;


export function saveWorkspaceState(workspaces: Workspace[], activeIndex: number): void {
  pendingWorkspaces = workspaces;
  pendingActiveIndex = activeIndex;
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const label = getCurrentWebviewWindow().label;
    if (import.meta.env.DEV) console.debug(`[workspace-state] saving ${workspaces.length} workspace(s) for window "${label}", activeIndex=${activeIndex}`);
    void invoke("window_save_workspace_state", {
      label,
      workspaces: workspaces.map(sanitizeWorkspace),
      activeIndex: Math.max(0, Math.min(activeIndex, workspaces.length - 1)),
    }).catch((err) => console.error("[workspace-state] save error:", err));
  }, 800);
}

// Claimed once by whichever close path runs first (window X button or last-workspace-removed
// effect). Prevents double flush + double destroy when both fire in the same event loop.
let closeClaimed = false;
export function claimClose(): boolean {
  if (closeClaimed) return false;
  closeClaimed = true;
  return true;
}

// Called on window close — cancels the debounce and saves immediately so
// pending workspace changes are not lost when the window closes.
export async function flushWorkspaceState(): Promise<void> {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!pendingWorkspaces) return;
  const label = getCurrentWebviewWindow().label;
  if (import.meta.env.DEV) console.debug(`[workspace-state] flush on close: ${pendingWorkspaces.length} workspace(s) for window "${label}"`);
  await invoke("window_save_workspace_state", {
    label,
    workspaces: pendingWorkspaces.map(sanitizeWorkspace),
    activeIndex: Math.max(0, Math.min(pendingActiveIndex, pendingWorkspaces.length - 1)),
  }).catch((err) => console.error("[workspace-state] flush error:", err));
}
