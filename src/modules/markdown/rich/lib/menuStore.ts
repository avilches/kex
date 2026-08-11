import { useSyncExternalStore } from "react";

export type MenuStore<T> = {
  get(): T;
  set(next: T): void;
  subscribe(listener: () => void): () => void;
};

export function createMenuStore<T>(initial: T): MenuStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const l of listeners) l();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useMenuStore<T>(store: MenuStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
