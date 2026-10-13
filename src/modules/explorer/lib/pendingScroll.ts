type ListingStatus = { status: "idle" | "loading" | "loaded" | "error" };

export function listingsSettled(
  root: string | null,
  nodes: Record<string, ListingStatus | undefined>,
): boolean {
  if (!root) return false;
  const rootStatus = nodes[root]?.status;
  if (rootStatus !== "loaded" && rootStatus !== "error") return false;
  return Object.values(nodes).every((n) => n?.status !== "loading" && n?.status !== "idle");
}

// A restored offset waits for the list to grow tall enough. Once nothing is
// left to load it is clamped to what fits, so it can never stay armed.
export function resolvePendingScroll(
  top: number,
  scrollHeight: number,
  clientHeight: number,
  settled: boolean,
): { scrollTo: number | null; done: boolean } {
  if (top <= 0) return { scrollTo: null, done: true };
  const max = Math.max(0, scrollHeight - clientHeight);
  if (max >= top) return { scrollTo: top, done: true };
  if (settled) return { scrollTo: max, done: true };
  return { scrollTo: null, done: false };
}
