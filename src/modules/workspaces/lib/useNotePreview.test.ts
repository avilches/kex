// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotePreview } from "./useNotePreview";

describe("useNotePreview", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows on enter and hides after the delay on leave", () => {
    const { result } = renderHook(() => useNotePreview(() => false, 100));
    act(() => result.current.show("a"));
    expect(result.current.tabId).toBe("a");
    act(() => result.current.leave("a"));
    act(() => void vi.advanceTimersByTime(99));
    expect(result.current.tabId).toBe("a");
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current.tabId).toBeNull();
  });

  it("re-entering before the delay cancels the hide", () => {
    const { result } = renderHook(() => useNotePreview(() => false, 100));
    act(() => result.current.show("a"));
    act(() => result.current.leave("a"));
    act(() => result.current.show("a"));
    act(() => void vi.advanceTimersByTime(500));
    expect(result.current.tabId).toBe("a");
  });

  it("stays while the note holds focus", () => {
    const { result } = renderHook(() => useNotePreview(() => true, 100));
    act(() => result.current.show("a"));
    act(() => result.current.leave("a"));
    act(() => void vi.advanceTimersByTime(500));
    expect(result.current.tabId).toBe("a");
  });

  it("close hides immediately", () => {
    const { result } = renderHook(() => useNotePreview(() => true, 100));
    act(() => result.current.show("a"));
    act(() => result.current.close());
    expect(result.current.tabId).toBeNull();
  });
});
