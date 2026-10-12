import { afterEach, describe, expect, it, vi } from "vitest";
import { getPendingRestore, setPendingRestore, subscribePendingRestore } from "./pendingRestore";

const block = { reason: "r", dir: "/w", command: "claude" };

afterEach(() => {
  setPendingRestore("a", null);
  setPendingRestore("b", null);
});

describe("pendingRestore", () => {
  it("returns null when empty and the same reference while unchanged", () => {
    expect(getPendingRestore("a")).toBeNull();
    setPendingRestore("a", block);
    expect(getPendingRestore("a")).toBe(block);
    expect(getPendingRestore("a")).toBe(getPendingRestore("a"));
  });

  it("notifies only subscribers of that leaf", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribePendingRestore("a", a);
    subscribePendingRestore("b", b);
    setPendingRestore("a", block);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it("does not notify when clearing an already empty leaf", () => {
    const a = vi.fn();
    subscribePendingRestore("a", a);
    setPendingRestore("a", null);
    expect(a).not.toHaveBeenCalled();
    setPendingRestore("a", block);
    setPendingRestore("a", null);
    expect(a).toHaveBeenCalledTimes(2);
    expect(getPendingRestore("a")).toBeNull();
  });

  it("stops notifying after unsubscribe", () => {
    const a = vi.fn();
    const off = subscribePendingRestore("a", a);
    off();
    setPendingRestore("a", block);
    expect(a).not.toHaveBeenCalled();
  });
});
