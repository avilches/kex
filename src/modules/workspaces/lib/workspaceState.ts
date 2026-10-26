import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { normalizeActions } from "@/modules/actions";
import { debouncedInvoke } from "./debouncedInvoke";
import type { Tab, SplitNode, Workspace } from "./types";
import { sanitizeWorkspaceSidebar } from "./sidebarSnapshot";
import {
  setSavedSidebarState,
  type SidebarUiState,
} from "./sidebarState";
import { setSavedWorkspaceBarWidth } from "./workspaceBarState";
import { setSavedCollapsedGroups } from "./collapsedGroupsState";
import { setSavedGroups } from "./workspaceGroupsState";
import type { WorkspaceGroup } from "./types";

type SavedState = { workspaces: Workspace[]; activeIndex: number };

// WindowEntry mirrors the Rust WindowEntry struct (camelCase via serde rename_all).
type WindowEntry = {
  workspaces: Workspace[];
  activeIndex: number;
  sidebar?: SidebarUiState;
  workspaceBarWidth?: number;
  collapsedGroups?: string[];
  groups?: WorkspaceGroup[];
};

let cached: SavedState | null = null;

export function sanitizeTab(p: Tab): Tab {
  if (p.kind === "editor") return { ...p, dirty: false };
  return p;
}

function sanitizeTree(node: SplitNode): SplitNode {
  if (node.kind === "pane") {
    return { ...node, tabs: node.tabs.map(sanitizeTab) };
  }
  return { ...node, first: sanitizeTree(node.first), second: sanitizeTree(node.second) };
}

function sanitizeActions(w: Workspace): Pick<Workspace, "actions" | "activeAction"> {
  if (w.actions === undefined) return {};
  const actions = normalizeActions(w.actions);
  const active = actions.some((a) => a.id === w.activeAction) ? w.activeAction : undefined;
  return { actions, activeAction: active };
}

// `scripts` and `activeScript` belong to the former Script model: a saved workspace may still
// carry them, and they are dropped here so they are neither kept in memory nor written back.
const OLD_SCRIPT_FIELDS = ["scripts", "activeScript"] as const;

export function sanitizeWorkspace(w: Workspace): Workspace {
  const { actions: _actions, activeAction: _activeAction, ...rest } = w;
  for (const field of OLD_SCRIPT_FIELDS) delete (rest as Record<string, unknown>)[field];
  return {
    ...rest,
    ...sanitizeActions(w),
    showHidden: w.showHidden,
    sidebar: sanitizeWorkspaceSidebar(w.sidebar),
    paneTree: sanitizeTree(w.paneTree),
  };
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
      const sanitized = entry.workspaces.map(sanitizeWorkspace);
      cached = {
        workspaces: sanitized,
        activeIndex: entry.activeIndex,
      };
    }
    setSavedSidebarState(entry?.sidebar);
    setSavedWorkspaceBarWidth(entry?.workspaceBarWidth);
    setSavedCollapsedGroups(entry?.collapsedGroups);
    setSavedGroups(entry?.groups);
  } catch (err) {
    console.error("[workspace-state] initWorkspaceState error:", err);
    cached = null;
  }
}

export function getSavedWorkspaceState(): SavedState | null {
  return cached;
}

type PendingWorkspaceState = { workspaces: Workspace[]; activeIndex: number };

const workspaceStateSave = debouncedInvoke<PendingWorkspaceState>({
  command: "window_save_workspace_state",
  delayMs: 800,
  buildArgs: ({ workspaces, activeIndex }) => {
    const label = getCurrentWebviewWindow().label;
    if (import.meta.env.DEV) console.debug(`[workspace-state] saving ${workspaces.length} workspace(s) for window "${label}", activeIndex=${activeIndex}`);
    return {
      label,
      workspaces: workspaces.map(sanitizeWorkspace),
      activeIndex: Math.max(0, Math.min(activeIndex, workspaces.length - 1)),
    };
  },
  errorTag: "workspace-state",
});

export function saveWorkspaceState(workspaces: Workspace[], activeIndex: number): void {
  workspaceStateSave.schedule({ workspaces, activeIndex });
}

// Claimed once by whichever close path runs first (window X button or last-workspace-removed
// effect). Prevents double flush + double destroy when both fire in the same event loop.
let closeClaimed = false;
export function claimClose(): boolean {
  if (closeClaimed) return false;
  closeClaimed = true;
  return true;
}

// Called on window close - cancels the debounce and saves immediately so
// pending workspace changes are not lost when the window closes.
export async function flushWorkspaceState(): Promise<void> {
  await workspaceStateSave.flush();
}
