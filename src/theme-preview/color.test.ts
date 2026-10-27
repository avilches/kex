// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { hexToRgb, shiftHsl } from "./color";

describe("shiftHsl", () => {
  it("returns the same color when nothing moves", () => {
    expect(shiftHsl("#2b2b2b", 0, 0, 0)).toBe("#2b2b2b");
    expect(shiftHsl("#3c6fed", 0, 0, 0)).toBe("#3c6fed");
  });

  it("keeps a trailing alpha byte", () => {
    expect(shiftHsl("#3c6fed80", 5, 0, 0).endsWith("80")).toBe(true);
    expect(shiftHsl("#3c6fed", 5, 0, 0)).toHaveLength(7);
  });

  it("lightens and darkens", () => {
    const base = hexToRgb("#808080")!;
    expect(hexToRgb(shiftHsl("#808080", 10, 0, 0))!.r).toBeGreaterThan(base.r);
    expect(hexToRgb(shiftHsl("#808080", -10, 0, 0))!.r).toBeLessThan(base.r);
  });

  it("tints a grey toward blue once saturation is raised", () => {
    const tinted = hexToRgb(shiftHsl("#808080", 0, 0, 10))!;
    expect(tinted.b).toBeGreaterThan(tinted.r);
  });

  it("leaves a grey grey while saturation stays at zero", () => {
    const rgb = hexToRgb(shiftHsl("#808080", 0, 30, 0))!;
    expect(rgb.r).toBe(rgb.g);
    expect(rgb.g).toBe(rgb.b);
  });

  it("rotates the hue of a saturated color", () => {
    const rgb = hexToRgb(shiftHsl("#ff0000", 0, 120, 0))!;
    expect(rgb.g).toBeGreaterThan(rgb.r);
  });
});
