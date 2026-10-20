import { native, type ClosedTabHistoryEntry } from "@/lib/native";
import { tabFilePath } from "./tabPath";
import type { Tab } from "./types";

export type ClosedTabKind = "terminal" | "file";

export type ClosedTabRecord = ClosedTabHistoryEntry;

export type ClosedTabIdentity = { kind: ClosedTabKind; path: string };

function normalizePath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (trimmed.length <= 1 || trimmed.endsWith(":/")) return trimmed;
  return trimmed.replace(/\/+$/, "");
}

// A terminal is remembered by the folder it ran in; a file tab by the file it held. Views
// without a stable location (browsers, git history) are not part of this history.
export function closedTabIdentity(tab: Tab): ClosedTabIdentity | null {
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

// Writes are chained so a history load after closing a tab never reads the file before the
// close lands there. A failed write is dropped: this history is not critical.
let writes: Promise<unknown> = Promise.resolve();

function enqueue<T>(run: () => Promise<T>): Promise<T> {
  const next = writes.then(run, run);
  writes = next.catch(() => {});
  return next;
}

export function recordClosedTab(tab: Tab, workspaceId: string, now = Date.now()): void {
  const identity = closedTabIdentity(tab);
  if (!identity) return;
  void enqueue(() =>
    native.closedTabsRecord({
      ...identity,
      workspaceId,
      closedAt: now,
      uses: 0,
      lastUsedAt: 0,
    }),
  ).catch(() => {});
}

export async function loadClosedTabs(): Promise<ClosedTabRecord[]> {
  await writes.catch(() => {});
  try {
    return await native.closedTabsList();
  } catch {
    return [];
  }
}

export async function touchClosedTab(identity: ClosedTabIdentity): Promise<boolean> {
  try {
    return await enqueue(() =>
      native.closedTabsTouch(identity.kind, identity.path),
    );
  } catch {
    return false;
  }
}
