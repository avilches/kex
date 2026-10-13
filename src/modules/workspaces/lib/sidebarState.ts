import { debouncedInvoke } from "./debouncedInvoke";

// Sidebar chrome that is per-window (not per-workspace, not a global
// preference): whether it is open, its width, and which side it docks to. The
// active view is per workspace (Workspace.sidebar.view). Persisted in the
// window index (workspaces.json) via a dedicated lightweight command, separate
// from the heavy workspace-body save.

export type SidebarView = "explorer" | "git" | "history" | "notes";
export type SidebarSide = "left" | "right";

export type SidebarUiState = {
  open: boolean;
  side: SidebarSide;
  width: number;
};

export const DEFAULT_SIDEBAR_STATE: SidebarUiState = {
  open: true,
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

export function parseView(value: unknown): SidebarView {
  return value === "git" || value === "history" || value === "notes"
    ? value
    : "explorer";
}

// The Notes view only exists with a workspace root; a stored "notes" on a
// workspace whose root was cleared shows Explorer instead.
export function effectiveSidebarView(view: SidebarView, notesRoot: string | null): SidebarView {
  return view === "notes" && !notesRoot ? "explorer" : view;
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

const sidebarSave = debouncedInvoke<{ label: string; state: SidebarUiState }>({
  command: "window_save_sidebar",
  delayMs: 250,
  buildArgs: ({ label, state }) => ({
    label,
    open: state.open,
    side: state.side,
    width: Math.round(state.width),
  }),
  errorTag: "sidebar-state",
});

// Debounced so a drag-resize does not write on every pixel; the last value wins.
export function saveSidebarState(
  label: string,
  state: SidebarUiState,
): void {
  sidebarSave.schedule({ label, state });
}
