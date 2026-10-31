import { describe, expect, it } from "vitest";
import { indicatorToKeep, sleepIndicator } from "./hibernateIndicator";

describe("indicatorToKeep", () => {
  it("keeps attention", () => {
    expect(indicatorToKeep({ status: "attention" })).toBe("attention");
  });

  it("keeps an error for an interrupted or failed-restore session", () => {
    expect(indicatorToKeep({ status: "idle", interrupted: true })).toBe("error");
    expect(indicatorToKeep({ status: "attention", restoreError: true })).toBe("error");
  });

  it("keeps nothing for working, idle or no session", () => {
    expect(indicatorToKeep({ status: "working" })).toBeUndefined();
    expect(indicatorToKeep({ status: "idle" })).toBeUndefined();
    expect(indicatorToKeep(undefined)).toBeUndefined();
  });
});

describe("sleepIndicator", () => {
  it("reads it from the hibernation", () => {
    expect(sleepIndicator({ hibernation: { indicator: "error" } })).toBe("error");
    expect(sleepIndicator({ hibernation: {} })).toBeNull();
    expect(sleepIndicator({})).toBeNull();
  });
});
