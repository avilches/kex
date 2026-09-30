import { describe, expect, it } from "vitest";
import { isEditorThemeId } from "@/modules/settings/store";
import { listBuiltinThemes } from "./index";

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
});
