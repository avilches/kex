// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let handler: ((key: string) => void) | null = null;
const unlisten = vi.fn();

vi.mock("@/modules/settings/prefApplied", () => ({
  onPrefApplied: (cb: (key: string) => void) => {
    handler = cb;
    return Promise.resolve(unlisten);
  },
}));

import { APPLYING_TIMEOUT_MS, useApplyingPref } from "./useApplyingPref";

beforeEach(() => {
  vi.useFakeTimers();
  handler = null;
  unlisten.mockClear();
});
afterEach(() => vi.useRealTimers());

async function mount(key: "terminalFontSize" | undefined) {
  const hook = renderHook(() => useApplyingPref(key));
  await act(async () => {});
  return hook;
}

describe("useApplyingPref", () => {
  it("is idle until started", async () => {
    const { result } = await mount("terminalFontSize");
    expect(result.current.applying).toBe(false);
  });

  it("clears when the main window acknowledges the same key", async () => {
    const { result } = await mount("terminalFontSize");
    act(() => result.current.start());
    expect(result.current.applying).toBe(true);
    act(() => handler?.("terminalFontSize"));
    expect(result.current.applying).toBe(false);
  });

  it("ignores an acknowledgement for another key", async () => {
    const { result } = await mount("terminalFontSize");
    act(() => result.current.start());
    act(() => handler?.("terminalLineHeight"));
    expect(result.current.applying).toBe(true);
  });

  it("clears by itself when no acknowledgement arrives", async () => {
    const { result } = await mount("terminalFontSize");
    act(() => result.current.start());
    act(() => {
      vi.advanceTimersByTime(APPLYING_TIMEOUT_MS);
    });
    expect(result.current.applying).toBe(false);
  });

  it("never applies without a key", async () => {
    const { result } = await mount(undefined);
    act(() => result.current.start());
    expect(result.current.applying).toBe(false);
    expect(handler).toBeNull();
  });

  it("stops listening on unmount", async () => {
    const { unmount } = await mount("terminalFontSize");
    unmount();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
