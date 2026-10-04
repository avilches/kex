import { describe, expect, test } from "vitest";
import { listBuiltinThemes } from "./themes";
import { contrastRatio, withReadableText } from "./readableColors";
import type { ThemeColors } from "./types";

const rgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];

describe("withReadableText", () => {
  test("leaves already readable colors untouched", () => {
    const c: ThemeColors = {
      background: "#ffffff",
      muted: "#f0f0f0",
      mutedForeground: "#333333",
    };
    expect(withReadableText(c)).toEqual(c);
  });

  test("darkens a faint muted foreground on a light background", () => {
    const out = withReadableText({
      background: "#fdf6e3",
      muted: "#efebd4",
      mutedForeground: "#829181",
    });
    expect(contrastRatio(rgb(out.mutedForeground!), rgb("#efebd4"))).toBeGreaterThanOrEqual(4.5);
    expect(out.mutedForeground).not.toBe("#829181");
  });

  test("light text on a mid-tone button stays light instead of flipping to black", () => {
    const out = withReadableText({
      primary: "#3c6fed",
      primaryForeground: "#f9fbfb",
    });
    expect(out.primaryForeground).toBe("#ffffff");
  });

  test("skips tokens that are not 6-digit hex", () => {
    const c: ThemeColors = {
      background: "#000000",
      muted: "rgba(255,255,255,0.1)",
      mutedForeground: "#222222",
    };
    expect(withReadableText(c)).toEqual(c);
  });

  test("every built-in variant ends up readable", () => {
    for (const theme of listBuiltinThemes()) {
      for (const variant of Object.values(theme.variants)) {
        const c = variant.colors ? withReadableText(variant.colors) : null;
        if (!c) continue;
        const pairs: [string | undefined, string | undefined, number][] = [
          [c.mutedForeground, c.background, 4.5],
          [c.mutedForeground, c.muted, 4.5],
          [c.primaryForeground, c.primary, 3],
        ];
        for (const [fg, bg, min] of pairs) {
          if (!fg || !bg || !/^#[0-9a-f]{6}$/i.test(fg) || !/^#[0-9a-f]{6}$/i.test(bg)) continue;
          expect(contrastRatio(rgb(fg), rgb(bg))).toBeGreaterThanOrEqual(min);
        }
      }
    }
  });
});
