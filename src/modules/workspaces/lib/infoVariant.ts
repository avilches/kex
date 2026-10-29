// Experiment: each hibernated card shows the next arrangement of its name, folder and command,
// so the four can be compared in the real app. Remove once one is chosen.
export const INFO_VARIANTS = ["indent", "box", "collapsible", "labels"] as const;
export type InfoVariant = (typeof INFO_VARIANTS)[number];

const assigned = new Map<string, InfoVariant>();
let next = 0;

export function infoVariantFor(tabId: string): InfoVariant {
  const known = assigned.get(tabId);
  if (known) return known;
  const variant = INFO_VARIANTS[next % INFO_VARIANTS.length]!;
  next += 1;
  assigned.set(tabId, variant);
  return variant;
}
