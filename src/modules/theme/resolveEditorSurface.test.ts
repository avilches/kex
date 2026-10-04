import { describe, expect, it } from "vitest";
import { resolveEditorSurface } from "./resolveEditorSurface";
import type { Theme } from "./types";

const app: Theme = {
  id: "app",
  name: "App",
  variants: {
    dark: { editor: { background: "#111111", foreground: "#eeeeee" } },
    light: {},
  },
};
const cm = (id: string) =>
  id === "nord" ? { background: "#2e3440", foreground: "#d8dee9" } : undefined;

describe("resolveEditorSurface", () => {
  it("auto uses the app theme's own editor surface for the mode", () => {
    expect(resolveEditorSurface("auto", app, "dark", cm)).toEqual({
      background: "#111111",
      foreground: "#eeeeee",
    });
  });

  it("auto has no override when the theme defines no editor surface", () => {
    expect(resolveEditorSurface("auto", app, "light", cm)).toBeUndefined();
  });

  it("an explicit editor theme lends its own surface, ignoring the app theme", () => {
    expect(resolveEditorSurface("nord", app, "dark", cm)).toEqual({
      background: "#2e3440",
      foreground: "#d8dee9",
    });
  });

  it("an explicit editor theme with an unknown surface has no override", () => {
    expect(resolveEditorSurface("dracula", app, "dark", cm)).toBeUndefined();
  });
});
