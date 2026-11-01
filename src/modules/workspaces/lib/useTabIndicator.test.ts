// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setRunningCommand } from "./terminalEphemeralStore";
import { useTabIndicator } from "./useTabIndicator";

afterEach(() => setRunningCommand("t1", null));

describe("useTabIndicator", () => {
  it("is the spinner while the terminal runs a command and nothing once it ends", () => {
    const { result } = renderHook(() => useTabIndicator("t1", null));
    expect(result.current).toBeNull();
    act(() => setRunningCommand("t1", "pnpm dev"));
    expect(result.current).toBe("working");
    act(() => setRunningCommand("t1", null));
    expect(result.current).toBeNull();
  });

  it("keeps the fallback over a running command", () => {
    act(() => setRunningCommand("t1", "top"));
    const { result } = renderHook(() => useTabIndicator("t1", "attention"));
    expect(result.current).toBe("attention");
  });
});
