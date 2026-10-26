import { allPanes } from "./splitNode";
import type { Workspace } from "./types";

export const AUTO_HIBERNATE_MODES = ["off", "1m", "30m", "4h", "2d"] as const;
export type AutoHibernate = (typeof AUTO_HIBERNATE_MODES)[number];

export const AUTO_HIBERNATE_LABELS: Record<AutoHibernate, string> = {
  off: "Never",
  "1m": "1 minute",
  "30m": "30 minutes",
  "4h": "4 hours",
  "2d": "2 days",
};

const MINUTE = 60_000;
const DELAY_MS: Record<Exclude<AutoHibernate, "off">, number> = {
  "1m": MINUTE,
  "30m": 30 * MINUTE,
  "4h": 240 * MINUTE,
  "2d": 2880 * MINUTE,
};

// "1m" exists only for the dev build. A value persisted there falls back to the
// default in production so nobody hibernates every minute without knowing why.
export function autoHibernateModes(dev: boolean): readonly AutoHibernate[] {
  return dev ? AUTO_HIBERNATE_MODES : AUTO_HIBERNATE_MODES.filter((m) => m !== "1m");
}

export function parseAutoHibernate(
  value: unknown,
  modes: readonly AutoHibernate[] = autoHibernateModes(import.meta.env?.DEV ?? false),
): AutoHibernate {
  return modes.find((m) => m === value) ?? "4h";
}

export function autoHibernateDelayMs(mode: AutoHibernate): number | null {
  return mode === "off" ? null : DELAY_MS[mode];
}

// Tabs the user can see right now: the active tab of every pane of the active workspace.
export function visibleTabIds(workspaces: readonly Workspace[], activeId: string | null): Set<string> {
  const ids = new Set<string>();
  const active = workspaces.find((w) => w.id === activeId);
  if (active)
    for (const pane of allPanes(active.paneTree)) if (pane.activeTabId) ids.add(pane.activeTabId);
  return ids;
}

// Keeps, per awake terminal tab, the moment it stopped being visible. A visible tab has no
// stamp, a hidden one is stamped the first time it is seen hidden, and a busy one is renewed
// so its countdown only runs while nothing works in it. Stamps live in memory only: after a
// restart every hidden tab starts counting again.
export function touchHiddenSince(
  stamps: Map<string, number>,
  workspaces: readonly Workspace[],
  activeId: string | null,
  now: number,
  busyTabIds: ReadonlySet<string> = new Set(),
): void {
  const visible = visibleTabIds(workspaces, activeId);
  const awake = new Set<string>();
  for (const w of workspaces)
    for (const pane of allPanes(w.paneTree))
      for (const t of pane.tabs) if (t.kind === "terminal" && !t.hibernation) awake.add(t.id);
  for (const id of stamps.keys()) if (!awake.has(id)) stamps.delete(id);
  for (const id of awake) {
    if (visible.has(id)) stamps.delete(id);
    else if (busyTabIds.has(id) || !stamps.has(id)) stamps.set(id, now);
  }
}

export type AutoHibernateTick = {
  workspaces: readonly Workspace[];
  activeId: string | null;
  stamps: Map<string, number>;
  busyTabIds?: ReadonlySet<string>;
  mode: AutoHibernate;
  now: number;
  request: (workspaceId: string, tabIds: string[]) => Promise<boolean>;
  // A previous run is still hibernating; stamps are renewed anyway.
  busy?: boolean;
};

export async function autoHibernateTick(t: AutoHibernateTick): Promise<void> {
  touchHiddenSince(t.stamps, t.workspaces, t.activeId, t.now, t.busyTabIds);
  if (t.busy) return;
  for (const [workspaceId, tabIds] of autoHibernateCandidates(t.workspaces, t.activeId, t.stamps, t.mode, t.now)) {
    await t.request(workspaceId, tabIds);
  }
}

// Awake terminal tabs that have been out of sight for the whole delay, by workspace.
export function autoHibernateCandidates(
  workspaces: readonly Workspace[],
  activeId: string | null,
  stamps: ReadonlyMap<string, number>,
  mode: AutoHibernate,
  now: number,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const delay = autoHibernateDelayMs(mode);
  if (delay === null) return out;
  const visible = visibleTabIds(workspaces, activeId);
  for (const w of workspaces) {
    const ids: string[] = [];
    for (const pane of allPanes(w.paneTree))
      for (const t of pane.tabs) {
        if (t.kind !== "terminal" || t.hibernation || visible.has(t.id)) continue;
        const since = stamps.get(t.id);
        if (since !== undefined && now - since >= delay) ids.push(t.id);
      }
    if (ids.length > 0) out.set(w.id, ids);
  }
  return out;
}
