import { native, type TabHistoryEntry } from "@/lib/native";
import { tabFilePath } from "./tabPath";
import type { Tab } from "./types";

export type TabHistoryKind = "terminal" | "file";

export type TabHistoryRecord = TabHistoryEntry;

export type TabIdentity = { kind: TabHistoryKind; path: string };

function normalizePath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (trimmed.length <= 1 || trimmed.endsWith(":/")) return trimmed;
  return trimmed.replace(/\/+$/, "");
}

// A terminal is remembered by the folder it runs in; a file tab by the file it holds. Views
// without a stable location (browsers, git history) are not part of this history.
export function tabIdentity(tab: Tab): TabIdentity | null {
  if (tab.kind === "terminal") {
    const path = normalizePath(tab.cwd ?? "");
    return path ? { kind: "terminal", path } : null;
  }
  if (tab.kind === "editor" || tab.kind === "markdown") {
    const path = normalizePath(tabFilePath(tab) ?? "");
    return path ? { kind: "file", path } : null;
  }
  return null;
}

export function tabIdentityKey(tab: Tab): string | null {
  const identity = tabIdentity(tab);
  return identity ? `${identity.kind}\0${identity.path}` : null;
}

type PendingUse = {
  kind: TabHistoryKind;
  path: string;
  workspaceId: string;
  count: number;
};

// Frecency has to survive tab switching without writing the whole JSON on every click. Uses
// accumulate in memory and land in one batch after a short pause, or immediately when the
// palette opens or a tab closes.
const FLUSH_DELAY_MS = 800;
const pending = new Map<string, PendingUse>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let writes: Promise<void> = Promise.resolve();

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushTabUses();
  }, FLUSH_DELAY_MS);
}

// One focus of the tab counts as one use. The counter is what decides the order in the palette
// and what protects an entry from the size cap, so it has to follow real attention, not only
// the times the entry was reopened from the palette.
export function noteTabUse(tab: Tab, workspaceId: string): void {
  const identity = tabIdentity(tab);
  if (!identity) return;
  const key = `${identity.kind}\0${identity.path}`;
  const current = pending.get(key);
  if (current) {
    current.count += 1;
    current.workspaceId = workspaceId;
  } else {
    pending.set(key, { ...identity, workspaceId, count: 1 });
  }
  scheduleFlush();
}

export async function flushTabUses(): Promise<void> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const entries = [...pending.values()];
  pending.clear();
  if (entries.length > 0) {
    const write = () => native.tabHistoryTouch(entries);
    writes = writes.then(write, write).catch(() => {});
  }
  await writes;
}

export function recordTabClosed(tab: Tab, workspaceId: string): void {
  const identity = tabIdentity(tab);
  if (!identity) return;
  void (async () => {
    await flushTabUses();
    await native.tabHistoryRecord(identity.kind, identity.path, workspaceId);
  })().catch(() => {});
}

export async function loadTabHistory(): Promise<TabHistoryRecord[]> {
  await flushTabUses();
  try {
    return await native.tabHistoryList();
  } catch {
    return [];
  }
}
