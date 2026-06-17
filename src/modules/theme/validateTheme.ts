import type { Theme, ThemeColors, ThemeVariant, TerminalPalette } from "./types";

export type ValidationResult =
  | { ok: true; theme: Theme }
  | { ok: false; error: string };

const COLOR_KEYS: readonly (keyof ThemeColors)[] = [
  "background", "foreground",
  "card", "cardForeground",
  "popover", "popoverForeground",
  "primary", "primaryForeground",
  "secondary", "secondaryForeground",
  "muted", "mutedForeground",
  "accent", "accentForeground",
  "destructive",
  "border", "input", "ring",
  "sidebar", "sidebarForeground",
  "sidebarPrimary", "sidebarPrimaryForeground",
  "sidebarAccent", "sidebarAccentForeground",
  "sidebarBorder", "sidebarRing",
  "tabFocusIndicator",
  "radius",
];

const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function isValidColor(v: string): boolean {
  if (v.includes("url(") || v.includes("image-set(") || v.includes(";")) {
    return false;
  }
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
    return CSS.supports("color", v);
  }
  return isValidColorFallback(v);
}

function isValidColorFallback(v: string): boolean {
  if (v.length === 0) return false;
  const trimmed = v.trim();
  if (trimmed.length === 0) return false;
  if (/^#([0-9a-f]{3}){1,2}$/i.test(trimmed)) return true;
  if (/^rgb[a]?\(/.test(trimmed)) return true;
  if (/^hsl[a]?\(/.test(trimmed)) return true;
  if (/^color\(/.test(trimmed)) return true;
  if (/^color-mix\(/.test(trimmed)) return true;
  if (/^hwb\(/.test(trimmed)) return true;
  if (/^lch\(/.test(trimmed)) return true;
  if (/^oklch\(/.test(trimmed)) return true;
  if (/^lab\(/.test(trimmed)) return true;
  if (/^oklab\(/.test(trimmed)) return true;
  const namedColors: Record<string, boolean> = {
    aliceblue: true, antiquewhite: true, aqua: true, aquamarine: true, azure: true,
    beige: true, bisque: true, black: true, blanchedalmond: true, blue: true,
    blueviolet: true, brown: true, burlywood: true, cadetblue: true, chartreuse: true,
    chocolate: true, coral: true, cornflowerblue: true, cornsilk: true, crimson: true,
    cyan: true, darkblue: true, darkcyan: true, darkgoldenrod: true, darkgray: true,
    darkgrey: true, darkgreen: true, darkkhaki: true, darkmagenta: true, darkolivegreen: true,
    darkorange: true, darkorchid: true, darkred: true, darksalmon: true, darkseagreen: true,
    darkslateblue: true, darkslategray: true, darkslategrey: true, darkturquoise: true,
    darkviolet: true, deeppink: true, deepskyblue: true, dimgray: true, dimgrey: true,
    dodgerblue: true, firebrick: true, floralwhite: true, forestgreen: true, fuchsia: true,
    gainsboro: true, ghostwhite: true, gold: true, goldenrod: true, gray: true, grey: true,
    green: true, greenyellow: true, honeydew: true, hotpink: true, indianred: true, indigo: true,
    ivory: true, khaki: true, lavender: true, lavenderblush: true, lawngreen: true, lemonchiffon: true,
    lightblue: true, lightcoral: true, lightcyan: true, lightgoldenrodyellow: true, lightgray: true,
    lightgrey: true, lightgreen: true, lightpink: true, lightsalmon: true, lightseagreen: true,
    lightskyblue: true, lightslategray: true, lightslategrey: true, lightsteelblue: true,
    lightyellow: true, lime: true, limegreen: true, linen: true, magenta: true, maroon: true,
    mediumaquamarine: true, mediumblue: true, mediumorchid: true, mediumpurple: true,
    mediumseagreen: true, mediumslateblue: true, mediumspringgreen: true, mediumturquoise: true,
    mediumvioletred: true, midnightblue: true, mintcream: true, mistyrose: true, moccasin: true,
    navajowhite: true, navy: true, oldlace: true, olive: true, olivedrab: true, orange: true,
    orangered: true, orchid: true, palegoldenrod: true, palegreen: true, paleturquoise: true,
    palevioletred: true, papayawhip: true, peachpuff: true, peru: true, pink: true, plum: true,
    powderblue: true, purple: true, rebeccapurple: true, red: true, rosybrown: true,
    royalblue: true, saddlebrown: true, salmon: true, sandybrown: true, seagreen: true,
    seashell: true, sienna: true, silver: true, skyblue: true, slateblue: true, slategray: true,
    slategrey: true, snow: true, springgreen: true, steelblue: true, tan: true, teal: true,
    thistle: true, tomato: true, turquoise: true, violet: true, wheat: true, white: true,
    whitesmoke: true, yellow: true, yellowgreen: true, transparent: true, currentcolor: true,
  };
  return namedColors[trimmed.toLowerCase()] ?? false;
}

function parseColors(raw: unknown, path: string): ThemeColors | string {
  if (raw === undefined) return {};
  if (!isObj(raw)) return `${path} must be an object`;
  const out: ThemeColors = {};
  for (const k of Object.keys(raw)) {
    if (!(COLOR_KEYS as string[]).includes(k)) {
      return `${path}.${k} is not a recognized color key`;
    }
    const v = raw[k];
    if (!isStr(v) || v.length === 0) return `${path}.${k} must be a non-empty string`;
    if (!isValidColor(v)) return `${path}.${k} is not a valid CSS color`;
    out[k as keyof ThemeColors] = v;
  }
  return out;
}

function parseTerminal(raw: unknown, path: string): TerminalPalette | string {
  if (raw === undefined) return {};
  if (!isObj(raw)) return `${path} must be an object`;
  const out: TerminalPalette = {};
  if (raw.background !== undefined) {
    if (!isStr(raw.background)) return `${path}.background must be a string`;
    if (!isValidColor(raw.background)) return `${path}.background is not a valid CSS color`;
    out.background = raw.background;
  }
  if (raw.foreground !== undefined) {
    if (!isStr(raw.foreground)) return `${path}.foreground must be a string`;
    if (!isValidColor(raw.foreground)) return `${path}.foreground is not a valid CSS color`;
    out.foreground = raw.foreground;
  }
  if (raw.cursor !== undefined) {
    if (!isStr(raw.cursor)) return `${path}.cursor must be a string`;
    if (!isValidColor(raw.cursor)) return `${path}.cursor is not a valid CSS color`;
    out.cursor = raw.cursor;
  }
  if (raw.cursorAccent !== undefined) {
    if (!isStr(raw.cursorAccent)) return `${path}.cursorAccent must be a string`;
    if (!isValidColor(raw.cursorAccent)) return `${path}.cursorAccent is not a valid CSS color`;
    out.cursorAccent = raw.cursorAccent;
  }
  if (raw.selection !== undefined) {
    if (!isStr(raw.selection)) return `${path}.selection must be a string`;
    if (!isValidColor(raw.selection)) return `${path}.selection is not a valid CSS color`;
    out.selection = raw.selection;
  }
  if (raw.ansi !== undefined) {
    if (!Array.isArray(raw.ansi) || raw.ansi.length !== 16) {
      return `${path}.ansi must be an array of 16 strings`;
    }
    for (let i = 0; i < 16; i++) {
      if (!isStr(raw.ansi[i])) return `${path}.ansi[${i}] must be a string`;
      if (!isValidColor(raw.ansi[i])) return `${path}.ansi[${i}] is not a valid CSS color`;
    }
    out.ansi = raw.ansi as unknown as TerminalPalette["ansi"];
  }
  return out;
}

function parseVariant(raw: unknown, path: string): ThemeVariant | string {
  if (!isObj(raw)) return `${path} must be an object`;
  const colors = parseColors(raw.colors, `${path}.colors`);
  if (typeof colors === "string") return colors;
  const terminal = parseTerminal(raw.terminal, `${path}.terminal`);
  if (typeof terminal === "string") return terminal;
  const variant: ThemeVariant = { colors, terminal };
  if (isObj(raw.inactivePaneDim)) {
    const dim: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.inactivePaneDim as Record<string, unknown>)) {
      if (typeof v === "number" && v >= 0 && v <= 1) dim[k] = v;
    }
    if (Object.keys(dim).length > 0) variant.inactivePaneDim = dim;
  }
  return variant;
}

export function validateTheme(raw: unknown): ValidationResult {
  if (!isObj(raw)) return { ok: false, error: "Theme must be a JSON object" };
  if (!isStr(raw.id) || !ID_RE.test(raw.id)) {
    return { ok: false, error: "id must be a kebab-case string (a-z, 0-9, -)" };
  }
  if (!isStr(raw.name) || raw.name.trim().length === 0) {
    return { ok: false, error: "name must be a non-empty string" };
  }
  if (!isObj(raw.variants)) return { ok: false, error: "variants must be an object" };
  const variants: Theme["variants"] = {};
  if (raw.variants.light !== undefined) {
    const v = parseVariant(raw.variants.light, "variants.light");
    if (typeof v === "string") return { ok: false, error: v };
    variants.light = v;
  }
  if (raw.variants.dark !== undefined) {
    const v = parseVariant(raw.variants.dark, "variants.dark");
    if (typeof v === "string") return { ok: false, error: v };
    variants.dark = v;
  }
  if (!variants.light && !variants.dark) {
    return { ok: false, error: "variants must contain at least one of: light, dark" };
  }
  const theme: Theme = {
    id: raw.id,
    name: raw.name.trim(),
    variants,
  };
  if (isStr(raw.author)) theme.author = raw.author;
  if (isStr(raw.description)) theme.description = raw.description;
  if (isObj(raw.editorTheme)) {
    const et: Theme["editorTheme"] = {};
    if (isStr(raw.editorTheme.light)) et.light = raw.editorTheme.light;
    if (isStr(raw.editorTheme.dark)) et.dark = raw.editorTheme.dark;
    if (et.light || et.dark) theme.editorTheme = et;
  }
  return { ok: true, theme };
}
