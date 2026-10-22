import { describe, expect, it } from "vitest";
import {
  clampPaletteWidth,
  DEFAULT_PALETTE_WIDTH,
  MAX_PALETTE_WIDTH,
  MIN_PALETTE_WIDTH,
  paletteWidthCss,
  widthAfterDrag,
} from "./paletteWidth";

describe("clampPaletteWidth", () => {
  it("falls back to the default for anything that is not a finite number", () => {
    for (const bad of [undefined, null, "900", Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(clampPaletteWidth(bad)).toBe(DEFAULT_PALETTE_WIDTH);
    }
  });

  it("keeps the width inside the bounds and rounds it", () => {
    expect(clampPaletteWidth(10)).toBe(MIN_PALETTE_WIDTH);
    expect(clampPaletteWidth(99999)).toBe(MAX_PALETTE_WIDTH);
    expect(clampPaletteWidth(700.6)).toBe(701);
  });
});

describe("widthAfterDrag", () => {
  it("moves both sides of the centered dialog: twice the pointer distance", () => {
    expect(widthAfterDrag(800, 50, "right")).toBe(900);
    expect(widthAfterDrag(800, -50, "right")).toBe(700);
  });

  it("grows when the left edge is dragged outwards", () => {
    expect(widthAfterDrag(800, -50, "left")).toBe(900);
    expect(widthAfterDrag(800, 50, "left")).toBe(700);
  });

  it("never leaves the bounds", () => {
    expect(widthAfterDrag(800, 5000, "right")).toBe(MAX_PALETTE_WIDTH);
    expect(widthAfterDrag(800, -5000, "right")).toBe(MIN_PALETTE_WIDTH);
  });
});

describe("paletteWidthCss", () => {
  it("never exceeds the window minus a gutter", () => {
    expect(paletteWidthCss(900)).toBe("min(900px, calc(100vw - 32px))");
  });
});
