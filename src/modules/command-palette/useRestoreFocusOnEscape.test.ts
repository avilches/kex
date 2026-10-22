// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRestoreFocusOnEscape } from "./useRestoreFocusOnEscape";

const closeEvent = () => new Event("focus", { cancelable: true });

describe("useRestoreFocusOnEscape", () => {
  it("gives the focus back when the palette was closed with Escape", () => {
    const restore = vi.fn();
    const { result } = renderHook(() => useRestoreFocusOnEscape(restore));
    result.current.onEscapeKeyDown();
    result.current.onCloseAutoFocus(closeEvent());
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it("leaves the focus alone when it was closed any other way", () => {
    const restore = vi.fn();
    const { result } = renderHook(() => useRestoreFocusOnEscape(restore));
    result.current.onCloseAutoFocus(closeEvent());
    expect(restore).not.toHaveBeenCalled();
  });

  it("restores once per Escape, not on the next close", () => {
    const restore = vi.fn();
    const { result } = renderHook(() => useRestoreFocusOnEscape(restore));
    result.current.onEscapeKeyDown();
    result.current.onCloseAutoFocus(closeEvent());
    result.current.onCloseAutoFocus(closeEvent());
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it("stops the default focus return to a trigger that does not exist", () => {
    const { result } = renderHook(() => useRestoreFocusOnEscape(vi.fn()));
    const event = closeEvent();
    result.current.onCloseAutoFocus(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
