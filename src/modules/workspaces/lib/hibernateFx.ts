export const HIBERNATE_FX = ["fade", "sweep", "iris", "curtain", "blur"] as const;
export type HibernateFx = (typeof HIBERNATE_FX)[number];

const FRESH_MS = 1500;
const assigned = new Map<string, { at: number; fx: HibernateFx }>();
let cursor = 0;

export function isFreshHibernate(hibernatedAt: number | undefined, now = Date.now()): boolean {
  return hibernatedAt !== undefined && now - hibernatedAt < FRESH_MS;
}

export function hibernateFxFor(id: string, hibernatedAt: number): HibernateFx {
  const known = assigned.get(id);
  if (known && known.at === hibernatedAt) return known.fx;
  const fx = HIBERNATE_FX[cursor++ % HIBERNATE_FX.length];
  assigned.set(id, { at: hibernatedAt, fx });
  return fx;
}
