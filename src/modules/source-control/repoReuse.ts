/**
 * Whether the source-control summary may reuse its already-resolved repo for a
 * new context path instead of re-resolving it. Reuse is allowed only when the
 * context path is exactly the one the repo was resolved from: a path merely
 * *under* the loaded repo may itself be a nested repo/worktree with a different
 * root, so it must re-resolve to find the nearest repo.
 */
export function canReuseResolvedRepo(
  contextPath: string | null,
  resolvedContext: string | null,
): boolean {
  return contextPath !== null && contextPath === resolvedContext;
}

/**
 * Whether the repo/status currently held by the summary may be stale for the
 * active context path: a repo is displayed (hasRepo) but its context does not
 * match the one currently in view. True from the instant the context path
 * changes, not just once a refetch starts, so the UI can block interaction
 * with the outgoing repo before any request is even in flight.
 */
export function isContextSwitching(
  hasRepo: boolean,
  contextPath: string | null,
  resolvedContext: string | null,
): boolean {
  return hasRepo && !canReuseResolvedRepo(contextPath, resolvedContext);
}
