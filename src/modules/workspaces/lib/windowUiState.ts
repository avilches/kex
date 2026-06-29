import { invoke } from "@tauri-apps/api/core";

// Right-panel chrome is per-window state (not per-workspace, not a global
// preference): which tab is shown, whether it is open, its width, and which
// side it docks to. Persisted in the window index (workspaces.json) via a
// dedicated lightweight command, separate from the heavy workspace-body save.

export type RightPanelTabId = "explorer" | "git" | "history";
export type RightPanelSide = "left" | "right";

export type RightPanelUiState = {
  open: boolean;
  activeTab: RightPanelTabId;
  width: number;
  side: RightPanelSide;
};

// width is a react-resizable-panels percentage; defaults match the panel's
// min/max bounds (12%-70%) and the historical 20% default size.
export const DEFAULT_RIGHT_PANEL_STATE: RightPanelUiState = {
  open: true,
  activeTab: "explorer",
  width: 20,
  side: "left",
};

const RIGHT_PANEL_WIDTH_MIN = 12;
const RIGHT_PANEL_WIDTH_MAX = 70;

function parseActiveTab(value: unknown): RightPanelTabId {
  return value === "git" || value === "history" ? value : "explorer";
}

function parseSide(value: unknown): RightPanelSide {
  return value === "right" ? "right" : "left";
}

function parseWidth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_RIGHT_PANEL_STATE.width;
  }
  return Math.min(RIGHT_PANEL_WIDTH_MAX, Math.max(RIGHT_PANEL_WIDTH_MIN, value));
}

export function sanitizeRightPanelState(
  raw: Partial<RightPanelUiState> | null | undefined,
): RightPanelUiState {
  if (!raw) return { ...DEFAULT_RIGHT_PANEL_STATE };
  return {
    open:
      typeof raw.open === "boolean"
        ? raw.open
        : DEFAULT_RIGHT_PANEL_STATE.open,
    activeTab: parseActiveTab(raw.activeTab),
    width: parseWidth(raw.width),
    side: parseSide(raw.side),
  };
}

// Seeded once during initWorkspaceState() from the same window_get_state call
// that loads the workspaces, so no extra IPC roundtrip at boot.
let cached: RightPanelUiState = { ...DEFAULT_RIGHT_PANEL_STATE };

export function setSavedRightPanelState(
  raw: Partial<RightPanelUiState> | null | undefined,
): void {
  cached = sanitizeRightPanelState(raw);
}

export function getSavedRightPanelState(): RightPanelUiState {
  return { ...cached };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { label: string; state: RightPanelUiState } | null = null;

// Debounced so a drag-resize does not write on every pixel; the last value wins.
export function saveRightPanelState(
  label: string,
  state: RightPanelUiState,
): void {
  pending = { label, state };
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const p = pending;
    pending = null;
    if (!p) return;
    void invoke("window_save_right_panel", {
      label: p.label,
      open: p.state.open,
      activeTab: p.state.activeTab,
      width: Math.round(p.state.width),
      side: p.state.side,
    }).catch((err) =>
      console.error("[window-ui-state] save error:", err),
    );
  }, 250);
}
