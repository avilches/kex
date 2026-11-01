// One close path at a time (window X, last workspace removed, Cmd+Q) owns the flush and the
// destroy. A path that fails must give the claim back so the next attempt can run, and a quit
// that finds a flush already running must wait for it instead of confirming the exit.
let claimed = false;
let flight: Promise<void> | null = null;

export function claimClose(): boolean {
  if (claimed) return false;
  claimed = true;
  return true;
}

export function releaseClose(): void {
  claimed = false;
  flight = null;
}

export function trackCloseFlush(flush: Promise<void>): Promise<void> {
  flight = flush;
  return flush;
}

export function pendingCloseFlush(): Promise<void> | null {
  return flight;
}

export async function handleBeforeQuit(
  flush: () => Promise<void>,
  confirm: () => Promise<void>,
): Promise<void> {
  try {
    if (claimClose()) {
      try {
        await trackCloseFlush(Promise.resolve().then(flush));
      } finally {
        releaseClose();
      }
    } else {
      await pendingCloseFlush()?.catch(() => {});
    }
  } catch {
    // The user asked to quit: a failed flush must not keep the app open.
  } finally {
    await confirm();
  }
}
