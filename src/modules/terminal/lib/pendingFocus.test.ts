import { describe, expect, it, vi } from "vitest";

import { shouldFireOnRegister, tryRequestFocus } from "./pendingFocus";

describe("tryRequestFocus", () => {
  it("calls the callback and returns true when already registered", () => {
    const focus = vi.fn();
    expect(tryRequestFocus(focus)).toBe(true);
    expect(focus).toHaveBeenCalledOnce();
  });

  it("returns false without throwing when not registered yet", () => {
    expect(tryRequestFocus(null)).toBe(false);
  });
});

describe("shouldFireOnRegister", () => {
  it("fires when a request is pending and a callback registers", () => {
    expect(shouldFireOnRegister(vi.fn(), true)).toBe(true);
  });

  it("does not fire when nothing is pending", () => {
    expect(shouldFireOnRegister(vi.fn(), false)).toBe(false);
  });

  it("does not fire when unregistering (fn is null), even if pending", () => {
    expect(shouldFireOnRegister(null, true)).toBe(false);
  });
});
