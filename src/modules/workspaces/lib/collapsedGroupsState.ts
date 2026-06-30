import { invoke } from "@tauri-apps/api/core";

let cached: string[] = [];

export function setSavedCollapsedGroups(raw: unknown): void {
  cached = Array.isArray(raw) && raw.every((x) => typeof x === "string") ? raw : [];
}

export function getSavedCollapsedGroups(): string[] {
  return cached;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { label: string; ids: string[] } | null = null;

export function saveCollapsedGroups(label: string, ids: string[]): void {
  pending = { label, ids };
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const p = pending;
    pending = null;
    if (!p) return;
    void invoke("window_save_collapsed_groups", {
      label: p.label,
      ids: p.ids,
    }).catch((err) =>
      console.error("[collapsed-groups-state] save error:", err),
    );
  }, 250);
}
