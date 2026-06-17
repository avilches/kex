import { info } from "@tauri-apps/plugin-log";
import { useSyncExternalStore } from "react";

const titles = new Map<string, string>();
let snapshot: ReadonlyMap<string, string> = new Map();
const listeners = new Set<() => void>();

function notify(): void {
  snapshot = new Map(titles);
  for (const l of listeners) l();
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getSnapshot(): ReadonlyMap<string, string> {
  return snapshot;
}

export function getOscTitle(panelId: string): string | undefined {
  return snapshot.get(panelId);
}

export function setOscTitle(panelId: string, title: string): void {
  if (titles.get(panelId) === title) return;
  titles.set(panelId, title);
  notify();
  void info(`[oscTitle] panel=${panelId} title=${JSON.stringify(title)} listeners=${listeners.size}`);
}

export function clearOscTitle(panelId: string): void {
  if (!titles.has(panelId)) return;
  titles.delete(panelId);
  notify();
}

export function _clearAll(): void {
  if (titles.size === 0) return;
  titles.clear();
  notify();
}

export function useOscTitle(panelId: string): string | undefined {
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  return snap.get(panelId);
}
