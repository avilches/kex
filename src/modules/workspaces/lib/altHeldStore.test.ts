// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALT_HOLD_DELAY_MS, useAltHeld } from "./altHeldStore";

function key(type: "keydown" | "keyup", k: string, mods: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent(type, { key: k, ...mods }));
  });
}

describe("useAltHeld", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("turns on only after the delay", () => {
    const { result } = renderHook(() => useAltHeld());
    key("keydown", "Alt", { altKey: true });
    act(() => vi.advanceTimersByTime(ALT_HOLD_DELAY_MS - 1));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
    key("keyup", "Alt");
    expect(result.current).toBe(false);
  });

  it("a hotkey during the wait cancels it until Alt is released", () => {
    const { result } = renderHook(() => useAltHeld());
    key("keydown", "Alt", { altKey: true });
    key("keydown", "Meta", { altKey: true, metaKey: true });
    key("keydown", "ArrowRight", { altKey: true, metaKey: true });
    act(() => vi.advanceTimersByTime(ALT_HOLD_DELAY_MS * 2));
    expect(result.current).toBe(false);
    key("keyup", "ArrowRight", { altKey: true, metaKey: true });
    key("keydown", "Alt", { altKey: true });
    act(() => vi.advanceTimersByTime(ALT_HOLD_DELAY_MS * 2));
    expect(result.current).toBe(false);
    key("keyup", "Alt");
    key("keydown", "Alt", { altKey: true });
    act(() => vi.advanceTimersByTime(ALT_HOLD_DELAY_MS));
    expect(result.current).toBe(true);
  });

  it("a hotkey while the paths are shown hides them", () => {
    const { result } = renderHook(() => useAltHeld());
    key("keydown", "Alt", { altKey: true });
    act(() => vi.advanceTimersByTime(ALT_HOLD_DELAY_MS));
    expect(result.current).toBe(true);
    key("keydown", "Meta", { altKey: true, metaKey: true });
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(ALT_HOLD_DELAY_MS * 2));
    expect(result.current).toBe(false);
  });
});
