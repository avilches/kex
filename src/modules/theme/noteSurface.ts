import { contrastRatio } from "./readableColors";

const HEX = /^#[0-9a-fA-F]{6}$/;
const YELLOW: Rgb = [250, 204, 21];
const MIN_CONTRAST = 4.5;

const MIX = {
  dark: { normal: 0.14, strong: 0.28 },
  light: { normal: 0.2, strong: 0.4 },
};

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function toHex(c: Rgb): string {
  return "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return a.map((v, i) => v + (b[i]! - v) * t) as Rgb;
}

function isLight(c: Rgb): boolean {
  return contrastRatio(c, [255, 255, 255]) < contrastRatio(c, [0, 0, 0]);
}

export type NoteSurface = { background: string; foreground: string };

// Sticky-note colors: the editor surface pushed toward yellow so a note reads
// as a note in every theme. `strong` is for themes whose own palette is already
// yellowish, where the normal amount would barely show.
export function noteSurface(
  background: string,
  foreground: string,
  strong = false,
): NoteSurface | null {
  if (!HEX.test(background) || !HEX.test(foreground)) return null;
  const bg = toRgb(background);
  const amount = MIX[isLight(bg) ? "light" : "dark"][strong ? "strong" : "normal"];
  const tinted = mix(bg, YELLOW, amount);
  const target: Rgb = isLight(tinted) ? [0, 0, 0] : [255, 255, 255];
  let fg = toRgb(foreground);
  for (let t = 0.05; contrastRatio(fg, tinted) < MIN_CONTRAST && t <= 1; t += 0.05) {
    fg = mix(toRgb(foreground), target, t);
  }
  return { background: toHex(tinted), foreground: toHex(fg) };
}
