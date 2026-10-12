// An editor unmounted with unsaved edits and autosave off carries them here, keyed
// by tab id, so the same tab remounting picks them up again (e.g. a tab dragged to
// another pane). Keyed by tab id, not path: the same file can be open in two tabs at
// once. Process-lifetime only.
const buffers = new Map<string, string>();
// Tabs of a closed workspace: their editors unmount after the close and would stash again.
// Ids are never reused, so the mark is permanent.
const abandoned = new Set<string>();

export function stashUnflushedBuffer(tabId: string, text: string): void {
  if (!abandoned.has(tabId)) buffers.set(tabId, text);
}

export function takeUnflushedBuffer(tabId: string): string | undefined {
  const text = buffers.get(tabId);
  buffers.delete(tabId);
  return text;
}

export function hasUnflushedBuffer(tabId: string): boolean {
  return buffers.has(tabId);
}

export function discardUnflushedBuffers(tabIds: Iterable<string>): void {
  for (const id of tabIds) buffers.delete(id);
}

export function abandonUnflushedBuffers(tabIds: Iterable<string>): void {
  for (const id of tabIds) {
    buffers.delete(id);
    abandoned.add(id);
  }
}
