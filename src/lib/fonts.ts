import { IS_LINUX, IS_WINDOWS } from "@/lib/platform";
import symbolsNerdFontUrl from "@/assets/fonts/SymbolsNerdFontMono-Regular.woff2?url";

// VS Code's per-platform monospace defaults, with the bundled JetBrains Mono
// in front so a fresh install renders identically on every OS. The browser
// falls back per glyph through the list, so prompt icons missing from the
// first font still resolve from any installed Nerd Font or system symbol font.
const MAC_STACK =
  'Menlo, "JetBrains Mono", Monaco, "Courier New", "Symbols Nerd Font Mono", monospace';
const WINDOWS_STACK =
  '"JetBrains Mono", Consolas, "Courier New", "Symbols Nerd Font Mono", monospace';
const LINUX_STACK =
  '"JetBrains Mono", "Droid Sans Mono", "DejaVu Sans Mono", "Symbols Nerd Font Mono", monospace';

export function defaultMonoFontFamily(): string {
  if (IS_WINDOWS) return WINDOWS_STACK;
  if (IS_LINUX) return LINUX_STACK;
  return MAC_STACK;
}

const GENERIC_FAMILIES = new Set([
  "monospace",
  "ui-monospace",
  "sans-serif",
  "serif",
  "system-ui",
]);

// Canvas font shorthand (used by the WebGL atlas) rejects unquoted family
// names containing spaces, so quote anything that is not a plain identifier
// or a generic family keyword.
export function normalizeFontFamilies(input: string): string[] {
  return input
    .split(",")
    .map((raw) => {
      const name = raw.trim().replace(/^["']+|["']+$/g, "").trim();
      if (!name) return "";
      if (GENERIC_FAMILIES.has(name.toLowerCase())) return name.toLowerCase();
      return /^[A-Za-z][\w-]*$/.test(name) ? name : `"${name}"`;
    })
    .filter(Boolean);
}

export function buildFontStack(pref: string, defaults: string): string {
  const families = normalizeFontFamilies(pref);
  if (families.length === 0) return defaults;
  return `${families.join(", ")}, ${defaults}`;
}

// Empty preference means the platform default stack; a user-set font is always
// backed by the default stack so a typo or uninstalled font never breaks the
// terminal.
export function resolveMonoFontFamily(pref: string): string {
  return buildFontStack(pref, defaultMonoFontFamily());
}

let monoReady: Promise<void> | null = null;

export function ensureMonoFontsLoaded(): Promise<void> {
  if (monoReady) return monoReady;
  if (typeof document === "undefined" || !document.fonts?.load) {
    monoReady = Promise.resolve();
    return monoReady;
  }
  const symbolsFace = new FontFace(
    "Symbols Nerd Font Mono",
    `url(${symbolsNerdFontUrl})`,
    { style: "normal" },
  );
  monoReady = Promise.allSettled([
    document.fonts.load('400 14px "JetBrains Mono"'),
    document.fonts.load('700 14px "JetBrains Mono"'),
    symbolsFace.load().then((f) => { document.fonts.add(f); }),
  ]).then(() => undefined);
  return monoReady;
}
