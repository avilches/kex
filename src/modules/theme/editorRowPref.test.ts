import { describe, expect, it } from "vitest";
import {
  formatEditorRowPref,
  parseEditorRowPref,
  resolveEditorThemeId,
} from "./resolveEditorTheme";

describe("editor row pref", () => {
  it("round-trips with and without a pinned mode", () => {
    expect(parseEditorRowPref(formatEditorRowPref("kanagawa"))).toEqual({ id: "kanagawa" });
    expect(parseEditorRowPref(formatEditorRowPref("kanagawa", "light"))).toEqual({
      id: "kanagawa",
      mode: "light",
    });
  });

  it("is not a row pref for auto or a concrete editor theme", () => {
    expect(parseEditorRowPref("auto")).toBeUndefined();
    expect(parseEditorRowPref("nord")).toBeUndefined();
  });

  it("an unpinned row follows the app mode", () => {
    const pref = formatEditorRowPref("kanagawa");
    expect(resolveEditorThemeId(pref, "other", [], "dark")).toBe("kanagawa");
    expect(resolveEditorThemeId(pref, "other", [], "light")).toBe("kanagawa-lotus");
  });

  it("a pinned row keeps its mode whatever the app mode is", () => {
    const pref = formatEditorRowPref("kanagawa", "light");
    expect(resolveEditorThemeId(pref, "other", [], "dark")).toBe("kanagawa-lotus");
    expect(resolveEditorThemeId(pref, "other", [], "light")).toBe("kanagawa-lotus");
  });
});
