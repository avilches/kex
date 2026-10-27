// What a terminal that was asleep starts with: the last lines it showed, already dimmed, written
// before the new shell prints its prompt. Handed over once, in memory only, by the wake.
const backdrops = new Map<string, string>();

export function setWakeBackdrop(tabId: string, text: string): void {
  backdrops.set(tabId, text);
}

export function takeWakeBackdrop(tabId: string): string | null {
  const text = backdrops.get(tabId) ?? null;
  backdrops.delete(tabId);
  return text;
}
