import { describe, expect, it } from "vitest";
import { claimToggle } from "./hibernateFx";

describe("claimToggle", () => {
  it("rejects a second toggle of the same workspace while its transition runs", () => {
    expect(claimToggle("ws-a", 10_000)).toBe(true);
    expect(claimToggle("ws-a", 10_500)).toBe(false);
    expect(claimToggle("ws-a", 11_400)).toBe(true);
  });

  it("does not block other workspaces", () => {
    expect(claimToggle("ws-b", 20_000)).toBe(true);
    expect(claimToggle("ws-c", 20_100)).toBe(true);
  });
});
