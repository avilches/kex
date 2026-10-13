import { describe, expect, it } from "vitest";
import { autofocusDecision } from "./autofocusDecision";

describe("autofocusDecision", () => {
  it("never fires on the first observation", () => {
    expect(autofocusDecision(undefined, { workspaceId: "a", signal: "t1|" })).toBe(false);
  });

  it("fires when the signal changes inside the same workspace", () => {
    expect(
      autofocusDecision({ workspaceId: "a", signal: "t1|" }, { workspaceId: "a", signal: "t2|" }),
    ).toBe(true);
  });

  it("does not fire when the workspace changed, even with a new signal", () => {
    expect(
      autofocusDecision({ workspaceId: "a", signal: "t1|" }, { workspaceId: "b", signal: "t9|" }),
    ).toBe(false);
  });

  it("does not fire when there is no signal or it did not change", () => {
    expect(autofocusDecision({ workspaceId: "a", signal: "t1|" }, { workspaceId: "a", signal: null })).toBe(false);
    expect(autofocusDecision({ workspaceId: "a", signal: "t1|" }, { workspaceId: "a", signal: "t1|" })).toBe(false);
  });
});
