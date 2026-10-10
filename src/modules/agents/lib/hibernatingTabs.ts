// Tabs whose PTY is being killed because their workspace is hibernating. The exit
// that follows must not delete the agent's stored session: waking needs it.
const hibernating = new Set<string>();

export function markHibernating(tabIds: Iterable<string>): void {
  for (const id of tabIds) hibernating.add(id);
}

export function unmarkHibernating(tabIds: Iterable<string>): void {
  for (const id of tabIds) hibernating.delete(id);
}

export function isHibernating(tabId: string): boolean {
  return hibernating.has(tabId);
}
