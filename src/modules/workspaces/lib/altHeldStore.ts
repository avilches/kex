import { useSyncExternalStore } from "react";

export const ALT_HOLD_DELAY_MS = 1200;

let held = false;
let suppressed = false;
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

// Alt counts as held only after ALT_HOLD_DELAY_MS, and any other key pressed meanwhile (a hotkey) cancels it
// until Alt is released, so a hotkey with Alt never flashes the paths.
const onKeyDown = (e: KeyboardEvent) => {
  if (!e.altKey) return;
  if (e.key !== "Alt" || e.metaKey || e.ctrlKey || e.shiftKey) {
    suppressed = true;
    cancelTimer();
    set(false);
    return;
  }
  if (suppressed || held || timer !== null) return;
  timer = setTimeout(() => {
    timer = null;
    set(true);
  }, ALT_HOLD_DELAY_MS);
};

const onKeyUp = (e: KeyboardEvent) => {
  if (e.altKey) return;
  suppressed = false;
  cancelTimer();
  set(false);
};

const onBlur = () => {
  suppressed = false;
  cancelTimer();
  set(false);
};

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      cancelTimer();
      suppressed = false;
      held = false;
    }
  };
}

export function useAltHeld(): boolean {
  return useSyncExternalStore(subscribe, () => held, () => false);
}
