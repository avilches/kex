import type { Workspace } from "./types";

export const AUTO_HIBERNATE_MODES = ["off", "30m", "4h", "2d"] as const;
export type AutoHibernate = (typeof AUTO_HIBERNATE_MODES)[number];

export const AUTO_HIBERNATE_LABELS: Record<AutoHibernate, string> = {
  off: "Never",
  "30m": "30 minutes",
  "4h": "4 hours",
  "2d": "2 days",
};

const MINUTE = 60_000;
const DELAY_MS: Record<Exclude<AutoHibernate, "off">, number> = {
  "30m": 30 * MINUTE,
  "4h": 240 * MINUTE,
  "2d": 2880 * MINUTE,
};

export function parseAutoHibernate(value: unknown): AutoHibernate {
  return AUTO_HIBERNATE_MODES.find((m) => m === value) ?? "4h";
}

export function autoHibernateDelayMs(mode: AutoHibernate): number | null {
  return mode === "off" ? null : DELAY_MS[mode];
}

// Loads the persisted stamps of a restored workspace list. A workspace without
// one is left out and gets "now" in the first touchActivity.
export function seedActivity(workspaces: readonly Workspace[]): Map<string, number> {
  const stamps = new Map<string, number>();
  for (const w of workspaces) if (w.lastActiveAt !== undefined) stamps.set(w.id, w.lastActiveAt);
  return stamps;
}

// Keeps the last moment each workspace was the active one. The active one and
// the hibernated ones are renewed, so waking a workspace restarts its clock;
// one without a stamp (new, or saved before stamps existed) starts it now.
export function touchActivity(
  stamps: Map<string, number>,
  workspaces: readonly Workspace[],
  activeId: string | null,
  now: number,
): void {
  const ids = new Set(workspaces.map((w) => w.id));
  for (const id of stamps.keys()) if (!ids.has(id)) stamps.delete(id);
  for (const w of workspaces) {
    if (w.id === activeId || w.hibernated || !stamps.has(w.id)) stamps.set(w.id, now);
  }
}

// Copies the live stamps into the bodies about to be persisted; the stamps
// change every minute and live outside React state to avoid re-rendering.
export function withActivity(
  workspaces: readonly Workspace[],
  stamps: ReadonlyMap<string, number>,
): Workspace[] {
  return workspaces.map((w) => {
    const at = stamps.get(w.id);
    return at === undefined ? w : { ...w, lastActiveAt: at };
  });
}

export function autoHibernateCandidates(
  workspaces: readonly Workspace[],
  activeId: string | null,
  stamps: ReadonlyMap<string, number>,
  mode: AutoHibernate,
  now: number,
): string[] {
  const delay = autoHibernateDelayMs(mode);
  if (delay === null) return [];
  return workspaces
    .filter((w) => w.id !== activeId && !w.hibernated)
    .filter((w) => now - (stamps.get(w.id) ?? now) >= delay)
    .map((w) => w.id);
}
