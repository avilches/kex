import { debouncedInvoke } from "./debouncedInvoke";

export const DEFAULT_WORKSPACE_BAR_WIDTH = 52;
const BAR_WIDTH_MIN = 52;
const BAR_WIDTH_MAX = 440;

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

const barWidthSave = debouncedInvoke<{ label: string; width: number }>({
  command: "window_save_workspace_bar",
  delayMs: 250,
  buildArgs: ({ label, width }) => ({ label, width }),
  errorTag: "workspace-bar-state",
});

// Debounced so a drag-resize does not write on every pixel; the last value wins.
export function saveWorkspaceBarWidth(label: string, width: number): void {
  barWidthSave.schedule({ label, width: Math.round(clamp(width)) });
}
