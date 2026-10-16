import { describe, expect, test } from "vitest";
import { colorMode, noteSurface, noteSurfaceKind, terminalNoteSurface, variantNoteSurface } from "./noteSurface";
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

  test("accepts the rgb() form that getComputedStyle returns", () => {
    const n = noteSurface("rgb(26, 27, 38)", "rgb(192, 202, 245)")!;
    expect(n.background).toBe(noteSurface("#1a1b26", "#c0caf5")!.background);
  });

  test("picks a readable text color when the theme defines none", () => {
    const dark = noteSurface("#2b2b2b", undefined)!;
    const light = noteSurface("#ffffff", undefined)!;
    expect(contrastRatio(rgb(dark.foreground), rgb(dark.background))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(rgb(light.foreground), rgb(light.background))).toBeGreaterThanOrEqual(4.5);
    expect(dark.foreground).not.toBe(light.foreground);
  });

  test("an override replaces the built-in color and amount", () => {
    const over = noteSurface("#2b2b2b", "#fafafa", false, { color: "#ff0000", amount: 1 })!;
    expect(over.background).toBe("#ff0000");
  });

  test("returns null for a color it cannot parse", () => {
    expect(noteSurface("transparent", "#ffffff")).toBeNull();
  });

  test("text stays readable on every built-in theme and mode", () => {
    for (const theme of listBuiltinThemes()) {
      for (const mode of ["light", "dark"] as const) {
        const v = theme.variants[mode];
        const bg = v?.editor?.background ?? v?.colors?.background;
        const fg = v?.editor?.foreground ?? v?.colors?.foreground;
        if (!bg || !fg) continue;
        const n = noteSurface(bg, fg, v?.noteStrong, v?.noteTint)!;
        expect(contrastRatio(rgb(n.foreground), rgb(n.background)), `${theme.id} ${mode}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("variantNoteSurface", () => {
  test("uses the variant's editor surface, falling back to the UI colors", () => {
    const withEditor = variantNoteSurface({ editor: { background: "#2b2b2b", foreground: "#a9b7c6" } })!;
    const withColors = variantNoteSurface({ colors: { background: "#2b2b2b", foreground: "#a9b7c6" } })!;
    expect(withEditor.background).toBe(withColors.background);
    expect(withColors.background).toBe(noteSurface("#2b2b2b", "#a9b7c6")!.background);
  });

  test("an explicit editor surface wins over the variant's own", () => {
    const over = variantNoteSurface({ editor: { background: "#1a1b26" } }, { background: "#ffffff" })!;
    expect(over.background).toBe(noteSurface("#ffffff", undefined)!.background);
  });

  test("returns null when neither editor nor colors define a background", () => {
    expect(variantNoteSurface({})).toBeNull();
  });

  test("matches what applyTheme publishes on every built-in theme and mode", () => {
    for (const theme of listBuiltinThemes()) {
      for (const mode of ["light", "dark"] as const) {
        const v = theme.variants[mode];
        if (!v) continue;
        expect(variantNoteSurface(v), `${theme.id} ${mode}`).toEqual(
          noteSurface(
            v.editor?.background ?? v.colors?.background ?? "",
            v.editor?.foreground ?? v.colors?.foreground,
            v.noteStrong,
            v.noteTint,
          ),
        );
      }
    }
  });
});

describe("noteSurfaceKind", () => {
  test("terminal tabs use the terminal surface and every other tab the editor one", () => {
    expect(noteSurfaceKind({ kind: "terminal" })).toBe("terminal");
    expect(noteSurfaceKind({ kind: "editor" })).toBe("editor");
    expect(noteSurfaceKind({ kind: "browser" })).toBe("editor");
    expect(noteSurfaceKind(undefined)).toBe("editor");
  });
});

describe("terminalNoteSurface", () => {
  test("follows the terminal palette, not the editor, so each can be in its own mode", () => {
    const variant = { colors: { background: "#ffffff" }, terminal: { background: "#1a1b26", foreground: "#c0caf5" } };
    const dark = terminalNoteSurface(variant)!;
    const light = terminalNoteSurface(variant, { background: "#ffffff", foreground: "#000000" })!;
    expect(contrastRatio(rgb(dark.background), [255, 255, 255])).toBeGreaterThan(
      contrastRatio(rgb(light.background), [255, 255, 255]),
    );
  });
});

describe("colorMode", () => {
  test("reads the mode of a surface color, in hex or rgb form", () => {
    expect(colorMode("#ffffff", "dark")).toBe("light");
    expect(colorMode("#1a1b26", "light")).toBe("dark");
    expect(colorMode("rgb(250, 250, 250)", "dark")).toBe("light");
  });

  test("falls back when there is no usable color", () => {
    expect(colorMode(undefined, "light")).toBe("light");
    expect(colorMode("not a color", "dark")).toBe("dark");
  });
});
