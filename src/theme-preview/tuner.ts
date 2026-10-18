import { compose, hexToRgb, rgbToHex, shiftHsl, toHex, tokenValue, type Rgb } from "./color";

export type Tune = {
  bgLightness: number;
  bgHue: number;
  normalAlpha: number;
  ignoredAlpha: number;
};

export const DEFAULT_TUNE: Tune = { bgLightness: 0, bgHue: 0, normalAlpha: 0.85, ignoredAlpha: 0.85 };

// Surfaces the tone sliders move together, so the whole page shifts and the
// explorer/source-control sidebar follows. Text tokens are left alone.
const SURFACES = [
  "background",
  "card",
  "popover",
  "sidebar",
  "muted",
  "secondary",
  "accent",
  "editor-background",
  "terminal-background",
];

const STORE_KEY = "kex-theme-preview-tune";

type Store = Record<string, Tune>;

function readStore(): Store {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

export function loadTune(key: string): Tune {
  return { ...DEFAULT_TUNE, ...(readStore()[key] ?? {}) };
}

export function saveTune(key: string, tune: Tune): void {
  const store = readStore();
  store[key] = tune;
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

// The two row alphas are what the explorer uses for normal and ignored names
// (`text-foreground/85` and `text-muted-foreground/85` in the real app), so the
// sliders map straight onto the class suffix.
export function applyTune(tune: Tune): void {
  const root = document.documentElement.style;
  root.setProperty("--px-normal-alpha", `${Math.round(tune.normalAlpha * 100)}%`);
  root.setProperty("--px-ignored-alpha", `${Math.round(tune.ignoredAlpha * 100)}%`);
  root.setProperty("--px-normal-text", "color-mix(in oklab, var(--foreground) var(--px-normal-alpha), transparent)");
  root.setProperty("--px-ignored-text", "color-mix(in oklab, var(--muted-foreground) var(--px-ignored-alpha), transparent)");
  for (const name of SURFACES) {
    const hex = toHex(tokenValue(name));
    if (!hex.startsWith("#")) continue;
    root.setProperty(`--${name}`, shiftHsl(hex, tune.bgLightness, tune.bgHue));
  }
}

function luminance({ r, g, b }: Rgb): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export type TuneReadout = {
  normal: { hex: string; ratio: number };
  ignored: { hex: string; ratio: number };
  surface: string;
};

// What the two rows actually resolve to once the alphas are composited over the
// surface they sit on (the explorer and source control live on the sidebar).
export function readTune(tune: Tune): TuneReadout {
  const surfaceHex = toHex(tokenValue("sidebar"));
  const bg = hexToRgb(surfaceHex) ?? { r: 0, g: 0, b: 0 };
  const resolve = (token: string, alpha: number) => {
    const fg = hexToRgb(toHex(tokenValue(token))) ?? bg;
    const mixed = compose(fg, bg, alpha);
    return { hex: rgbToHex(mixed), ratio: ratio(mixed, bg) };
  };
  return {
    normal: resolve("foreground", tune.normalAlpha),
    ignored: resolve("muted-foreground", tune.ignoredAlpha),
    surface: surfaceHex,
  };
}

export function tuneSnapshot(themeId: string, themeName: string, mode: string, tune: Tune, read: TuneReadout): string {
  return JSON.stringify(
    {
      kind: "kex-theme-tune",
      theme: themeId,
      themeName,
      mode,
      tune,
      resolved: {
        surface: read.surface,
        normal: read.normal,
        ignored: read.ignored,
      },
    },
    null,
    2,
  );
}
