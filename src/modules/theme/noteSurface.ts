import { contrastRatio } from "./readableColors";
import type { EditorSurface, ThemeVariant } from "./types";

const HEX = /^#[0-9a-fA-F]{6}$/;
const MIN_CONTRAST = 4.5;

// A warm yellow darkened over a dark surface turns brown, so dark uses a
// greener yellow that stays mustard-olive.
const TINT = {
  dark: { color: [235, 225, 80] as Rgb, normal: 0.3, strong: 0.42 },
  light: { color: [250, 204, 21] as Rgb, normal: 0.2, strong: 0.4 },
};

export type NoteTint = { color: string; amount: number };

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
  override?: NoteTint,
): NoteSurface | null {
  const bg = parseColor(background);
  if (!bg) return null;
  const tint = TINT[isLight(bg) ? "light" : "dark"];
  const tinted = override
    ? mix(bg, parseColor(override.color) ?? tint.color, override.amount)
    : mix(bg, tint.color, strong ? tint.strong : tint.normal);
  const target: Rgb = isLight(tinted) ? [0, 0, 0] : [255, 255, 255];
  // Some themes (Kex Default) leave the text color to the stylesheet.
  const text = (foreground ? parseColor(foreground) : null) ?? target;
  const round = (c: Rgb): Rgb => c.map(Math.round) as Rgb;
  const bgRounded = round(tinted);
  let fg = round(text);
  for (let t = 0.05; contrastRatio(fg, bgRounded) < MIN_CONTRAST && t <= 1; t += 0.05) {
    fg = round(mix(text, target, t));
  }
  return { background: toHex(bgRounded), foreground: toHex(fg) };
}

// The note surface of a theme variant: its editor surface (or the UI colors
// when the variant defines no editor) pushed toward yellow, with an optional
// explicit editor surface winning over the variant's own. This is exactly what
// applyTheme publishes as --note-background/--note-foreground, so every
// consumer (the app, the Settings mini preview) shows the same colors.
export function variantNoteSurface(variant: ThemeVariant, editorOverride?: EditorSurface): NoteSurface | null {
  const editor = editorOverride ?? variant.editor;
  return noteSurface(
    editor?.background ?? variant.colors?.background ?? "",
    editor?.foreground ?? variant.colors?.foreground,
    variant.noteStrong,
    variant.noteTint,
  );
}
