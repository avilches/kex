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

// Keeps the last moment each workspace was the active one. A workspace seen
// for the first time starts its idle clock now, so a restart never hibernates
// anything straight away.
export function touchActivity(
  seen: Map<string, number>,
  workspaces: readonly Workspace[],
  activeId: string | null,
  now: number,
): void {
  const ids = new Set(workspaces.map((w) => w.id));
  for (const id of seen.keys()) if (!ids.has(id)) seen.delete(id);
  for (const w of workspaces) {
    if (w.id === activeId || !seen.has(w.id)) seen.set(w.id, now);
  }
}

export function autoHibernateCandidates(
  workspaces: readonly Workspace[],
  activeId: string | null,
  seen: ReadonlyMap<string, number>,
  mode: AutoHibernate,
  now: number,
): string[] {
  const delay = autoHibernateDelayMs(mode);
  if (delay === null) return [];
  return workspaces
    .filter((w) => w.id !== activeId && !w.hibernated)
    .filter((w) => now - (seen.get(w.id) ?? now) >= delay)
    .map((w) => w.id);
}
