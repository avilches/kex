// Resolves when a PTY shows its first interactive prompt (OSC 133;B, emitted only
// when the shell renders PS1). `seen` covers an event that fires before the wait starts.
const seen = new Set<number>();
const waiters = new Map<number, () => void>();

export function markShellReady(ptyId: number): void {
  const waiter = waiters.get(ptyId);
  if (waiter) {
    waiters.delete(ptyId);
    waiter();
    return;
  }
  seen.add(ptyId);
}

export function waitForShellReady(ptyId: number, timeoutMs: number): Promise<void> {
  if (seen.delete(ptyId)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters.delete(ptyId);
      resolve();
    }, timeoutMs);
    waiters.set(ptyId, () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
