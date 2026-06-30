import { invoke } from "@tauri-apps/api/core";

// Sidebar chrome is per-window state (not per-workspace, not a global
// preference): which view is shown, whether it is open, its width, and which
// side it docks to. Persisted in the window index (workspaces.json) via a
// dedicated lightweight command, separate from the heavy workspace-body save.

export type SidebarView = "explorer" | "git" | "history";
export type SidebarSide = "left" | "right";

export type SidebarUiState = {
  open: boolean;
  view: SidebarView;
  side: SidebarSide;
  width: number;
};

export const DEFAULT_SIDEBAR_STATE: SidebarUiState = {
  open: true,
  view: "explorer",
  side: "left",
  width: 20,
};

const SIDEBAR_WIDTH_MIN = 12;
const SIDEBAR_WIDTH_MAX = 70;

function clampWidth(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, v));
  }
  return DEFAULT_SIDEBAR_STATE.width;
}

function parseView(value: unknown): SidebarView {
  return value === "git" || value === "history" ? value : "explorer";
}

function parseSide(value: unknown): SidebarSide {
  return value === "right" ? "right" : "left";
}

export function sanitizeSidebarState(
  raw: Partial<SidebarUiState> | null | undefined,
): SidebarUiState {
  if (!raw) return { ...DEFAULT_SIDEBAR_STATE };
  return {
    open:
      typeof raw.open === "boolean"
        ? raw.open
        : DEFAULT_SIDEBAR_STATE.open,
    view: parseView(raw.view),
    side: parseSide(raw.side),
    width: clampWidth(raw.width),
  };
}

// Seeded once during initWorkspaceState() from the same window_get_state call
// that loads the workspaces, so no extra IPC roundtrip at boot.
let cached: SidebarUiState = { ...DEFAULT_SIDEBAR_STATE };

export function setSavedSidebarState(
  raw: Partial<SidebarUiState> | null | undefined,
): void {
  cached = sanitizeSidebarState(raw);
}

export function getSavedSidebarState(): SidebarUiState {
  return { ...cached };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { label: string; state: SidebarUiState } | null = null;

// Debounced so a drag-resize does not write on every pixel; the last value wins.
export function saveSidebarState(
  label: string,
  state: SidebarUiState,
): void {
  pending = { label, state };
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const p = pending;
    pending = null;
    if (!p) return;
    void invoke("window_save_sidebar", {
      label: p.label,
      open: p.state.open,
      view: p.state.view,
      side: p.state.side,
      width: Math.round(p.state.width),
    }).catch((err) =>
      console.error("[sidebar-state] save error:", err),
    );
  }, 250);
}
