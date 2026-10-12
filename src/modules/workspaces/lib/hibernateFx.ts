import { useEffect, useRef, useState } from "react";

const FRESH_MS = 1500;
const WAKE_FX_MS = 1600;
const TOGGLE_LOCK_MS = 1300;
const lastToggle = new Map<string, number>();

export function claimToggle(id: string, now = Date.now()): boolean {
  const last = lastToggle.get(id);
  if (last !== undefined && now - last < TOGGLE_LOCK_MS) return false;
  lastToggle.set(id, now);
  return true;
}

export function isFreshHibernate(hibernatedAt: number | undefined, now = Date.now()): boolean {
  return hibernatedAt !== undefined && now - hibernatedAt < FRESH_MS;
}

export function useJustWoken(hibernated: boolean | undefined): number | null {
  const prev = useRef(!!hibernated);
  const [wokenAt, setWokenAt] = useState<number | null>(null);
  useEffect(() => {
    const was = prev.current;
    prev.current = !!hibernated;
    if (hibernated) {
      setWokenAt(null);
      return;
    }
    if (!was) return;
    setWokenAt(Date.now());
    const timer = setTimeout(() => setWokenAt(null), WAKE_FX_MS);
    return () => clearTimeout(timer);
  }, [hibernated]);
  return hibernated ? null : wokenAt;
}
