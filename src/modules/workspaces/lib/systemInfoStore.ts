import { homeDir } from "@tauri-apps/api/path";
import { hostname } from "@tauri-apps/plugin-os";
import { useSyncExternalStore } from "react";

export type SystemInfo = { home: string | null; host: string };

const listeners = new Set<() => void>();
let snapshot: SystemInfo = { home: null, host: "" };
let started = false;

function patch(next: Partial<SystemInfo>): void {
  snapshot = { ...snapshot, ...next };
  for (const l of listeners) l();
}

// Resolved once on first use: neither value changes while the app runs.
function load(): void {
  if (started) return;
  started = true;
  void homeDir()
    .then((h) => patch({ home: h.replace(/\\/g, "/") }))
    .catch(() => {});
  void hostname()
    .then((h) => patch({ host: h ?? "" }))
    .catch(() => {});
}

function subscribe(l: () => void): () => void {
  load();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getSystemInfo(): SystemInfo {
  return snapshot;
}

export function useSystemInfo(): SystemInfo {
  return useSyncExternalStore(subscribe, getSystemInfo);
}
