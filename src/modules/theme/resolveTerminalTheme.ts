import { TERMINAL_THEME_AUTO } from "@/modules/settings/store";
import type { TerminalPalette, Theme, ThemeMode } from "./types";

/**
 * The palette a concrete choice lends to the terminal, or undefined when the
 * theme is unknown or has no terminal palette for this exact mode (a light
 * mode must never receive a dark-only palette). Surface colors the palette
 * leaves out default to the lender's own UI colors, as they do when that theme
 * is active, so they never fall back to the current app theme's.
 */
function borrowedPalette(
  id: string,
  catalog: Theme[],
  mode: ThemeMode,
): TerminalPalette | undefined {
  const variant = catalog.find((t) => t.id === id)?.variants[mode];
  const terminal = variant?.terminal;
  if (!terminal) return undefined;
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
 * Terminal palette to apply. "auto", an unknown id (a deleted custom theme) or
 * a theme without a palette for this mode all fall back to the app theme's own.
 */
export function resolveTerminalPalette(
  pref: string,
  appTheme: Theme,
  catalog: Theme[],
  mode: ThemeMode,
): TerminalPalette | undefined {
  if (pref !== TERMINAL_THEME_AUTO) {
    const borrowed = borrowedPalette(pref, catalog, mode);
    if (borrowed) return borrowed;
  }
  const variant = appTheme.variants[mode] ?? appTheme.variants.dark ?? appTheme.variants.light;
  return variant?.terminal;
}

export type TerminalThemeOption = { id: string; name: string };

/** Catalog entries that carry a terminal palette for the given mode. */
export function terminalThemeOptions(
  catalog: Theme[],
  mode: ThemeMode,
): TerminalThemeOption[] {
  return catalog
    .filter((t) => t.variants[mode]?.terminal?.ansi !== undefined)
    .map((t) => ({ id: t.id, name: t.name }));
}
