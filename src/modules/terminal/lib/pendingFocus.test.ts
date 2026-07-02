import { describe, expect, it, vi } from "vitest";

import { shouldFireOnRegister } from "./pendingFocus";

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
