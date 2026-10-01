import { EDITOR_THEME_LABELS } from "@/modules/settings/store";
import { resolveEditorThemeId } from "./resolveEditorTheme";
import { paletteOf } from "./resolveTerminalTheme";
import type { Theme, ThemeMode } from "./types";

export type SurfaceInfo = {
  label: string;
  /** Names of the other app themes that use the same one; empty when it is the theme's own. */
  sharedWith: string[];
};

export type ThemeSurfaceInfo = {
  editor: SurfaceInfo;
  terminal: SurfaceInfo | undefined;
};

/**
 * Which editor theme and terminal palette an app theme uses in a mode, and
 * which other themes of the catalog use the very same one.
 */
export function themeSurfaceInfo(
  theme: Theme,
  catalog: Theme[],
  mode: ThemeMode,
): ThemeSurfaceInfo {
  const others = catalog.filter((t) => t.id !== theme.id);

  const editorId = resolveEditorThemeId("auto", theme.id, catalog, mode);
  const editor: SurfaceInfo = {
    label: EDITOR_THEME_LABELS[editorId],
    sharedWith: others
      .filter((t) => resolveEditorThemeId("auto", t.id, catalog, mode) === editorId)
      .map((t) => t.name),
  };

  const palette = paletteOf(theme, mode);
  if (!palette) return { editor, terminal: undefined };
  const key = JSON.stringify(palette);
  return {
    editor,
    terminal: {
      label: theme.name,
      sharedWith: others
        .filter((t) => JSON.stringify(paletteOf(t, mode)) === key)
        .map((t) => t.name),
    },
  };
}
