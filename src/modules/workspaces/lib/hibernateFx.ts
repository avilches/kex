import { useEffect, useState } from "react";

const FRESH_MS = 1500;
const WAKE_FX_MS = 1600;
const TOGGLE_LOCK_MS = 1300;
const lastToggle = new Map<string, number>();
const playedHibernate = new Map<string, number>();

export function claimToggle(id: string, now = Date.now()): boolean {
  for (const [key, at] of lastToggle) if (now - at >= TOGGLE_LOCK_MS) lastToggle.delete(key);
  if (lastToggle.has(id)) return false;
  lastToggle.set(id, now);
  return true;
}

export function toggleLockSize(): number {
  return lastToggle.size;
}

export function isFreshHibernate(hibernatedAt: number | undefined, now = Date.now()): boolean {
  return hibernatedAt !== undefined && now - hibernatedAt < FRESH_MS;
}

// True only the first time a given hibernation is shown, so remounting the
// overlay inside the fresh window does not replay the entrance.
export function shouldPlayHibernateFx(
  id: string,
  hibernatedAt: number | undefined,
  now = Date.now(),
): boolean {
  return isFreshHibernate(hibernatedAt, now) && playedHibernate.get(id) !== hibernatedAt;
}

export function markHibernateFxPlayed(id: string, hibernatedAt: number | undefined): void {
  if (hibernatedAt === undefined) return;
  playedHibernate.set(id, hibernatedAt);
}

export type WakeState = { hibernated: boolean; wokenAt: number | null };

export function nextWakeState(state: WakeState, hibernated: boolean, now: number): WakeState {
  if (state.hibernated === hibernated) return state;
  return { hibernated, wokenAt: hibernated ? null : now };
}

export function useJustWoken(hibernated: boolean | undefined): number | null {
  const [state, setState] = useState<WakeState>({ hibernated: !!hibernated, wokenAt: null });
  const next = nextWakeState(state, !!hibernated, Date.now());
  // Adjusting state while rendering lands before paint, so the first frame
  // after a wake already knows it just woke.
  if (next !== state) setState(next);
  const wokenAt = next.wokenAt;
  useEffect(() => {
    if (wokenAt === null) return;
    const timer = setTimeout(
      () => setState((cur) => (cur.wokenAt === wokenAt ? { ...cur, wokenAt: null } : cur)),
      WAKE_FX_MS,
    );
    return () => clearTimeout(timer);
  }, [wokenAt]);
  return hibernated ? null : next.wokenAt;
}
