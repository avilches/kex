import { useSyncExternalStore } from "react";

let held = false;
const listeners = new Set<() => void>();

function set(next: boolean): void {
  if (held === next) return;
  held = next;
  for (const l of listeners) l();
}

const onKey = (e: KeyboardEvent) => set(e.altKey);
const onBlur = () => set(false);

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
      held = false;
    }
  };
}

export function useAltHeld(): boolean {
  return useSyncExternalStore(subscribe, () => held, () => false);
}
