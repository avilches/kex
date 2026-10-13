// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isRestoreBusy, MIN_BUSY_MS, useRestoreBusy, withRestoreBusy } from "./restoreBusy";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("withRestoreBusy", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is busy while the action runs and for at least the minimum time", async () => {
    let finish!: () => void;
    const done = withRestoreBusy("t1", () => new Promise<void>((r) => (finish = r)));
    expect(isRestoreBusy("t1")).toBe(true);
    finish();
    await vi.advanceTimersByTimeAsync(MIN_BUSY_MS - 1);
    expect(isRestoreBusy("t1")).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(isRestoreBusy("t1")).toBe(false);
  });

  it("returns the action result and clears busy when it throws", async () => {
    const ok = withRestoreBusy("t1", async () => 7);
    await vi.advanceTimersByTimeAsync(MIN_BUSY_MS);
    await expect(ok).resolves.toBe(7);

    const bad = withRestoreBusy("t1", async () => {
      throw new Error("boom");
    });
    const caught = expect(bad).rejects.toThrow("boom");
    await vi.advanceTimersByTimeAsync(MIN_BUSY_MS);
    await caught;
    expect(isRestoreBusy("t1")).toBe(false);
  });

  it("stays busy until the last overlapping action ends", async () => {
    let finishA!: () => void;
    const a = withRestoreBusy("t1", () => new Promise<void>((r) => (finishA = r)), 0);
    const b = withRestoreBusy("t1", async () => {}, 0);
    await b;
    expect(isRestoreBusy("t1")).toBe(true);
    finishA();
    await a;
    expect(isRestoreBusy("t1")).toBe(false);
  });

  it("does not leak busy across tabs", async () => {
    let finish!: () => void;
    const p = withRestoreBusy("t1", () => new Promise<void>((r) => (finish = r)), 0);
    expect(isRestoreBusy("t2")).toBe(false);
    finish();
    await p;
  });
});

describe("useRestoreBusy", () => {
  afterEach(() => vi.useRealTimers());

  it("re-renders only for its own tab", async () => {
    vi.useFakeTimers();
    const renders: boolean[] = [];
    function Probe() {
      const busy = useRestoreBusy("t1");
      renders.push(busy);
      return null;
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<Probe />));
    expect(renders).toEqual([false]);

    let finishOther!: () => void;
    let other!: Promise<void>;
    await act(async () => {
      other = withRestoreBusy("t2", () => new Promise<void>((r) => (finishOther = r)), 0);
    });
    expect(renders).toEqual([false]);

    let finish!: () => void;
    let mine!: Promise<void>;
    await act(async () => {
      mine = withRestoreBusy("t1", () => new Promise<void>((r) => (finish = r)), 0);
    });
    expect(renders).toEqual([false, true]);
    await act(async () => {
      finish();
      await mine;
    });
    expect(renders).toEqual([false, true, false]);
    finishOther();
    await other;
    act(() => root.unmount());
  });
});
