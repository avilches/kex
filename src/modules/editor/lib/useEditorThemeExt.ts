import { usePreferencesStore } from "@/modules/settings/preferences";
import { EDITOR_THEME_AUTO } from "@/modules/settings/store";
import { resolveEditorThemeId, useTheme } from "@/modules/theme";
import type { ThemeMode } from "@/modules/theme/types";
import type { Extension } from "@codemirror/state";
import { useMemo } from "react";
import { EDITOR_THEME_EXT } from "./themes";

/**
 * Resolves the active CodeMirror theme extension, honoring the "auto" pairing.
 * `forceMode` skips the editor preference and takes the app theme's pairing for that mode.
 */
export function useEditorThemeExt(forceMode?: ThemeMode): Extension {
  const pref = usePreferencesStore((s) => s.editorTheme);
  const { themeId, customThemes, resolvedMode } = useTheme();
  return useMemo(() => {
    const id = forceMode
      ? resolveEditorThemeId(EDITOR_THEME_AUTO, themeId, customThemes, forceMode)
      : resolveEditorThemeId(pref, themeId, customThemes, resolvedMode);
    return EDITOR_THEME_EXT[id] ?? EDITOR_THEME_EXT.atomone;
  }, [pref, themeId, customThemes, resolvedMode, forceMode]);
}
