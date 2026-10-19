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

function validStamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// Loads the persisted stamps of a restored workspace list. A workspace without a
// usable one is left out and gets "now" in the first touchActivity; a stamp from
// the future (wrong clock) is clamped so it can never keep a workspace awake.
export function seedActivity(
  workspaces: readonly Workspace[],
  now: number,
): Map<string, number> {
  const stamps = new Map<string, number>();
  for (const w of workspaces)
    if (validStamp(w.lastActiveAt))
      stamps.set(w.id, Math.min(w.lastActiveAt, now));
  return stamps;
}

export function hibernatedIds(workspaces: readonly Workspace[]): Set<string> {
  return new Set(workspaces.filter((w) => w.hibernated).map((w) => w.id));
}

// Keeps the last moment each workspace was the active one. The awake active one is
// renewed every tick. A hibernated workspace is stamped only when it changes state
// (hibernated or woken, compared with `hibernatedSeen`, which this updates), so its
// persisted body does not change every minute but waking it still restarts the clock.
// One without a stamp (new, or saved before stamps existed) starts it now. A workspace
// with a busy agent is renewed too, so its countdown only runs while nothing works in it.
// Returns true when a seal changed (a workspace appeared, left or crossed the sleep
// boundary); a plain renewal of the active stamp is not a seal. Ticks persist only
// when this returns true, so the minute timer serializes nothing in steady state.
export function touchActivity(
  stamps: Map<string, number>,
  workspaces: readonly Workspace[],
  activeId: string | null,
  now: number,
  hibernatedSeen: Set<string>,
  busyIds: ReadonlySet<string> = new Set(),
): boolean {
  const ids = new Set(workspaces.map((w) => w.id));
  let structural = false;
  for (const id of stamps.keys())
    if (!ids.has(id)) {
      stamps.delete(id);
      structural = true;
    }
  for (const id of hibernatedSeen)
    if (!ids.has(id)) {
      hibernatedSeen.delete(id);
      structural = true;
    }
  for (const w of workspaces) {
    const asleep = !!w.hibernated;
    const changed = hibernatedSeen.has(w.id) !== asleep;
    if (asleep) hibernatedSeen.add(w.id);
    else hibernatedSeen.delete(w.id);
    if (changed) structural = true;
    if (
      ((w.id === activeId || busyIds.has(w.id)) && !asleep) ||
      changed ||
      !stamps.has(w.id)
    ) {
      if (!stamps.has(w.id)) structural = true;
      stamps.set(w.id, now);
    }
  }
  return structural;
}

// The exact moment of a switch: the workspace left and the one entered, unless asleep.
export function stampSwitch(
  stamps: Map<string, number>,
  workspaces: readonly Workspace[],
  previousId: string | null,
  nextId: string | null,
  now: number,
): void {
  for (const id of [previousId, nextId]) {
    if (id && workspaces.some((w) => w.id === id && !w.hibernated))
      stamps.set(id, now);
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
    return validStamp(at) ? { ...w, lastActiveAt: at } : w;
  });
}

export type AutoHibernateTick = {
  workspaces: readonly Workspace[];
  activeId: string | null;
  stamps: Map<string, number>;
  hibernatedSeen: Set<string>;
  busyIds?: ReadonlySet<string>;
  mode: AutoHibernate;
  now: number;
  save: () => void;
  request: (workspaceId: string) => Promise<boolean>;
  // A previous run is still hibernating; stamps are renewed and saved anyway.
  busy?: boolean;
};

export async function autoHibernateTick(t: AutoHibernateTick): Promise<void> {
  const structural = touchActivity(
    t.stamps,
    t.workspaces,
    t.activeId,
    t.now,
    t.hibernatedSeen,
    t.busyIds,
  );
  // With auto-hibernate off the countdown is useless, so the minute timer only
  // writes when a seal genuinely changed instead of serializing every workspace.
  const keepLive = t.mode !== "off";
  if (structural || keepLive) t.save();
  if (t.busy) return;
  for (const id of autoHibernateCandidates(
    t.workspaces,
    t.activeId,
    t.stamps,
    t.mode,
    t.now,
  )) {
    await t.request(id);
  }
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
