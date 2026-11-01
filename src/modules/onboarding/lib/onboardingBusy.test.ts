import { describe, expect, it } from "vitest";
import { busyForOthers } from "./onboardingBusy";

describe("busyForOthers", () => {
  it("is idle while no window holds the dialog", () => {
    expect(busyForOthers(null, "w-a")).toBe(false);
  });

  it("is busy for every window except the holder", () => {
    expect(busyForOthers("w-a", "w-b")).toBe(true);
    expect(busyForOthers("w-a", "w-c")).toBe(true);
  });

  it("is not busy for the holder itself, whose dialog is already on top of the chip", () => {
    expect(busyForOthers("w-a", "w-a")).toBe(false);
  });
});
