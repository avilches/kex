import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { markShellReady, waitForShellReady } from "./shellReadyWaiter";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("waitForShellReady", () => {
  it("resolves once markShellReady is called for that ptyId", async () => {
    const spy = vi.fn();
    void waitForShellReady(1, 5000).then(spy);

    markShellReady(1);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it("resolves immediately if markShellReady already fired before the wait started", async () => {
    markShellReady(2);

    const spy = vi.fn();
    void waitForShellReady(2, 5000).then(spy);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it("falls back to resolving after the timeout if markShellReady never arrives", async () => {
    const spy = vi.fn();
    void waitForShellReady(3, 1000).then(spy);

    vi.advanceTimersByTime(999);
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it("keeps each ptyId independent: marking one does not resolve another's waiter", async () => {
    const spyA = vi.fn();
    const spyB = vi.fn();
    void waitForShellReady(10, 5000).then(spyA);
    void waitForShellReady(20, 5000).then(spyB);

    markShellReady(10);
    await vi.waitFor(() => expect(spyA).toHaveBeenCalledTimes(1));
    expect(spyB).not.toHaveBeenCalled();
  });
});
