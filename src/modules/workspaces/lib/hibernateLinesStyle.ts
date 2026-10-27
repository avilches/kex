import type { RunStyle, StyleColor } from "./hibernateLines";

export type LinesPalette = {
  // The 16 theme colours: black..white, then their bright versions.
  ansi: readonly string[];
  foreground: string;
  background: string;
};

export type RunCss = {
  color?: string;
  backgroundColor?: string;
  fontWeight?: number;
  fontStyle?: "italic";
  textDecoration?: string;
  opacity?: number;
};

const CUBE_LEVELS = [0, 95, 135, 175, 215, 255];

const hex = (n: number) => n.toString(16).padStart(2, "0");

export function colorToCss(color: StyleColor, palette: LinesPalette): string {
  if (typeof color === "string") return color;
  if (color < 16) return palette.ansi[color] ?? palette.foreground;
  if (color < 232) {
    const i = color - 16;
    const [r, g, b] = [Math.floor(i / 36), Math.floor(i / 6) % 6, i % 6].map((n) => CUBE_LEVELS[n]);
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }
  const gray = 8 + 10 * (color - 232);
  return `#${hex(gray)}${hex(gray)}${hex(gray)}`;
}

// What the same attributes look like in the terminal: inverse swaps the two colours, falling back
// to the theme ones when a side is the default, and dim fades the text.
export function runCss(style: RunStyle, palette: LinesPalette): RunCss {
  const css: RunCss = {};
  let fg = style.fg === undefined ? undefined : colorToCss(style.fg, palette);
  let bg = style.bg === undefined ? undefined : colorToCss(style.bg, palette);
  if (style.inverse) {
    [fg, bg] = [bg ?? palette.background, fg ?? palette.foreground];
  }
  if (fg) css.color = fg;
  if (bg) css.backgroundColor = bg;
  if (style.bold) css.fontWeight = 700;
  if (style.italic) css.fontStyle = "italic";
  const lines = [style.underline && "underline", style.strike && "line-through"].filter(Boolean);
  if (lines.length) css.textDecoration = lines.join(" ");
  if (style.dim) css.opacity = 0.6;
  return css;
}

export function paletteFromTheme(theme: {
  background?: string;
  foreground?: string;
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}): LinesPalette {
  return {
    ansi: [
      theme.black,
      theme.red,
      theme.green,
      theme.yellow,
      theme.blue,
      theme.magenta,
      theme.cyan,
      theme.white,
      theme.brightBlack,
      theme.brightRed,
      theme.brightGreen,
      theme.brightYellow,
      theme.brightBlue,
      theme.brightMagenta,
      theme.brightCyan,
      theme.brightWhite,
    ].map((c) => c || theme.foreground || "currentColor"),
    foreground: theme.foreground || "currentColor",
    background: theme.background || "transparent",
  };
}
