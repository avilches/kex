export type AutofocusKey = { workspaceId: string | null; signal: string | null };

// A workspace switch changes the active tab too, but the Sidebar must keep the state it
// restored for that workspace, so only a change inside the same workspace may reveal.
export function autofocusDecision(
  prev: AutofocusKey | undefined,
  next: AutofocusKey,
): boolean {
  if (!prev) return false;
  if (prev.workspaceId !== next.workspaceId) return false;
  return next.signal !== null && next.signal !== prev.signal;
}
