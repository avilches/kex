import { adoptAction, normalizeAction, removeAction } from "./actions";
import type { Action } from "./types";

type Deps = {
  /** The list as the preferences store shows it, which lags behind writes. */
  read: () => Action[];
  write: (list: Action[]) => Promise<void>;
  makeId: () => string;
};

const sameList = (a: readonly Action[], b: readonly Action[]) => JSON.stringify(a) === JSON.stringify(b);

// Synchronous source of truth for the global Actions while writes are in flight. The
// preferences store only follows a write after it reaches disk and comes back as an event,
// so two changes made in quick succession would otherwise both start from the same stale
// list and the second would drop the first. Writes are serialized and always carry the
// latest list; a failed one takes its action back out and rejects so the caller can undo.
export function createGlobalActions({ read, write, makeId }: Deps) {
  let current: Action[] | null = null;
  let pending = 0;
  let chain: Promise<void> = Promise.resolve();

  // Once nothing is in flight and the preferences store shows what was written, reads go back
  // to it, so edits made from another window show up again.
  function sync(): void {
    if (pending === 0 && current && sameList(current, read())) current = null;
  }

  const get = (): Action[] => {
    sync();
    return current ?? read();
  };

  function add(action: Action): Promise<Action> {
    const clean = normalizeAction(action);
    if (!clean) return Promise.reject(new Error("Invalid action"));
    const next = adoptAction(get(), clean, makeId);
    const stored = next[next.length - 1]!;
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
