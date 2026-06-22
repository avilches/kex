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
