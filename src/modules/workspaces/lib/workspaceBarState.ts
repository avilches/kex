import { invoke } from "@tauri-apps/api/core";

export const DEFAULT_WORKSPACE_BAR_WIDTH = 52;
const BAR_WIDTH_MIN = 52;
const BAR_WIDTH_MAX = 220;

function clamp(v: number): number {
  return Math.min(BAR_WIDTH_MAX, Math.max(BAR_WIDTH_MIN, v));
}

let cached = DEFAULT_WORKSPACE_BAR_WIDTH;

export function setSavedWorkspaceBarWidth(raw: unknown): void {
  cached =
    typeof raw === "number" && Number.isFinite(raw)
      ? clamp(raw)
      : DEFAULT_WORKSPACE_BAR_WIDTH;
}

export function getSavedWorkspaceBarWidth(): number {
  return cached;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { label: string; width: number } | null = null;

// Debounced so a drag-resize does not write on every pixel; the last value wins.
export function saveWorkspaceBarWidth(label: string, width: number): void {
  pending = { label, width: Math.round(clamp(width)) };
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const p = pending;
    pending = null;
    if (!p) return;
    void invoke("window_save_workspace_bar", {
      label: p.label,
      width: p.width,
    }).catch((err) =>
      console.error("[workspace-bar-state] save error:", err),
    );
  }, 250);
}
