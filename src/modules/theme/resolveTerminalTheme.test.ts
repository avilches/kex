import { describe, expect, it } from "vitest";
import { resolveTerminalPalette, terminalThemeOptions } from "./resolveTerminalTheme";
import type { TerminalPalette, Theme } from "./types";

const ansi = (c: string) =>
  Array.from({ length: 16 }, () => c) as unknown as NonNullable<TerminalPalette["ansi"]>;

const app: Theme = {
  id: "app",
  name: "App",
  variants: {
    dark: { terminal: { background: "#111111", ansi: ansi("#a") } },
    light: { terminal: { background: "#eeeeee", ansi: ansi("#b") } },
  },
};
const other: Theme = {
  id: "other",
  name: "Other",
  variants: {
    dark: { terminal: { background: "#222222", ansi: ansi("#c") } },
  },
};
const noTerminal: Theme = { id: "plain", name: "Plain", variants: { dark: {}, light: {} } };
const catalog = [app, other, noTerminal];

describe("resolveTerminalPalette", () => {
  it("auto uses the app theme palette for the mode", () => {
    expect(resolveTerminalPalette("auto", app, catalog, "dark")?.background).toBe("#111111");
    expect(resolveTerminalPalette("auto", app, catalog, "light")?.background).toBe("#eeeeee");
  });

  it("a concrete choice replaces the app palette", () => {
    expect(resolveTerminalPalette("other", app, catalog, "dark")?.background).toBe("#222222");
  });

  it("falls back to the app palette when the choice has none for this mode", () => {
    expect(resolveTerminalPalette("other", app, catalog, "light")?.background).toBe("#eeeeee");
    expect(resolveTerminalPalette("plain", app, catalog, "dark")?.background).toBe("#111111");
  });

  it("falls back to the app palette for an unknown id", () => {
    expect(resolveTerminalPalette("gone", app, catalog, "dark")?.background).toBe("#111111");
  });

  it("returns undefined when neither side has a palette", () => {
    expect(resolveTerminalPalette("auto", noTerminal, catalog, "dark")).toBeUndefined();
  });
});

describe("terminalThemeOptions", () => {
  it("lists only themes with an ANSI palette in the mode", () => {
    expect(terminalThemeOptions(catalog, "dark").map((o) => o.id)).toEqual(["app", "other"]);
    expect(terminalThemeOptions(catalog, "light").map((o) => o.id)).toEqual(["app"]);
  });
});
