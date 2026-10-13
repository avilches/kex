import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTitleCoalescer } from "./agentTitleSync";

describe("createTitleCoalescer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves the first change right away", () => {
    const apply = vi.fn();
    createTitleCoalescer(apply, 10_000).push("t1", "A");
    expect(apply).toHaveBeenCalledWith(new Map([["t1", "A"]]));
  });

  it("holds later changes until the window ends and sends all tabs in one save", () => {
    const apply = vi.fn();
    const c = createTitleCoalescer(apply, 10_000);
    c.push("t1", "A");
    vi.advanceTimersByTime(1000);
    c.push("t1", "B");
    c.push("t2", "X");
    vi.advanceTimersByTime(1000);
    c.push("t2", "Y");
    expect(apply).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(8000);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith(new Map([["t1", "B"], ["t2", "Y"]]));
  });

  it("saves immediately again once the window has passed with nothing pending", () => {
    const apply = vi.fn();
    const c = createTitleCoalescer(apply, 10_000);
    c.push("t1", "A");
    vi.advanceTimersByTime(30_000);
    c.push("t1", "B");
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("flush sends what is pending and cancels the timer", () => {
    const apply = vi.fn();
    const c = createTitleCoalescer(apply, 10_000);
    c.push("t1", "A");
    vi.advanceTimersByTime(1000);
    c.push("t1", "B");
    expect(c.flush()).toBe(true);
    expect(apply).toHaveBeenLastCalledWith(new Map([["t1", "B"]]));
    vi.advanceTimersByTime(20_000);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(c.flush()).toBe(false);
  });
});
