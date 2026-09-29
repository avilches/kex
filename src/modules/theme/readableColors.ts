import type { ThemeColors } from "./types";

const HEX = /^#[0-9a-fA-F]{6}$/;
const MIN_CONTRAST = 4.5;
const FLIP_BELOW = 3;

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function toHex(c: Rgb): string {
  return "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
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

// Moves `fg` toward black or white, the least that reaches MIN_CONTRAST on
// every background, so the hue of the palette color is kept.
function readableOn(fg: string, backgrounds: string[]): string {
  const bgs = backgrounds.map(toRgb);
  const from = toRgb(fg);
  if (bgs.every((bg) => contrastRatio(from, bg) >= MIN_CONTRAST)) return fg;
  // Keep polarity: light text on a button stays light even when black would
  // score marginally higher. Flip only when the original side cannot reach
  // FLIP_BELOW at all.
  const avgBg = bgs.reduce((sum, bg) => sum + luminance(bg), 0) / bgs.length;
  const worst = (t: Rgb) => Math.min(...bgs.map((bg) => contrastRatio(t, bg)));
  const same: Rgb = luminance(from) > avgBg ? [255, 255, 255] : [0, 0, 0];
  const opposite: Rgb = same[0] === 255 ? [0, 0, 0] : [255, 255, 255];
  const target = worst(same) >= FLIP_BELOW || worst(same) >= worst(opposite) ? same : opposite;
  for (let t = 0.01; t <= 1; t += 0.01) {
    const hex = toHex(from.map((v, i) => v + (target[i]! - v) * t) as Rgb);
    const c = toRgb(hex);
    if (bgs.every((bg) => contrastRatio(c, bg) >= MIN_CONTRAST)) return hex;
  }
  return toHex(target);
}

function hexes(...values: (string | undefined)[]): string[] | null {
  const ok = values.filter((v): v is string => !!v && HEX.test(v));
  return ok.length === values.length ? ok : null;
}

// Palettes of the built-in themes stay faithful to their originals; this only
// nudges the few text tokens whose original value is too faint to read.
export function withReadableText(colors: ThemeColors): ThemeColors {
  const out = { ...colors };

  const muted = hexes(colors.mutedForeground, colors.background, colors.muted);
  if (muted) {
    out.mutedForeground = readableOn(muted[0]!, [muted[1]!, muted[2]!]);
  }

  const primary = hexes(colors.primaryForeground, colors.primary);
  if (primary) {
    out.primaryForeground = readableOn(primary[0]!, [primary[1]!]);
  }

  const sidebarPrimary = hexes(
    colors.sidebarPrimaryForeground,
    colors.sidebarPrimary,
  );
  if (sidebarPrimary) {
    out.sidebarPrimaryForeground = readableOn(sidebarPrimary[0]!, [
      sidebarPrimary[1]!,
    ]);
  }

  return out;
}
