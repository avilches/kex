import { contrastRatio } from "./readableColors";

const HEX = /^#[0-9a-fA-F]{6}$/;
const MIN_CONTRAST = 4.5;

// A warm yellow darkened over a dark surface turns brown, so dark uses a
// greener yellow that stays mustard-olive.
const TINT = {
  dark: { color: [235, 225, 80] as Rgb, normal: 0.12, strong: 0.22 },
  light: { color: [250, 204, 21] as Rgb, normal: 0.2, strong: 0.4 },
};

type Rgb = [number, number, number];

const FUNC = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/i;

// Theme files use #rrggbb, but colors read back from CodeMirror via
// getComputedStyle arrive as rgb(...).
function parseColor(value: string): Rgb | null {
  if (HEX.test(value)) {
    return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
  }
  const m = FUNC.exec(value.trim());
  return m ? ([Number(m[1]), Number(m[2]), Number(m[3])] as Rgb) : null;
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
  foreground: string | undefined,
  strong = false,
): NoteSurface | null {
  const bg = parseColor(background);
  if (!bg) return null;
  const tint = TINT[isLight(bg) ? "light" : "dark"];
  const tinted = mix(bg, tint.color, strong ? tint.strong : tint.normal);
  const target: Rgb = isLight(tinted) ? [0, 0, 0] : [255, 255, 255];
  // Some themes (Kex Default) leave the text color to the stylesheet.
  const text = (foreground ? parseColor(foreground) : null) ?? target;
  let fg = text;
  for (let t = 0.05; contrastRatio(fg, tinted) < MIN_CONTRAST && t <= 1; t += 0.05) {
    fg = mix(text, target, t);
  }
  return { background: toHex(tinted), foreground: toHex(fg) };
}
