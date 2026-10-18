import { describe, expect, it } from "vitest";
import { EDITOR_THEME_SPEC } from "@/modules/editor/lib/themes";
import { gitStatusHexColor } from "@/modules/explorer/lib/gitStatusColor";
import type { GitStatusCode } from "@/modules/explorer/lib/gitStatusUtils";
import { H6_TEXT_SHARE } from "@/modules/markdown/codemirror/lib/markdownExtensions";
import { contrastRatio, flattenColor, normalizeHex } from "../readableColors";
import { resolveTerminalPalette } from "../resolveTerminalTheme";
import type { ThemeMode } from "../types";
import { listBuiltinThemes } from "./index";

const HEX = /^#[0-9a-f]{6}$/i;

const rgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

const ratio = (fg: string, bg: string) => contrastRatio(rgb(fg), rgb(bg));

const cases = listBuiltinThemes().flatMap((t) =>
  (["dark", "light"] as const).map((mode) => [`${t.id} ${mode}`, t, mode] as const),
);

describe.each(cases)("%s contrast floors", (_id, theme, mode: ThemeMode) => {
  const variant = theme.variants[mode]!;
  const c = variant.colors!;

  it("text on every surface reaches 4.5:1", () => {
    const pairs: [string, string, string][] = [
      ["foreground", c.foreground!, c.background!],
      ["cardForeground", c.cardForeground!, c.card!],
      ["popoverForeground", c.popoverForeground!, c.popover!],
      ["secondaryForeground", c.secondaryForeground!, c.secondary!],
      ["mutedForeground", c.mutedForeground!, c.muted!],
      ["accentForeground", c.accentForeground!, c.accent!],
      ["sidebarForeground", c.sidebarForeground!, c.sidebar!],
      ["sidebarAccentForeground", c.sidebarAccentForeground!, c.sidebarAccent!],
      ["primaryForeground", c.primaryForeground!, c.primary!],
      ["sidebarPrimaryForeground", c.sidebarPrimaryForeground!, c.sidebarPrimary!],
      ["destructive/background", c.destructive!, c.background!],
      ["destructive/sidebar", c.destructive!, c.sidebar!],
      ["link", c.link!, variant.editor?.background ?? c.background!],
    ];
    for (const [name, fg, bg] of pairs) {
      if (!fg || !bg || !HEX.test(fg) || !HEX.test(bg)) continue;
      expect(ratio(fg, bg), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the focused tab indicator reaches 3:1", () => {
    for (const bg of [c.background, c.sidebar]) {
      if (!c.tabFocusIndicator || !bg || !HEX.test(bg)) continue;
      expect(ratio(c.tabFocusIndicator, bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it("the terminal palette keeps text readable and no ANSI color vanishes", () => {
    const p = resolveTerminalPalette("auto", theme, listBuiltinThemes(), mode)!;
    expect(ratio(p.foreground!, p.background!), "foreground").toBeGreaterThanOrEqual(4.5);
    const selection = flattenColor(p.selection!, p.background!);
    if (selection) expect(ratio(p.foreground!, selection), "foreground on selection").toBeGreaterThanOrEqual(4.5);
    p.ansi!.forEach((color, i) => {
      expect(ratio(color, p.background!), `ansi ${i}`).toBeGreaterThan([0, 7, 15].includes(i) ? 1.4 : 1);
    });
    expect(ratio(p.ansi![8], p.background!), "bright black").toBeGreaterThanOrEqual(3);
  });
});

describe("git status colors", () => {
  const categories = ["M", "A", "?", "R", "D"] as const;
  it.each(cases)("%s sidebar holds every git color of both schemes at 4.5:1", (_id, theme, mode) => {
    const c = theme.variants[mode]!.colors!;
    const sidebar = c.sidebar ?? c.background;
    if (!sidebar || !HEX.test(sidebar)) return;
    for (const scheme of ["vscode", "jetbrains"] as const) {
      for (const code of categories) {
        const hex = gitStatusHexColor(code as GitStatusCode, scheme, mode)!;
        expect(ratio(hex, sidebar), `${scheme} ${code}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("editor syntax colors", () => {
  const specs = Object.entries(EDITOR_THEME_SPEC);
  it.each(specs)("%s paints every token at 4.5:1 on its own background", (_id, spec) => {
    const bg = normalizeHex(spec.settings.background!)!;
    const colors = [spec.settings.foreground, ...spec.styles.map((s) => s.color)];
    for (const color of colors) {
      const hex = typeof color === "string" ? normalizeHex(color) : null;
      if (hex) expect(ratio(hex, bg), color).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(cases)("%s draws the paired editor theme on the editor background at 4.5:1", (_id, theme, mode) => {
    const variant = theme.variants[mode]!;
    const bg = variant.editor?.background ?? variant.colors?.background;
    const paired = EDITOR_THEME_SPEC[theme.editorTheme![mode] as keyof typeof EDITOR_THEME_SPEC];
    if (!bg || !HEX.test(bg)) return;
    for (const color of paired.styles.map((s) => s.color)) {
      const hex = typeof color === "string" ? normalizeHex(color) : null;
      if (hex) expect(ratio(hex, bg), color).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("markdown", () => {
  it.each(cases)("%s keeps the dimmed H6 at 3:1", (_id, theme, mode) => {
    const v = theme.variants[mode]!;
    const bg = v.editor?.background ?? v.colors?.background;
    const fg = v.editor?.foreground ?? v.colors?.foreground;
    if (!bg || !fg || !HEX.test(bg) || !HEX.test(fg)) return;
    const h6 = flattenColor(`${fg}${Math.round(H6_TEXT_SHARE * 255).toString(16)}`, bg)!;
    expect(ratio(h6, bg)).toBeGreaterThanOrEqual(3);
  });
});
