import { EDITOR_THEME_AUTO } from "@/modules/settings/store";
import type { EditorSurface, Theme, ThemeMode } from "./types";

/**
 * Background and text color the editor surface should take. "auto" follows the
 * app theme's own editor surface; an explicit editor theme lends its own, so the
 * editor and its path bar never keep the UI background under a themed editor.
 * undefined means no override: the CSS defaults (the UI colors) apply.
 */
export function resolveEditorSurface(
  pref: string,
  appTheme: Theme,
  mode: ThemeMode,
  cmSurface: (id: string) => EditorSurface | undefined,
): EditorSurface | undefined {
  if (pref !== EDITOR_THEME_AUTO) return cmSurface(pref);
  const variant = appTheme.variants[mode] ?? appTheme.variants.dark ?? appTheme.variants.light;
  return variant?.editor;
}
