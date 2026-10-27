import { compose, hexToRgb, rgbToHex, shiftHsl, toHex, tokenValue, type Rgb } from "./color";

export type Tune = {
  bgLightness: number;
  bgHue: number;
  bgSaturation: number;
  borderLightness: number;
  textLightness: number;
  accentLightness: number;
  accentHue: number;
  codeLightness: number;
  ansiLightness: number;
  ansiSaturation: number;
  normalAlpha: number;
  ignoredAlpha: number;
};

export const DEFAULT_TUNE: Tune = {
  bgLightness: 0,
  bgHue: 0,
  bgSaturation: 0,
  borderLightness: 0,
  textLightness: 0,
  accentLightness: 0,
  accentHue: 0,
  codeLightness: 0,
  ansiLightness: 0,
  ansiSaturation: 0,
  normalAlpha: 0.85,
  ignoredAlpha: 0.85,
};

const ANSI_TOKENS = [
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "bright-black", "bright-red", "bright-green", "bright-yellow",
  "bright-blue", "bright-magenta", "bright-cyan", "bright-white",
].map((n) => `terminal-ansi-${n}`);

type Field = Exclude<keyof Tune, "normalAlpha" | "ignoredAlpha">;

// Each slider moves a whole family of tokens at once, so a theme can be tuned
// with a dozen controls instead of the full token list. Anything finer is still
// reachable with the token picker. UI surfaces move together so the whole window
// shifts and the explorer/source-control sidebar follows.
const GROUPS: { tokens: string[]; l?: Field; h?: Field; s?: Field }[] = [
  {
    tokens: ["background", "card", "popover", "sidebar", "muted", "secondary", "accent"],
    l: "bgLightness",
    h: "bgHue",
    s: "bgSaturation",
  },
  { tokens: ["border", "input", "sidebar-border"], l: "borderLightness" },
  {
    tokens: [
      "foreground",
      "card-foreground",
      "popover-foreground",
      "muted-foreground",
      "sidebar-foreground",
    ],
    l: "textLightness",
  },
  {
    tokens: ["primary", "sidebar-primary", "ring", "sidebar-ring", "tab-focus-indicator", "link"],
    l: "accentLightness",
    h: "accentHue",
  },
  { tokens: ["editor-background", "terminal-background"], l: "codeLightness" },
  { tokens: ANSI_TOKENS, l: "ansiLightness", s: "ansiSaturation" },
];

const deltas = (g: (typeof GROUPS)[number], tune: Tune) => ({
  dl: g.l ? tune[g.l] : 0,
  dh: g.h ? tune[g.h] : 0,
  ds: g.s ? tune[g.s] : 0,
});

// Tokens a non-default slider is moving right now, so save and export can tell
// them apart from the ones the theme declares itself.
export function tunedTokens(tune: Tune): Set<string> {
  const out = new Set<string>();
  for (const g of GROUPS) {
    const { dl, dh, ds } = deltas(g, tune);
    if (dl || dh || ds) for (const t of g.tokens) out.add(t);
  }
  return out;
}

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
  // Read every value before writing any: a token can alias another one
  // (`var(--primary)`), and reading it after the original moved would shift it twice.
  const writes: [string, string][] = [];
  for (const g of GROUPS) {
    const { dl, dh, ds } = deltas(g, tune);
    if (!dl && !dh && !ds) continue;
    for (const name of g.tokens) {
      const hex = toHex(tokenValue(name));
      if (hex.startsWith("#")) writes.push([name, shiftHsl(hex, dl, dh, ds)]);
    }
  }
  for (const [name, value] of writes) root.setProperty(`--${name}`, value);
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
