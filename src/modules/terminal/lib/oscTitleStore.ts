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

// Strip a leading status indicator (a single non-alphanumeric character followed
// by whitespace) that agents like Claude Code prepend to terminal titles,
// e.g. "* doing something" or "⏺ working on task" -> "doing something".
export function cleanOscTitle(title: string): string {
  return title.replace(/^[^\p{L}\p{N}\s]\s+/u, "");
}

export function setOscTitle(panelId: string, title: string): void {
  const cleaned = cleanOscTitle(title);
  if (titles.get(panelId) === cleaned) return;
  titles.set(panelId, cleaned);
  notify();
  void info(`[oscTitle] panel=${panelId} title=${JSON.stringify(cleaned)} listeners=${listeners.size}`);
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
