import { invoke } from "@tauri-apps/api/core";

export const DEFAULT_WORKSPACE_SIDEBAR_WIDTH = 52;
const SIDEBAR_WIDTH_MIN = 52;
const SIDEBAR_WIDTH_MAX = 220;

function clamp(v: number): number {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, v));
}

let cached = DEFAULT_WORKSPACE_SIDEBAR_WIDTH;

export function setSavedWorkspaceSidebarWidth(raw: unknown): void {
  cached =
    typeof raw === "number" && Number.isFinite(raw)
      ? clamp(raw)
      : DEFAULT_WORKSPACE_SIDEBAR_WIDTH;
}

export function getSavedWorkspaceSidebarWidth(): number {
  return cached;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { label: string; width: number } | null = null;

// Debounced so a drag-resize does not write on every pixel; the last value wins.
export function saveWorkspaceSidebarWidth(label: string, width: number): void {
  pending = { label, width: Math.round(clamp(width)) };
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const p = pending;
    pending = null;
    if (!p) return;
    void invoke("window_save_workspace_sidebar", {
      label: p.label,
      width: p.width,
    }).catch((err) =>
      console.error("[workspace-sidebar-state] save error:", err),
    );
  }, 250);
}
