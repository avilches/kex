import { describe, expect, it } from "vitest";
import { DEFAULT_ACTION_ICON_SIZE, snapActionIconSize } from "./actionIconSizes";

describe("snapActionIconSize", () => {
  it("keeps an offered size", () => {
    expect(snapActionIconSize(24)).toBe(24);
  });

  it("snaps anything else to the nearest offered size", () => {
    expect(snapActionIconSize(5)).toBe(16);
    expect(snapActionIconSize(100)).toBe(28);
    expect(snapActionIconSize(21.2)).toBe(22);
  });

  it("falls back to the default for a value that is not a number", () => {
    expect(snapActionIconSize(undefined)).toBe(DEFAULT_ACTION_ICON_SIZE);
    expect(snapActionIconSize("big")).toBe(DEFAULT_ACTION_ICON_SIZE);
    expect(snapActionIconSize(Number.NaN)).toBe(DEFAULT_ACTION_ICON_SIZE);
  });
});
