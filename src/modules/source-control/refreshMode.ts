export type SourceControlRefreshMode = "auto" | "always" | "never";

// Ordering used to decide whether a newly requested refresh mode is worth
// starting a second concurrent run for while one is already in flight, and
// to pick the more aggressive of two modes when merging queued requests.
function refreshModeRank(mode: SourceControlRefreshMode): number {
  if (mode === "always") return 2;
  if (mode === "auto") return 1;
  return 0;
}

/**
 * Whether a newly requested refresh mode is aggressive enough, relative to
 * the mode of the run currently in flight, to justify starting a second
 * concurrent run right away instead of queuing a trailing rerun. Only an
 * increase in remote-fetch aggressiveness qualifies (never -> auto/always,
 * auto -> always); a same-or-lesser request should queue instead.
 */
export function shouldUpgradeInflightRefresh(
  inFlightMode: SourceControlRefreshMode,
  requestedMode: SourceControlRefreshMode,
): boolean {
  return refreshModeRank(requestedMode) > refreshModeRank(inFlightMode);
}

/**
 * Merges a newly queued refresh mode into whatever trailing mode (if any) is
 * already queued, keeping the more aggressive of the two so a later
 * "always"/"auto" request is never downgraded by an earlier "never" one still
 * waiting to run.
 */
export function mergeRefreshMode(
  pending: SourceControlRefreshMode | null,
  requested: SourceControlRefreshMode,
): SourceControlRefreshMode {
  if (pending === null) return requested;
  return refreshModeRank(requested) > refreshModeRank(pending) ? requested : pending;
}
