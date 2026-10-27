import type { TerminalPalette, Theme, ThemeColors, ThemeVariant } from "./types";

const HEX = /^#[0-9a-fA-F]{6}$/;
const MIN_CONTRAST = 4.5;
const FLIP_BELOW = 3;
const FOCUS_CONTRAST = 3;
const BRIGHT_BLACK_CONTRAST = 3;
const ANSI_DISTINCT_CONTRAST = 1.5;

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function toHex(c: Rgb): string {
  return `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(c: Rgb): number {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function mix(from: Rgb, to: Rgb, t: number): Rgb {
  return from.map((v, i) => v + (to[i]! - v) * t) as Rgb;
}

/** #rgb and #rrggbb as lowercase #rrggbb; anything else is null. */
export function normalizeHex(value: string): string | null {
  if (HEX.test(value)) return value.toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase() : null;
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/**
 * Hex of an opaque color or of a translucent one laid over `over`. Understands
 * #rrggbb, #rrggbbaa and rgb()/rgba() with comma separated numbers; anything
 * else (color-mix, hsl, var()) is null.
 */
export function flattenColor(value: string, over: string): string | null {
  if (!HEX.test(over)) return null;
  if (HEX.test(value)) return value.toLowerCase();
  const hex8 = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(value);
  if (hex8) return blend(toRgb(`#${hex8[1]}`), parseInt(hex8[2]!, 16) / 255, over);
  const fn = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (!fn) return null;
  const rgb: Rgb = [Number(fn[1]), Number(fn[2]), Number(fn[3])];
  return blend(rgb, fn[4] === undefined ? 1 : Number(fn[4]), over);
}

function blend(fg: Rgb, alpha: number, over: string): string {
  return toHex(mix(toRgb(over), fg, alpha));
}

// Moves `fg` toward black or white, the least that reaches `min` on every
// background, so the hue of the palette color is kept.
function readableOn(fg: string, backgrounds: string[], min = MIN_CONTRAST): string {
  const bgs = backgrounds.map(toRgb);
  const from = toRgb(fg);
  if (bgs.every((bg) => contrastRatio(from, bg) >= min)) return fg;
  // Keep polarity: light text on a button stays light even when black would
  // score marginally higher. Flip only when the original side cannot reach
  // FLIP_BELOW at all.
  const avgBg = bgs.reduce((sum, bg) => sum + luminance(bg), 0) / bgs.length;
  const worst = (t: Rgb) => Math.min(...bgs.map((bg) => contrastRatio(t, bg)));
  const same: Rgb = luminance(from) > avgBg ? WHITE : BLACK;
  const opposite: Rgb = same === WHITE ? BLACK : WHITE;
  const target = worst(same) >= FLIP_BELOW || worst(same) >= worst(opposite) ? same : opposite;
  return shiftToward(from, target, bgs, min);
}

function shiftToward(from: Rgb, target: Rgb, bgs: Rgb[], min: number): string {
  for (let t = 0.01; t <= 1; t += 0.01) {
    const c = toRgb(toHex(mix(from, target, t)));
    if (bgs.every((bg) => contrastRatio(c, bg) >= min)) return toHex(c);
  }
  return toHex(target);
}

// Pushes `color` away from `bg` (lighter on a dark bg, darker on a light one)
// until it reaches `min`. Unlike readableOn it never keeps the polarity of an
// existing color that sits on the wrong side.
function separatedFrom(color: string, bg: string, min: number): string {
  const from = toRgb(color);
  const back = toRgb(bg);
  if (contrastRatio(from, back) >= min) return color;
  const darkBg = luminance(back) < 0.18;
  const target = darkBg ? WHITE : BLACK;
  return shiftToward(from, target, [back], min);
}

// Keeps `fg` readable on `bg`. When even the extreme of fg's side falls short
// the background gives way instead (moved away from fg's polarity), because
// the text of a button cannot go beyond pure white.
function readablePair(fg: string, bg: string): { fg: string; bg: string } {
  const nextFg = readableOn(fg, [bg]);
  const f = toRgb(nextFg);
  const b = toRgb(bg);
  if (contrastRatio(f, b) >= MIN_CONTRAST) return { fg: nextFg, bg };
  const target = luminance(f) > luminance(b) ? BLACK : WHITE;
  for (let t = 0.01; t <= 1; t += 0.01) {
    const c = toRgb(toHex(mix(b, target, t)));
    if (contrastRatio(f, c) >= MIN_CONTRAST) return { fg: nextFg, bg: toHex(c) };
  }
  return { fg: nextFg, bg };
}

// Inline code in the markdown editor sits on the text color mixed 8% into the
// background, so the text has to read on that tint too.
function withInlineCodeTint(text: string, backgrounds: string[]): string[] {
  return [...backgrounds, blend(toRgb(text), 0.08, backgrounds[0]!)];
}

function hexes(...values: (string | undefined)[]): string[] | null {
  const ok = values.filter((v): v is string => !!v && HEX.test(v));
  return ok.length === values.length ? ok : null;
}

const TEXT_ON_SURFACE: readonly [keyof ThemeColors, keyof ThemeColors][] = [
  ["cardForeground", "card"],
  ["popoverForeground", "popover"],
  ["secondaryForeground", "secondary"],
  ["accentForeground", "accent"],
  ["sidebarForeground", "sidebar"],
  ["sidebarAccentForeground", "sidebarAccent"],
];

// Palettes of the built-in themes stay faithful to their originals in the
// theme files; what the app applies has the text tokens that are too faint to
// read nudged (hue kept) up to 4.5:1, and the accent and focus colors made
// distinguishable. `link` is derived here and only here.
export function withReadableText(colors: ThemeColors, editorBackground?: string): ThemeColors {
  const out = { ...colors };

  const fg = hexes(colors.foreground, colors.background);
  if (fg) {
    const bgs = withInlineCodeTint(fg[0]!, [fg[1]!]);
    if (colors.muted && HEX.test(colors.muted)) bgs.push(colors.muted);
    out.foreground = readableOn(fg[0]!, bgs);
  }

  for (const [textKey, surfaceKey] of TEXT_ON_SURFACE) {
    const pair = hexes(colors[textKey], colors[surfaceKey]);
    if (pair) out[textKey] = readableOn(pair[0]!, [pair[1]!]);
  }

  const muted = hexes(colors.mutedForeground, colors.background, colors.muted);
  if (muted) {
    out.mutedForeground = readableOn(muted[0]!, [muted[1]!, muted[2]!]);
  }

  const primary = hexes(colors.primaryForeground, colors.primary);
  if (primary) {
    const pair = readablePair(primary[0]!, primary[1]!);
    out.primaryForeground = pair.fg;
    out.primary = pair.bg;
  }

  const sidebarPrimary = hexes(
    colors.sidebarPrimaryForeground,
    colors.sidebarPrimary,
  );
  if (sidebarPrimary) {
    const pair = readablePair(sidebarPrimary[0]!, sidebarPrimary[1]!);
    out.sidebarPrimaryForeground = pair.fg;
    out.sidebarPrimary = pair.bg;
  }

  const surfaces = [colors.background, colors.sidebar].filter(
    (v): v is string => !!v && HEX.test(v),
  );
  if (colors.destructive && HEX.test(colors.destructive) && surfaces.length > 0) {
    out.destructive = readableOn(colors.destructive, surfaces);
  }

  const accent = colors.tabFocusIndicator ?? out.primary;
  if (accent && HEX.test(accent) && surfaces.length > 0) {
    out.tabFocusIndicator = readableOn(accent, surfaces, FOCUS_CONTRAST);
  }

  const link = colors.link ?? colors.primary;
  const linkBgs = [editorBackground, colors.background].filter(
    (v): v is string => !!v && HEX.test(v),
  );
  if (link && HEX.test(link) && linkBgs.length > 0) {
    out.link = readableOn(link, [...new Set(linkBgs)]);
  }

  return out;
}

function readableTerminal(
  terminal: TerminalPalette,
  colors: ThemeColors | undefined,
): TerminalPalette {
  const out = { ...terminal };
  const bg = terminal.background ?? colors?.background;
  if (!bg || !HEX.test(bg)) return out;

  const inherited = terminal.foreground ?? colors?.foreground;
  if (inherited && HEX.test(inherited)) {
    const bgs = [bg];
    const selection = terminal.selection ? flattenColor(terminal.selection, bg) : null;
    if (selection) bgs.push(selection);
    const next = readableOn(inherited, bgs);
    if (next !== inherited || terminal.foreground) out.foreground = next;
  }

  if (terminal.ansi) {
    const floors: Record<number, number> = {
      0: ANSI_DISTINCT_CONTRAST,
      7: ANSI_DISTINCT_CONTRAST,
      8: BRIGHT_BLACK_CONTRAST,
      15: ANSI_DISTINCT_CONTRAST,
    };
    out.ansi = terminal.ansi.map((c, i) =>
      HEX.test(c) && floors[i] ? separatedFrom(c, bg, floors[i]) : c,
    ) as unknown as NonNullable<TerminalPalette["ansi"]>;
  }
  return out;
}

function readableVariant(variant: ThemeVariant): ThemeVariant {
  const out = { ...variant };
  if (variant.colors) {
    const editorBg = variant.editor?.background ?? variant.colors.background;
    out.colors = withReadableText(variant.colors, editorBg);
  }
  if (variant.terminal) out.terminal = readableTerminal(variant.terminal, out.colors);
  if (variant.editor?.foreground) {
    const bg = variant.editor.background ?? out.colors?.background;
    if (bg && HEX.test(bg) && HEX.test(variant.editor.foreground)) {
      const foreground = readableOn(variant.editor.foreground, withInlineCodeTint(variant.editor.foreground, [bg]));
      out.editor = { ...variant.editor, foreground };
    }
  }
  return out;
}

export function withReadableTheme(theme: Theme): Theme {
  const variants: Theme["variants"] = {};
  if (theme.variants.dark) variants.dark = readableVariant(theme.variants.dark);
  if (theme.variants.light) variants.light = readableVariant(theme.variants.light);
  return { ...theme, variants };
}

export { readableOn };
