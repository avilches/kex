import { useEffect, useRef, useState } from "react";

const FRESH_MS = 1500;
const WAKE_FX_MS = 1600;

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
