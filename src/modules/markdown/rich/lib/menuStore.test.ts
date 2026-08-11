import { describe, expect, it, vi } from "vitest";
import { createMenuStore } from "@/modules/markdown/rich/lib/menuStore";

describe("createMenuStore", () => {
  it("reads, writes and notifies subscribers", () => {
    const store = createMenuStore<number>(0);
    const cb = vi.fn();
    const unsub = store.subscribe(cb);
    store.set(1);
    expect(store.get()).toBe(1);
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
    store.set(2);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("does not notify when setting the identical value", () => {
    const store = createMenuStore<string | null>(null);
    const cb = vi.fn();
    store.subscribe(cb);
    store.set(null);
    expect(cb).not.toHaveBeenCalled();
  });
});
