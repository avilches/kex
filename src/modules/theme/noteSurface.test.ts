import { describe, expect, test } from "vitest";
import { noteSurface } from "./noteSurface";
import { contrastRatio } from "./readableColors";
import { listBuiltinThemes } from "./themes";

const rgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

describe("noteSurface", () => {
  test("pushes a neutral dark surface toward yellow", () => {
    const n = noteSurface("#1a1b26", "#c0caf5")!;
    const [r, g, b] = rgb(n.background);
    expect(r).toBeGreaterThan(rgb("#1a1b26")[0]);
    expect(g).toBeGreaterThan(b);
  });

  test("strong is more yellow than normal", () => {
    const a = rgb(noteSurface("#1f1f28", "#dcd7ba")!.background);
    const b = rgb(noteSurface("#1f1f28", "#dcd7ba", true)!.background);
    expect(b[0] - b[2]).toBeGreaterThan(a[0] - a[2]);
  });

  test("returns null for non-hex input", () => {
    expect(noteSurface("rgb(0,0,0)", "#ffffff")).toBeNull();
  });

  test("text stays readable on every built-in theme and mode", () => {
    for (const theme of listBuiltinThemes()) {
      for (const mode of ["light", "dark"] as const) {
        const v = theme.variants[mode];
        const bg = v?.editor?.background ?? v?.colors?.background;
        const fg = v?.editor?.foreground ?? v?.colors?.foreground;
        if (!bg || !fg) continue;
        const n = noteSurface(bg, fg, v?.noteStrong)!;
        expect(contrastRatio(rgb(n.foreground), rgb(n.background)), `${theme.id} ${mode}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
