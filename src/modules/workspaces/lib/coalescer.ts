export type Coalescer<K, V> = {
  push: (key: K, value: V) => void;
  flush: () => boolean;
  dispose: () => void;
};

// One shared window for every key: a change flushes right away when the last flush is older
// than `intervalMs`, otherwise it waits for the rest of the window, and all the values that
// changed meanwhile go out together. A burst from ten keys costs one apply, not ten.
export function createCoalescer<K, V>(
  apply: (batch: Map<K, V>) => void,
  intervalMs: number,
): Coalescer<K, V> {
  let pending = new Map<K, V>();
  let lastFlush = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (pending.size === 0) return false;
    const batch = pending;
    pending = new Map();
    lastFlush = Date.now();
    apply(batch);
    return true;
  };

  return {
    push(key, value) {
      pending.set(key, value);
      const wait = lastFlush + intervalMs - Date.now();
      if (wait <= 0) flush();
      else if (timer === null) timer = setTimeout(flush, wait);
    },
    flush,
    dispose() {
      flush();
    },
  };
}
