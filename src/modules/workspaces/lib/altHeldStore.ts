import { useSyncExternalStore } from "react";

export const ALT_HOLD_DELAY_MS = 1200;

let held = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function cancelTimer(): void {
  if (timer === null) return;
  clearTimeout(timer);
  timer = null;
}

function set(next: boolean): void {
  if (held === next) return;
  held = next;
  for (const l of listeners) l();
}

// Alt only counts as held after ALT_HOLD_DELAY_MS, so a quick Alt tap or Alt+key shortcut never flashes the paths.
const onKey = (e: KeyboardEvent) => {
  if (!e.altKey) {
    cancelTimer();
    set(false);
    return;
  }
  if (held || timer !== null) return;
  timer = setTimeout(() => {
    timer = null;
    set(true);
  }, ALT_HOLD_DELAY_MS);
};
const onBlur = () => {
  cancelTimer();
  set(false);
};

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
      cancelTimer();
      held = false;
    }
  };
}

export function useAltHeld(): boolean {
  return useSyncExternalStore(subscribe, () => held, () => false);
}
