import { describe, expect, it } from "vitest";
import { snapZoom, stepZoom } from "@/lib/zoomLevels";

describe("zoomLevels", () => {
  it("snaps arbitrary values to the nearest level", () => {
    expect(snapZoom(0.5)).toBe(0.95);
    expect(snapZoom(1.02)).toBe(1.0);
    expect(snapZoom(1.04)).toBe(1.05);
    expect(snapZoom(2)).toBe(1.1);
  });

  it("steps between levels and clamps at the ends", () => {
    expect(stepZoom(1.05, 1)).toBe(1.1);
    expect(stepZoom(1.1, 1)).toBe(1.1);
    expect(stepZoom(1.0, -1)).toBe(0.95);
    expect(stepZoom(0.95, -1)).toBe(0.95);
  });

  it("steps from an off-grid value relative to its nearest level", () => {
    expect(stepZoom(1.3, -1)).toBe(1.05);
    expect(stepZoom(0.7, 1)).toBe(1.0);
  });
});
