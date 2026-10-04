import { readTerminalTokens } from "@/styles/tokens";
import type { ITheme } from "@xterm/xterm";

type Mode = "light" | "dark";

/**
 * Programs pick colors for a dark terminal (white, light yellow), which vanish
 * on a light background. xterm lifts a foreground to this ratio; dark keeps the
 * palette exactly as the theme defines it.
 */
export function minimumContrastRatioFor(mode: Mode): number {
  return mode === "light" ? 4.5 : 1;
}

export function currentMinimumContrastRatio(): number {
  const light = document.documentElement.classList.contains("light");
  return minimumContrastRatioFor(light ? "light" : "dark");
}

export function buildTerminalTheme(): ITheme {
  const t = readTerminalTokens();
  return {
    background: t.background,
    foreground: t.foreground,
    cursor: t.cursor,
    cursorAccent: t.cursorAccent,
    selectionBackground: t.selection,
    black: t.ansiBlack,
    red: t.ansiRed,
    green: t.ansiGreen,
    yellow: t.ansiYellow,
    blue: t.ansiBlue,
    magenta: t.ansiMagenta,
    cyan: t.ansiCyan,
    white: t.ansiWhite,
    brightBlack: t.ansiBrightBlack,
    brightRed: t.ansiBrightRed,
    brightGreen: t.ansiBrightGreen,
    brightYellow: t.ansiBrightYellow,
    brightBlue: t.ansiBrightBlue,
    brightMagenta: t.ansiBrightMagenta,
    brightCyan: t.ansiBrightCyan,
    brightWhite: t.ansiBrightWhite,
  };
}
