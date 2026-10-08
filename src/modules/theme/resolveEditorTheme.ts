import {
  EDITOR_ROW_PREFIX,
  EDITOR_THEME_AUTO,
  isEditorRowPref,
  isEditorThemeId,
  type EditorRowPref,
  type EditorThemeId,
  type EditorThemePref,
} from "@/modules/settings/store";
import { getBuiltinTheme, getDefaultTheme } from "./themes";
import type { Theme, ThemeMode } from "./types";

const FALLBACK: Record<"light" | "dark", EditorThemeId> = {
  light: "github-light",
  dark: "atomone",
};

export function formatEditorRowPref(id: string, mode?: ThemeMode): EditorRowPref {
  return `${EDITOR_ROW_PREFIX}${mode ? `${id}@${mode}` : id}`;
}

export function parseEditorRowPref(
  pref: EditorThemePref,
): { id: string; mode?: ThemeMode } | undefined {
  if (!isEditorRowPref(pref)) return undefined;
  const body = pref.slice(EDITOR_ROW_PREFIX.length);
  const i = body.lastIndexOf("@");
  if (i > 0) {
    const mode = body.slice(i + 1);
    if (mode === "dark" || mode === "light") return { id: body.slice(0, i), mode };
  }
  return { id: body };
}

/**
 * Resolve the concrete CodeMirror theme to apply. In "auto" the editor follows
 * the active app theme's editorTheme pairing for the current mode (live, so it
 * never goes stale). A row pref follows the pairing of that app theme the same
 * way, in the current mode unless it pins one. An explicit editor theme always
 * wins.
 */
export function resolveEditorThemeId(
  pref: EditorThemePref,
  themeId: string,
  customThemes: Theme[],
  mode: ThemeMode,
): EditorThemeId {
  const row = parseEditorRowPref(pref);
  if (row) {
    return resolveEditorThemeId(EDITOR_THEME_AUTO, row.id, customThemes, row.mode ?? mode);
  }
  if (pref !== EDITOR_THEME_AUTO) return pref as EditorThemeId;
  const theme =
    customThemes.find((t) => t.id === themeId) ??
    getBuiltinTheme(themeId) ??
    getDefaultTheme();
  const mapped =
    theme.editorTheme?.[mode] ??
    theme.editorTheme?.dark ??
    theme.editorTheme?.light;
  return isEditorThemeId(mapped) ? mapped : FALLBACK[mode];
}
