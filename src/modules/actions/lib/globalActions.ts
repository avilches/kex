import { adoptAction, normalizeAction, removeAction } from "./actions";
import type { Action } from "./types";

type Deps = {
  /** The list as the preferences store shows it, which lags behind writes. */
  read: () => Action[];
  write: (list: Action[]) => Promise<void>;
  makeId: () => string;
};

// Synchronous source of truth for the global Actions while writes are in flight. The
// preferences store only follows a write after it reaches disk and comes back as an event,
// so two changes made in quick succession would otherwise both start from the same stale
// list and the second would drop the first. Writes are serialized and always carry the
// latest list; a failed one takes its action back out and rejects so the caller can undo.
export function createGlobalActions({ read, write, makeId }: Deps) {
  let current: Action[] | null = null;
  let pending = 0;
  // What the preferences store showed when the current burst of writes began. Any later
  // change to it, whether our own echo or another window, makes the store the truth again.
  let base: Action[] | null = null;
  let chain: Promise<void> = Promise.resolve();

  // The copy only lives while writes are in flight and until the store reports anything new.
  function sync(): void {
    if (pending === 0 && current && read() !== base) current = null;
  }

  const get = (): Action[] => {
    sync();
    return current ?? read();
  };

  function add(action: Action): Promise<Action> {
    const clean = normalizeAction(action);
    if (!clean) return Promise.reject(new Error("Invalid action"));
    const next = adoptAction(get(), clean, makeId);
    const stored = next[next.length - 1];
    if (!stored) return Promise.reject(new Error("Invalid action"));
    if (pending === 0) base = read();
    current = next;
    pending++;
    const run = chain.then(() => write(current ?? next));
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run.then(
      () => {
        pending--;
        return stored;
      },
      (err: unknown) => {
        pending--;
        current = removeAction(current ?? next, stored.id);
        throw err;
      },
    );
  }

  return { get, add };
}
