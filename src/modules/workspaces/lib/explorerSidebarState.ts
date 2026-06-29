import { invoke } from "@tauri-apps/api/core";

export const DEFAULT_EXPLORER_SIDEBAR_WIDTH = 20;
const EXPLORER_SIDEBAR_WIDTH_MIN = 12;
const EXPLORER_SIDEBAR_WIDTH_MAX = 70;

function clamp(v: number): number {
  return Math.min(EXPLORER_SIDEBAR_WIDTH_MAX, Math.max(EXPLORER_SIDEBAR_WIDTH_MIN, v));
}

let cached = DEFAULT_EXPLORER_SIDEBAR_WIDTH;

export function setSavedExplorerSidebarWidth(raw: unknown): void {
  cached =
    typeof raw === "number" && Number.isFinite(raw)
      ? clamp(raw)
      : DEFAULT_EXPLORER_SIDEBAR_WIDTH;
}

export function getSavedExplorerSidebarWidth(): number {
  return cached;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { label: string; width: number } | null = null;

export function saveExplorerSidebarWidth(label: string, width: number): void {
  pending = { label, width: Math.round(clamp(width)) };
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const p = pending;
    pending = null;
    if (!p) return;
    void invoke("window_save_explorer_sidebar", {
      label: p.label,
      width: p.width,
    }).catch((err) =>
      console.error("[explorer-sidebar-state] save error:", err),
    );
  }, 250);
}
