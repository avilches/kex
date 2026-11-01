import type { RevealAction } from "./pendingAction";

export type RevealRequest = {
  path: string;
  nonce: number;
  workspaceId: string;
  pendingAction?: RevealAction;
  forceFlash?: boolean;
};

// A request already present at mount was issued for an earlier explorer
// instance (another workspace, or before a remount); replaying it would
// overwrite the restored selection and scroll.
export function initialConsumedNonce(request: { nonce: number } | null | undefined): number | null {
  return request?.nonce ?? null;
}

export function shouldConsumeReveal(
  request: { nonce: number } | null | undefined,
  consumedNonce: number | null,
): boolean {
  return request != null && request.nonce !== consumedNonce;
}

// The reveal resolves its target after an async git lookup, so the user may have
// switched workspace by the time it lands.
export function revealForWorkspace(
  request: RevealRequest | null | undefined,
  workspaceId: string | null,
): RevealRequest | null {
  return request && request.workspaceId === workspaceId ? request : null;
}

// Focus on Explorer positions both the workspace and the file system views, but
// only one is shown. When the other one is shown later, the same request is
// replayed once for that root, never a rename/delete and never twice.
export function replayKey(request: RevealRequest, rootPath: string): string {
  return `${request.nonce}|${rootPath}`;
}

export function shouldReplayReveal(
  request: RevealRequest | null | undefined,
  rootPath: string | null,
  done: ReadonlySet<string>,
  contains: (path: string, root: string) => boolean,
): boolean {
  if (!request || !rootPath || request.pendingAction) return false;
  if (!contains(request.path, rootPath)) return false;
  return !done.has(replayKey(request, rootPath));
}
