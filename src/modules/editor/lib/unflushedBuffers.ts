// An editor unmounted with unsaved edits and autosave off carries them here, keyed
// by tab id, so the same tab remounting picks them up again (e.g. a tab dragged to
// another pane). Keyed by tab id, not path: the same file can be open in two tabs at
// once. Process-lifetime only.
// A buffer stashed during an unresolved disk conflict carries the flag, so the remount
// does not turn it into a plain dirty buffer that would save over the external change.
export type UnflushedBuffer = { text: string; conflict: boolean };

const buffers = new Map<string, UnflushedBuffer>();

export function stashUnflushedBuffer(
  tabId: string,
  text: string,
  conflict = false,
): void {
  buffers.set(tabId, { text, conflict });
}

export function takeUnflushedBuffer(tabId: string): UnflushedBuffer | undefined {
  const entry = buffers.get(tabId);
  buffers.delete(tabId);
  return entry;
}

export function hasUnflushedBuffer(tabId: string): boolean {
  return buffers.has(tabId);
}

export function discardUnflushedBuffers(tabIds: Iterable<string>): void {
  for (const id of tabIds) buffers.delete(id);
}
