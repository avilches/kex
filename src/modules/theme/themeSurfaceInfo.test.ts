import { describe, expect, it } from "vitest";
import { listBuiltinThemes } from "./themes";
import { EDITOR_THEME_MODE } from "@/modules/settings/store";
import { themeSurfaceInfo, unpairedEditorThemes } from "./themeSurfaceInfo";
import type { Theme } from "./types";

const palette = (bg: string) => ({
  background: bg,
  foreground: "#ffffff",
  ansi: Array.from({ length: 16 }, () => "#123456"),
});

const mk = (id: string, editor: string, bg: string | null): Theme =>
  ({
    id,
    name: id.toUpperCase(),
    editorTheme: { dark: editor, light: editor },
    variants: {
      dark: bg ? { terminal: palette(bg) } : {},
      light: bg ? { terminal: palette(bg) } : {},
    },
  }) as unknown as Theme;

describe("themeSurfaceInfo", () => {
  it("reports an editor theme used by one theme as its own", () => {
    const a = mk("a", "nord", "#000000");
    const b = mk("b", "dracula", "#111111");
    const info = themeSurfaceInfo(a, [a, b], "dark");
    expect(info.editor.sharedWith).toEqual([]);
    expect(info.terminal).toEqual({ label: "A", sharedWith: [] });
  });

  it("lists the other themes that pair the same editor theme", () => {
    const a = mk("a", "nord", "#000000");
    const b = mk("b", "nord", "#111111");
    const c = mk("c", "dracula", "#222222");
    expect(themeSurfaceInfo(a, [a, b, c], "dark").editor.sharedWith).toEqual(["B"]);
  });

  it("detects a terminal palette shared with another theme", () => {
    const a = mk("a", "nord", "#000000");
    const b = mk("b", "dracula", "#000000");
    expect(themeSurfaceInfo(a, [a, b], "dark").terminal?.sharedWith).toEqual(["B"]);
  });

  it("has no terminal info for a theme without a palette", () => {
    const a = mk("a", "nord", null);
    expect(themeSurfaceInfo(a, [a], "dark").terminal).toBeUndefined();
  });

  it("follows the mode", () => {
    const a = mk("a", "nord", "#000000");
    a.editorTheme = { dark: "nord", light: "github-light" };
    const b = mk("b", "github-light", "#111111");
    expect(themeSurfaceInfo(a, [a, b], "dark").editor.sharedWith).toEqual([]);
    expect(themeSurfaceInfo(a, [a, b], "light").editor.sharedWith).toEqual(["B"]);
  });

  it("lists the editor themes of the mode that no app theme pairs", () => {
    const a = mk("a", "nord", "#000000");
    const unpaired = unpairedEditorThemes([a], "dark");
    expect(unpaired).toContain("dracula");
    expect(unpaired).not.toContain("nord");
    expect(unpaired).not.toContain("github-light");
  });

  it("only lists editor themes of the requested mode", () => {
    const unpaired = unpairedEditorThemes(listBuiltinThemes(), "light");
    for (const id of unpaired) expect(EDITOR_THEME_MODE[id]).toBe("light");
  });

  it("gives every builtin theme an editor and a terminal in both modes", () => {
    const all = listBuiltinThemes();
    for (const t of all)
      for (const mode of ["dark", "light"] as const) {
        const info = themeSurfaceInfo(t, all, mode);
        expect(info.editor.label).toBeTruthy();
        expect(info.terminal?.label).toBeTruthy();
      }
  });
});
