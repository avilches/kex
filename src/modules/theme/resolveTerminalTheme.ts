import { TERMINAL_THEME_AUTO } from "@/modules/settings/store";
import type { TerminalPalette, Theme, ThemeMode } from "./types";

/**
 * The palette of a theme for a mode. A theme with no terminal palette in this
 * mode lends the one of its other mode: a dark terminal on a light theme is
 * fine. Surface colors the palette leaves out default to the UI colors of the
 * variant it comes from and, when that variant defines none either, to fixed
 * values of that variant's own mode, so they never resolve against the current
 * app theme's (a dark palette lent to light mode would get dark text).
 */
const MODE_DEFAULTS: Record<ThemeMode, { background: string; foreground: string; selection: string }> = {
  dark: { background: "#0a0a0a", foreground: "#fafafa", selection: "rgba(255,255,255,0.2)" },
  light: { background: "#ffffff", foreground: "#0a0a0a", selection: "rgba(0,0,0,0.15)" },
};

export function paletteOf(theme: Theme | undefined, mode: ThemeMode): TerminalPalette | undefined {
  if (!theme) return undefined;
  const own = theme.variants[mode];
  const otherMode: ThemeMode = mode === "dark" ? "light" : "dark";
  const other = theme.variants[otherMode];
  const variant = own?.terminal ? own : other?.terminal ? other : undefined;
  const terminal = variant?.terminal;
  if (!variant || !terminal) return undefined;
  const c = variant.colors;
  const d = MODE_DEFAULTS[own?.terminal ? mode : otherMode];
  const background = terminal.background ?? c?.background ?? d.background;
  const foreground = terminal.foreground ?? c?.foreground ?? d.foreground;
  return {
    ...terminal,
    background,
    foreground,
    cursor: terminal.cursor ?? foreground,
    cursorAccent: terminal.cursorAccent ?? background,
    selection: terminal.selection ?? c?.accent ?? d.selection,
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
