import type { RevealAction } from "./pendingAction";

export type RevealRequest = {
  path: string;
  nonce: number;
  workspaceId: string;
  pendingAction?: RevealAction;
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
