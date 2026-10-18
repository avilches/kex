import type { TagStyle } from "@codemirror/language";
import type { CreateThemeOptions } from "@uiw/codemirror-themes";
import { normalizeHex, readableOn } from "@/modules/theme/readableColors";

export type CmThemeSpec = {
  theme: "light" | "dark";
  settings: NonNullable<CreateThemeOptions["settings"]>;
  styles: TagStyle[];
};

/**
 * The same theme with its text and syntax colors pushed (hue kept) to 4.5:1
 * against its background and against `alsoOn`, the editor backgrounds of the
 * app themes that pair it: the editor paints the app's background, not the
 * one the syntax theme ships with. Comments and punctuation of upstream
 * palettes are often fainter than that.
 */
export function readableSpec(spec: CmThemeSpec, alsoOn: readonly string[] = []): CmThemeSpec {
  const own = spec.settings.background && normalizeHex(spec.settings.background);
  if (!own) return spec;
  const bgs = [...new Set([own, ...alsoOn.flatMap((c) => normalizeHex(c) ?? [])])];
  const fix = (color: string) => {
    const hex = normalizeHex(color);
    return hex ? readableOn(hex, bgs) : color;
  };
  const { foreground } = spec.settings;
  return {
    ...spec,
    settings: { ...spec.settings, ...(foreground ? { foreground: fix(foreground) } : {}) },
    styles: spec.styles.map((s) => (typeof s.color === "string" ? { ...s, color: fix(s.color) } : s)),
  };
}
