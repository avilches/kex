import { describe, expect, it } from "vitest";
import { indicatorToKeep, sleepIndicator, titleIndicator } from "./hibernateIndicator";

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

describe("titleIndicator", () => {
  it("turns a tab named Error red and one named Warn orange, ignoring case and spaces", () => {
    expect(titleIndicator("Error")).toBe("error");
    expect(titleIndicator("  warn ")).toBe("attention");
    expect(titleIndicator("ERROR")).toBe("error");
  });

  it("leaves any other name without a dot", () => {
    expect(titleIndicator("errors")).toBeNull();
    expect(titleIndicator("api")).toBeNull();
    expect(titleIndicator(undefined)).toBeNull();
  });

  it("lets what a tab slept with win over its name", () => {
    expect(sleepIndicator({ title: "Warn", hibernation: { indicator: "error" } })).toBe("error");
    expect(sleepIndicator({ title: "Warn" })).toBe("attention");
  });
});
