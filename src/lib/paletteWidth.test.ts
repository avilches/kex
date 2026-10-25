import { describe, expect, it } from "vitest";
import {
  clampPaletteWidth,
  DEFAULT_PALETTE_WIDTH,
  MAX_PALETTE_WIDTH,
  MIN_PALETTE_WIDTH,
  paletteBox,
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

describe("paletteBox", () => {
  const onDevicePixels = (value: number, ratio: number) => Math.abs(value * ratio - Math.round(value * ratio)) < 1e-9;

  it("never exceeds the window minus a gutter", () => {
    expect(paletteBox(900, 800, 600, 1).width).toBe(768);
    expect(paletteBox(500, 800, 600, 1).width).toBe(500);
  });

  it("centers on whole pixels in a window of odd size", () => {
    const box = paletteBox(861, 1203, 801, 1);
    expect(box.width).toBe(860);
    expect(box.left).toBe(172);
    expect(box.top).toBe(267);
  });

  it.each([1, 1.25, 1.5, 2, 2.5])("keeps width, left and top on whole device pixels at %s", (ratio) => {
    for (const [w, vw, vh] of [[860, 1203, 801], [733, 1441, 877], [1400, 999, 701], [561, 1280, 720]]) {
      const box = paletteBox(w, vw, vh, ratio);
      expect(onDevicePixels(box.width, ratio)).toBe(true);
      expect(onDevicePixels(box.left, ratio)).toBe(true);
      expect(onDevicePixels(box.top, ratio)).toBe(true);
      expect(onDevicePixels(box.width / 2, ratio)).toBe(true);
    }
  });

  it("stays inside the window", () => {
    const box = paletteBox(1400, 700, 500, 1.25);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.left + box.width).toBeLessThanOrEqual(700);
  });

  it("falls back to a ratio of 1 when the browser gives none", () => {
    expect(paletteBox(860, 1200, 800, 0)).toEqual(paletteBox(860, 1200, 800, 1));
    expect(paletteBox(860, 1200, 800, Number.NaN)).toEqual(paletteBox(860, 1200, 800, 1));
  });
});
