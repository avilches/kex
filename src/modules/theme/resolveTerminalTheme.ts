import { TERMINAL_THEME_AUTO } from "@/modules/settings/store";
import type { TerminalPalette, Theme, ThemeMode } from "./types";

/**
 * The palette of a theme for a mode. A theme with no terminal palette in this
 * mode lends the one of its other mode: a dark terminal on a light theme is
 * fine. Surface colors the palette leaves out default to the UI colors of the
 * variant it comes from, as they do when that theme is active, so they never
 * fall back to the current app theme's.
 */
function paletteOf(theme: Theme | undefined, mode: ThemeMode): TerminalPalette | undefined {
  if (!theme) return undefined;
  const own = theme.variants[mode];
  const other = theme.variants[mode === "dark" ? "light" : "dark"];
  const variant = own?.terminal ? own : other?.terminal ? other : undefined;
  const terminal = variant?.terminal;
  if (!variant || !terminal) return undefined;
  const c = variant.colors;
  return {
    ...terminal,
    background: terminal.background ?? c?.background,
    foreground: terminal.foreground ?? c?.foreground,
    cursor: terminal.cursor ?? c?.foreground,
    cursorAccent: terminal.cursorAccent ?? c?.background,
    selection: terminal.selection ?? c?.accent,
  };
}

/**
 * Terminal palette to apply. "auto" uses the app theme's own; a concrete id
 * borrows that theme's. An unknown id (a deleted custom theme) or a theme with
 * no palette at all falls back to the app theme's.
 */
export function resolveTerminalPalette(
  pref: string,
  appTheme: Theme,
  catalog: Theme[],
  mode: ThemeMode,
): TerminalPalette | undefined {
  if (pref !== TERMINAL_THEME_AUTO) {
    const borrowed = paletteOf(
      catalog.find((t) => t.id === pref),
      mode,
    );
    if (borrowed) return borrowed;
  }
  return paletteOf(appTheme, mode);
}

export type TerminalThemeOption = { id: string; name: string };

/** Catalog entries that carry a terminal palette in some mode. */
export function terminalThemeOptions(
  catalog: Theme[],
  mode: ThemeMode,
): TerminalThemeOption[] {
  return catalog
    .filter((t) => paletteOf(t, mode)?.ansi !== undefined)
    .map((t) => ({ id: t.id, name: t.name }));
}
