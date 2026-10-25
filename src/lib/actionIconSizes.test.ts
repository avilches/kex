import { describe, expect, it } from "vitest";
import { DEFAULT_ACTION_ICON_SIZE, snapActionIconSize } from "./actionIconSizes";

describe("snapActionIconSize", () => {
  it("keeps a size inside the range", () => {
    expect(snapActionIconSize(24)).toBe(24);
  });

  it("rounds to whole pixels and clamps to the range", () => {
    expect(snapActionIconSize(21.4)).toBe(21);
    expect(snapActionIconSize(5)).toBe(14);
    expect(snapActionIconSize(100)).toBe(32);
  });

  it("falls back to the default for a value that is not a number", () => {
    expect(snapActionIconSize(undefined)).toBe(DEFAULT_ACTION_ICON_SIZE);
    expect(snapActionIconSize("big")).toBe(DEFAULT_ACTION_ICON_SIZE);
    expect(snapActionIconSize(Number.NaN)).toBe(DEFAULT_ACTION_ICON_SIZE);
  });
});
