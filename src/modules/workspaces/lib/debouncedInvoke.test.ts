import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn(async (_cmd: string, _args: unknown) => undefined);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args: unknown) => invokeMock(cmd, args),
}));

import { debouncedInvoke } from "./debouncedInvoke";

describe("debouncedInvoke", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("collapses repeated schedule() calls into a single invoke with the last value", () => {
    const d = debouncedInvoke<{ n: number }>({
      command: "cmd",
      delayMs: 100,
      buildArgs: (v) => ({ n: v.n }),
      errorTag: "test",
    });
    d.schedule({ n: 1 });
    d.schedule({ n: 2 });
    d.schedule({ n: 3 });
    expect(invokeMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("cmd", { n: 3 });
  });

  it("restarts the delay on every schedule() call", () => {
    const d = debouncedInvoke<{ n: number }>({
      command: "cmd",
      delayMs: 100,
      buildArgs: (v) => ({ n: v.n }),
      errorTag: "test",
    });
    d.schedule({ n: 1 });
    vi.advanceTimersByTime(80);
    d.schedule({ n: 2 });
    vi.advanceTimersByTime(80);
    expect(invokeMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("cmd", { n: 2 });
  });

  it("flush() cancels the pending delay and saves immediately", async () => {
    const d = debouncedInvoke<{ n: number }>({
      command: "cmd",
      delayMs: 100,
      buildArgs: (v) => ({ n: v.n }),
      errorTag: "test",
    });
    d.schedule({ n: 1 });
    await d.flush();
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("cmd", { n: 1 });
    // The debounce never fires again after a flush.
    vi.advanceTimersByTime(1000);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("flush() is a no-op when nothing is pending", async () => {
    const d = debouncedInvoke<{ n: number }>({
      command: "cmd",
      delayMs: 100,
      buildArgs: (v) => ({ n: v.n }),
      errorTag: "test",
    });
    await d.flush();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
