import { LazyStore } from "@tauri-apps/plugin-store";
import type { Panel, SplitNode, Workspace } from "./types";

const STORE_PATH = "workspace-state.json";
const store = new LazyStore(STORE_PATH, { defaults: {}, autoSave: false });

type SavedState = { workspaces: Workspace[]; activeIndex: number };

let cached: SavedState | null = null;

function sanitizePanel(p: Panel): Panel {
  if (p.kind === "editor") return { ...p, dirty: false };
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
    const saved = await store.get<SavedState>("state");
    if (saved && Array.isArray(saved.workspaces) && saved.workspaces.length > 0) {
      cached = saved;
    }
  } catch {
    cached = null;
  }
}

export function getSavedWorkspaceState(): SavedState | null {
  return cached;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function saveWorkspaceState(
  workspaces: Workspace[],
  activeIndex: number,
): void {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const state: SavedState = {
      workspaces: workspaces.map(sanitizeWorkspace),
      activeIndex: Math.max(0, Math.min(activeIndex, workspaces.length - 1)),
    };
    void store.set("state", state).then(() => store.save()).catch(() => {});
  }, 800);
}
