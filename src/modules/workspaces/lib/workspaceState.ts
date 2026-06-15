import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Panel, SplitNode, Workspace } from "./types";

type SavedState = { workspaces: Workspace[]; activeIndex: number };

// WindowEntry mirrors the Rust WindowEntry struct (camelCase via serde rename_all).
type WindowEntry = { workspaces: Workspace[]; activeIndex: number };

let cached: SavedState | null = null;

function sanitizePanel(p: Panel): Panel {
  if (p.kind === "editor") return { ...p, dirty: false };
  if (p.kind === "terminal") return { ...p, runningCommand: undefined };
  return p;
}

function sanitizeTree(node: SplitNode): SplitNode {
  if (node.kind === "pane") {
    return { ...node, panels: node.panels.map(sanitizePanel) };
  }
  return { ...node, first: sanitizeTree(node.first), second: sanitizeTree(node.second) };
}

function sanitizeWorkspace(w: Workspace): Workspace {
  return { ...w, paneTree: sanitizeTree(w.paneTree) };
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
