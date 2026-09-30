import { describe, expect, it } from "vitest";
import { EDITOR_PREVIEW_SAMPLE, resolvePreviewThemeId } from "./editorThemePreview";

describe("resolvePreviewThemeId", () => {
  it("shows the highlighted theme over the committed one", () => {
    expect(resolvePreviewThemeId("nord", "dracula", "kanagawa", [], "dark")).toBe("nord");
  });

  it("falls back to the committed pref when nothing is highlighted", () => {
    expect(resolvePreviewThemeId(null, "dracula", "kanagawa", [], "dark")).toBe("dracula");
  });

  it("resolves a highlighted auto through the active app theme", () => {
    expect(resolvePreviewThemeId("auto", "nord", "kanagawa", [], "dark")).toBe("kanagawa");
    expect(resolvePreviewThemeId("auto", "nord", "kanagawa", [], "light")).toBe("kanagawa-lotus");
  });

  it("resolves a committed auto when nothing is highlighted", () => {
    expect(resolvePreviewThemeId(null, "auto", "kanagawa", [], "light")).toBe("kanagawa-lotus");
  });

  it("ships a non-empty sample", () => {
    expect(EDITOR_PREVIEW_SAMPLE.length).toBeGreaterThan(50);
  });
});
