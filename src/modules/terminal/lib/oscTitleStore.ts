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

export function getOscTitle(tabId: string): string | undefined {
  return snapshot.get(tabId);
}

// Strip a leading status indicator (a single non-alphanumeric character followed
// by whitespace) that agents like Claude Code prepend to terminal titles,
// e.g. "* doing something" or "⏺ working on task" -> "doing something".
export function cleanOscTitle(title: string): string {
  return title.replace(/^[^\p{L}\p{N}\s]\s+/u, "");
}

export function setOscTitle(tabId: string, title: string): void {
  const cleaned = cleanOscTitle(title);
  if (titles.get(tabId) === cleaned) return;
  titles.set(tabId, cleaned);
  notify();
  void info(`[oscTitle] tab=${tabId} title=${JSON.stringify(cleaned)} listeners=${listeners.size}`);
}

export function clearOscTitle(tabId: string): void {
  if (!titles.has(tabId)) return;
  titles.delete(tabId);
  notify();
}

export function _clearAll(): void {
  if (titles.size === 0) return;
  titles.clear();
  notify();
}

export function useOscTitle(tabId: string): string | undefined {
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  return snap.get(tabId);
}
