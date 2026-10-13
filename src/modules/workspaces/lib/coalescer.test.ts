import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCoalescer } from "./coalescer";

describe("createCoalescer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends the first change right away and keeps the last value per key", () => {
    const apply = vi.fn();
    const c = createCoalescer<string, { n: number }>(apply, 10_000);
    c.push("a", { n: 1 });
    expect(apply).toHaveBeenCalledWith(new Map([["a", { n: 1 }]]));
    vi.advanceTimersByTime(1000);
    c.push("a", { n: 2 });
    c.push("a", { n: 3 });
    c.push("b", { n: 9 });
    expect(apply).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(9000);
    expect(apply).toHaveBeenLastCalledWith(
      new Map([["a", { n: 3 }], ["b", { n: 9 }]]),
    );
  });

  it("flush sends what is pending and reports whether it did", () => {
    const apply = vi.fn();
    const c = createCoalescer<string, number>(apply, 10_000);
    c.push("a", 1);
    vi.advanceTimersByTime(1000);
    c.push("a", 2);
    expect(c.flush()).toBe(true);
    expect(apply).toHaveBeenLastCalledWith(new Map([["a", 2]]));
    expect(c.flush()).toBe(false);
    vi.advanceTimersByTime(20_000);
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("dispose flushes", () => {
    const apply = vi.fn();
    const c = createCoalescer<string, number>(apply, 10_000);
    c.push("a", 1);
    vi.advanceTimersByTime(1000);
    c.push("a", 2);
    c.dispose();
    expect(apply).toHaveBeenLastCalledWith(new Map([["a", 2]]));
  });
});
