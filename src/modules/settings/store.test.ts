import { describe, expect, it } from "vitest";
import {
  clampToStep,
  LETTER_SPACING_MIN,
  LETTER_SPACING_MAX,
  LETTER_SPACING_STEP,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_STEP,
  parseScmViewMode,
  DEFAULT_PREFERENCES,
} from "./store";

describe("clampToStep", () => {
  it("snaps to the nearest step", () => {
    expect(clampToStep(14.3, 8, 18, 0.5, 14)).toBe(14.5);
    expect(clampToStep(14.1, 8, 18, 0.5, 14)).toBe(14);
  });

  it("clamps below min and above max", () => {
    expect(clampToStep(-99, LETTER_SPACING_MIN, LETTER_SPACING_MAX, LETTER_SPACING_STEP, 0)).toBe(
      LETTER_SPACING_MIN,
    );
    expect(clampToStep(99, LETTER_SPACING_MIN, LETTER_SPACING_MAX, LETTER_SPACING_STEP, 0)).toBe(
      LETTER_SPACING_MAX,
    );
  });

  it("strips binary float drift", () => {
    // 0.1 * 12 = 1.2000000000000002 without the rounding guard.
    expect(clampToStep(1.2, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX, LINE_HEIGHT_STEP, 1)).toBe(1.2);
    expect(clampToStep(1.25, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX, LINE_HEIGHT_STEP, 1)).toBe(1.3);
  });

  it("falls back when the value is not finite", () => {
    expect(clampToStep(Number.NaN, 8, 18, 0.5, 14)).toBe(14);
    expect(clampToStep(Number.POSITIVE_INFINITY, 8, 18, 0.5, 13)).toBe(13);
  });
});

describe("scmViewMode", () => {
  it("defaults to tree", () => {
    expect(DEFAULT_PREFERENCES.scmViewMode).toBe("tree");
  });

  it("parses only the exact 'list' string as list", () => {
    expect(parseScmViewMode("tree")).toBe("tree");
    expect(parseScmViewMode("list")).toBe("list");
    expect(parseScmViewMode("LIST")).toBe("tree");
    expect(parseScmViewMode(undefined)).toBe("tree");
    expect(parseScmViewMode(null)).toBe("tree");
    expect(parseScmViewMode(42)).toBe("tree");
  });
});
