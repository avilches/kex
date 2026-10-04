import { describe, expect, it } from "vitest";
import { EDITOR_THEME_MODE, isEditorThemeId } from "@/modules/settings/store";
import { contrastRatio } from "../readableColors";
import { resolveTerminalPalette } from "../resolveTerminalTheme";
import { listBuiltinThemes } from "./index";

const rgb = (hex: string | undefined): [number, number, number] => {
  expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/);
  return [1, 3, 5].map((i) => parseInt(hex!.slice(i, i + 2), 16)) as [number, number, number];
};

describe("built-in themes", () => {
  it.each(listBuiltinThemes().map((t) => [t.id, t] as const))(
    "%s defines its colors in both dark and light",
    (_id, theme) => {
      expect(theme.variants.dark?.colors?.background).toBeTruthy();
      expect(theme.variants.light?.colors?.background).toBeTruthy();
    },
  );

  it.each(listBuiltinThemes().map((t) => [t.id, t] as const))(
    "%s pairs an existing editor theme for both modes",
    (_id, theme) => {
      expect(isEditorThemeId(theme.editorTheme?.dark)).toBe(true);
      expect(isEditorThemeId(theme.editorTheme?.light)).toBe(true);
    },
  );

  const cases = listBuiltinThemes().flatMap((t) =>
    (["dark", "light"] as const).map((mode) => [`${t.id} ${mode}`, t, mode] as const),
  );

  it.each(cases)("%s resolves a terminal palette with readable text and cursor", (_id, theme, mode) => {
    const p = resolveTerminalPalette("auto", theme, listBuiltinThemes(), mode);
    const bg = rgb(p?.background);
    expect(contrastRatio(rgb(p?.foreground), bg)).toBeGreaterThanOrEqual(4);
    expect(contrastRatio(rgb(p?.cursor), bg)).toBeGreaterThanOrEqual(3);
  });

  it.each(cases)("%s pairs an editor theme of the same brightness as the mode", (_id, theme, mode) => {
    const paired = theme.editorTheme?.[mode];
    expect(isEditorThemeId(paired)).toBe(true);
    if (isEditorThemeId(paired)) expect(EDITOR_THEME_MODE[paired]).toBe(mode);
  });

  it.each(cases)("%s defines its own terminal palette, with 16 colors, of the mode's brightness", (_id, theme, mode) => {
    const variant = theme.variants[mode];
    expect(variant?.terminal?.ansi).toHaveLength(16);
    const bg = rgb(variant?.terminal?.background ?? variant?.colors?.background);
    const white = contrastRatio(bg, [255, 255, 255]);
    const black = contrastRatio(bg, [0, 0, 0]);
    expect(mode === "dark" ? white > black : black > white).toBe(true);
  });
});
