import { compose, hexToRgb, rgbToHex, shiftHsl, toHex, tokenValue, type Rgb } from "./color";

export type Tune = {
  bgLightness: number;
  bgHue: number;
  normalAlpha: number;
  ignoredAlpha: number;
};

export const DEFAULT_TUNE: Tune = { bgLightness: 0, bgHue: 0, normalAlpha: 0.85, ignoredAlpha: 0.85 };

// UI surfaces the tone sliders move together, so the whole window shifts and
// the explorer/source-control sidebar follows. Text tokens are left alone, and
// so are the editor and terminal backgrounds: those have their own palettes,
// and shifting them would write extra fields on save. Override those by hand
// with the token picker if you want them moved.
const SURFACES = [
  "background",
  "card",
  "popover",
  "sidebar",
  "muted",
  "secondary",
  "accent",
];

const TUNE_KEY = "kex-theme-preview-tune";
const TOKENS_KEY = "kex-theme-preview-tokens";

function readStore(key: string): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function loadTune(key: string): Tune {
  return { ...DEFAULT_TUNE, ...((readStore(TUNE_KEY)[key] as Partial<Tune>) ?? {}) };
}

export function saveTune(key: string, tune: Tune): void {
  const store = readStore(TUNE_KEY);
  store[key] = tune;
  localStorage.setItem(TUNE_KEY, JSON.stringify(store));
}

export function changedTune(tune: Tune): Partial<Tune> {
  const out: Partial<Tune> = {};
  for (const key of Object.keys(DEFAULT_TUNE) as (keyof Tune)[]) {
    if (tune[key] !== DEFAULT_TUNE[key]) out[key] = tune[key];
  }
  return out;
}

export function loadTokens(key: string): Record<string, string> {
  return (readStore(TOKENS_KEY)[key] as Record<string, string> | undefined) ?? {};
}

export function saveTokens(key: string, tokens: Record<string, string>): void {
  const store = readStore(TOKENS_KEY);
  store[key] = tokens;
  localStorage.setItem(TOKENS_KEY, JSON.stringify(store));
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

export function clearOverrides(key: string): void {
  for (const storeKey of [TUNE_KEY, TOKENS_KEY]) {
    const store = readStore(storeKey);
    delete store[key];
    localStorage.setItem(storeKey, JSON.stringify(store));
  }
}

export function applyTokens(tokens: Record<string, string>): void {
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries(tokens)) root.setProperty(`--${name}`, value);
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

export function tuneSnapshot(
  themeId: string,
  themeName: string,
  mode: string,
  tune: Tune,
  read: TuneReadout,
  tokens: Record<string, string>,
): string {
  return JSON.stringify(
    {
      kind: "kex-theme-tune",
      theme: themeId,
      themeName,
      mode,
      tune: changedTune(tune),
      tokens,
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
