import { describe, expect, it } from "vitest";
import { colorToCss, paletteFromTheme, runCss, type LinesPalette } from "./hibernateLinesStyle";

const palette: LinesPalette = {
  ansi: Array.from({ length: 16 }, (_, i) => `#0000${i.toString(16).padStart(2, "0")}`),
  foreground: "#eeeeee",
  background: "#111111",
};

describe("colorToCss", () => {
  it("takes the first 16 colours from the theme", () => {
    expect(colorToCss(1, palette)).toBe("#000001");
    expect(colorToCss(15, palette)).toBe("#00000f");
  });

  it("computes the 6x6x6 cube and the grey ramp like xterm", () => {
    expect(colorToCss(16, palette)).toBe("#000000");
    expect(colorToCss(196, palette)).toBe("#ff0000");
    expect(colorToCss(231, palette)).toBe("#ffffff");
    expect(colorToCss(232, palette)).toBe("#080808");
    expect(colorToCss(255, palette)).toBe("#eeeeee");
  });

  it("passes truecolor through", () => {
    expect(colorToCss("#0a141e", palette)).toBe("#0a141e");
  });
});

describe("runCss", () => {
  it("maps the text attributes", () => {
    expect(runCss({ bold: true, italic: true, underline: true, strike: true, dim: true }, palette)).toEqual({
      fontWeight: 700,
      fontStyle: "italic",
      textDecoration: "underline line-through",
      opacity: 0.6,
    });
  });

  it("swaps the colours on inverse, using the theme for a side left at its default", () => {
    expect(runCss({ inverse: true }, palette)).toEqual({ color: "#111111", backgroundColor: "#eeeeee" });
    expect(runCss({ inverse: true, fg: 2, bg: 4 }, palette)).toEqual({ color: "#000004", backgroundColor: "#000002" });
  });

  it("leaves a plain run without styles", () => {
    expect(runCss({}, palette)).toEqual({});
  });
});

describe("paletteFromTheme", () => {
  it("orders the 16 colours and falls back to the foreground for a missing one", () => {
    const p = paletteFromTheme({ foreground: "#fff", background: "#000", black: "#1", brightWhite: "#2" });
    expect(p.ansi).toHaveLength(16);
    expect(p.ansi[0]).toBe("#1");
    expect(p.ansi[15]).toBe("#2");
    expect(p.ansi[7]).toBe("#fff");
    expect(p.background).toBe("#000");
  });
});
