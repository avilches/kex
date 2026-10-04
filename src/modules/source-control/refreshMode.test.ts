import { describe, expect, it } from "vitest";
import {
  mergeRefreshMode,
  shouldUpgradeInflightRefresh,
  type SourceControlRefreshMode,
} from "./refreshMode";

const MODES: SourceControlRefreshMode[] = ["never", "auto", "always"];

describe("shouldUpgradeInflightRefresh", () => {
  it("upgrades never -> auto and never -> always", () => {
    expect(shouldUpgradeInflightRefresh("never", "auto")).toBe(true);
    expect(shouldUpgradeInflightRefresh("never", "always")).toBe(true);
  });

  it("upgrades auto -> always but not auto -> never", () => {
    expect(shouldUpgradeInflightRefresh("auto", "always")).toBe(true);
    expect(shouldUpgradeInflightRefresh("auto", "never")).toBe(false);
  });

  it("never upgrades once always is in flight", () => {
    expect(shouldUpgradeInflightRefresh("always", "never")).toBe(false);
    expect(shouldUpgradeInflightRefresh("always", "auto")).toBe(false);
    expect(shouldUpgradeInflightRefresh("always", "always")).toBe(false);
  });

  it("never upgrades for an equal or lesser request", () => {
    for (const mode of MODES) {
      expect(shouldUpgradeInflightRefresh(mode, mode)).toBe(false);
    }
    expect(shouldUpgradeInflightRefresh("never", "never")).toBe(false);
  });

  // Locks the exact semantics of the original inline boolean this function
  // replaced: (cur === "never" && requested !== "never") ||
  // (cur === "auto" && requested === "always").
  it("matches the original inline upgrade expression for every combination", () => {
    for (const cur of MODES) {
      for (const requested of MODES) {
        const original =
          (cur === "never" && requested !== "never") ||
          (cur === "auto" && requested === "always");
        expect(shouldUpgradeInflightRefresh(cur, requested)).toBe(original);
      }
    }
  });
});

describe("mergeRefreshMode", () => {
  it("adopts the requested mode when nothing is queued yet", () => {
    expect(mergeRefreshMode(null, "never")).toBe("never");
    expect(mergeRefreshMode(null, "auto")).toBe("auto");
    expect(mergeRefreshMode(null, "always")).toBe("always");
  });

  it("keeps the more aggressive of the two modes, in either order", () => {
    expect(mergeRefreshMode("never", "auto")).toBe("auto");
    expect(mergeRefreshMode("auto", "never")).toBe("auto");
    expect(mergeRefreshMode("auto", "always")).toBe("always");
    expect(mergeRefreshMode("always", "auto")).toBe("always");
    expect(mergeRefreshMode("never", "always")).toBe("always");
    expect(mergeRefreshMode("always", "never")).toBe("always");
  });

  it("is idempotent for equal modes", () => {
    for (const mode of MODES) {
      expect(mergeRefreshMode(mode, mode)).toBe(mode);
    }
  });
});
