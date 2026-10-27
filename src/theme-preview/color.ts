const canvas = document.createElement("canvas");
canvas.width = canvas.height = 1;
const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

export function tokenValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

// Any CSS color (oklch, rgba, hex...) to "#rrggbb" or "#rrggbbaa", read back
// from a real pixel so the text never depends on how the browser serializes it.
export function toHex(css: string): string {
  const ref = /^var\(--([\w-]+)\)$/.exec(css);
  if (ref) css = tokenValue(ref[1]);
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#000";
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}${a === 255 ? "" : h(a)}`;
}

export type Rgb = { r: number; g: number; b: number };

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

// Flat sRGB composite of `fg` at `alpha` over an opaque `bg`. Good enough for
// contrast readouts; the drawn color itself uses color-mix in oklab.
export function compose(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
  };
}

function rgbToHsl({ r, g, b }: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255 };
}

// Greys have no hue to rotate, so a tone shift starts from a cool blue and the
// saturation delta is what makes it visible.
const GREY_PIVOT_HUE = 215;
const GREY_SATURATION = 0.02;

// Lightness and saturation deltas in percentage points, hue rotation in degrees.
// A trailing alpha byte on the input survives.
export function shiftHsl(hex: string, dl: number, dh: number, ds = 0): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  let [h, s, l] = rgbToHsl(rgb);
  if (s < GREY_SATURATION) h = GREY_PIVOT_HUE / 360;
  l = Math.max(0, Math.min(1, l + dl / 100));
  s = Math.max(0, Math.min(1, s + ds / 100));
  h = (h + dh / 360 + 1) % 1;
  return rgbToHex(hslToRgb(h, s, l)) + (/^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(hex.trim())?.[1] ?? "");
}

export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(rgb) + Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, "0");
}
