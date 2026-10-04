import { describe, expect, it } from "vitest";
import {
  formatTerminalPref,
  parseTerminalPref,
  resolveTerminalPalette,
  terminalThemeOptions,
} from "./resolveTerminalTheme";
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

  it("a theme with a palette in only one mode lends it to the other mode", () => {
    expect(resolveTerminalPalette("other", app, catalog, "light")?.background).toBe("#222222");
  });

  it("auto uses the app theme's other-mode palette, with that mode's UI colors", () => {
    const darkOnly: Theme = {
      id: "dark-only",
      name: "Dark only",
      variants: {
        dark: {
          colors: { background: "#101010", foreground: "#dddddd" },
          terminal: { ansi: ansi("#e") },
        },
        light: { colors: { background: "#ffffff" } },
      },
    };
    const p = resolveTerminalPalette("auto", darkOnly, [darkOnly], "light");
    expect(p?.background).toBe("#101010");
    expect(p?.foreground).toBe("#dddddd");
  });

  it("falls back to the app palette when the choice has no palette in any mode", () => {
    expect(resolveTerminalPalette("plain", app, catalog, "dark")?.background).toBe("#111111");
  });

  it("falls back to the app palette for an unknown id", () => {
    expect(resolveTerminalPalette("gone", app, catalog, "dark")?.background).toBe("#111111");
  });

  it("returns undefined when neither side has a palette", () => {
    expect(resolveTerminalPalette("auto", noTerminal, catalog, "dark")).toBeUndefined();
  });
});

describe("resolveTerminalPalette borrowing from a theme without terminal colors", () => {
  const lender: Theme = {
    id: "lender",
    name: "Lender",
    variants: {
      dark: {
        colors: { background: "#2d353b", foreground: "#d3c6aa", accent: "#475258" },
        terminal: { ansi: ansi("#d") },
      },
    },
  };

  it("fills the missing surface colors from the lender's own colors", () => {
    const p = resolveTerminalPalette("lender", app, [app, lender], "dark");
    expect(p?.background).toBe("#2d353b");
    expect(p?.foreground).toBe("#d3c6aa");
    expect(p?.cursor).toBe("#d3c6aa");
    expect(p?.cursorAccent).toBe("#2d353b");
    expect(p?.selection).toBe("#475258");
  });

  it("keeps the colors the lender defines itself", () => {
    const own: Theme = {
      ...lender,
      variants: {
        dark: { ...lender.variants.dark, terminal: { background: "#000000", ansi: ansi("#d") } },
      },
    };
    expect(resolveTerminalPalette("lender", app, [app, own], "dark")?.background).toBe("#000000");
  });
});

describe("resolveTerminalPalette defaults come from the palette's own mode", () => {
  const kexLike: Theme = {
    id: "kex-like",
    name: "Kex like",
    variants: {
      dark: {
        colors: { background: "#2b2b2b" },
        terminal: { background: "#2b2b2b", selection: "rgba(64,140,255,0.35)" },
      },
      light: { colors: { background: "#ffffff" } },
    },
  };

  it("a dark palette lent to light mode keeps light text and cursor", () => {
    const p = resolveTerminalPalette("auto", kexLike, [kexLike], "light");
    expect(p?.background).toBe("#2b2b2b");
    expect(p?.foreground).toBe("#fafafa");
    expect(p?.cursor).toBe("#fafafa");
    expect(p?.cursorAccent).toBe("#2b2b2b");
  });

  it("a light palette lent to dark mode keeps dark text and cursor", () => {
    const lightOnly: Theme = {
      id: "light-only",
      name: "Light only",
      variants: { dark: {}, light: { colors: { background: "#ffffff" }, terminal: { ansi: ansi("#f") } } },
    };
    const p = resolveTerminalPalette("auto", lightOnly, [lightOnly], "dark");
    expect(p?.foreground).toBe("#0a0a0a");
    expect(p?.cursor).toBe("#0a0a0a");
  });
});

describe("terminalThemeOptions", () => {
  it("lists the themes with an ANSI palette in some mode", () => {
    expect(terminalThemeOptions(catalog, "dark").map((o) => o.id)).toEqual(["app", "other"]);
    expect(terminalThemeOptions(catalog, "light").map((o) => o.id)).toEqual(["app", "other"]);
  });
});

describe("terminal pref pinned to a mode", () => {
  const both: Theme = {
    id: "both",
    name: "Both",
    variants: {
      dark: { terminal: { background: "#010101", foreground: "#eeeeee", ansi: ansi("#333333") } },
      light: { terminal: { background: "#fefefe", foreground: "#111111", ansi: ansi("#444444") } },
    },
  };

  it("round trips the id and the pinned mode", () => {
    expect(parseTerminalPref(formatTerminalPref("both", "dark"))).toEqual({ id: "both", mode: "dark" });
    expect(parseTerminalPref(formatTerminalPref("both"))).toEqual({ id: "both" });
  });

  it("an id that merely contains the separator is not read as pinned", () => {
    expect(parseTerminalPref("a@b")).toEqual({ id: "a@b" });
  });

  it("a pinned dark palette is used on a light app", () => {
    expect(resolveTerminalPalette("both@dark", app, [app, both], "light")?.background).toBe("#010101");
  });

  it("an unpinned pref follows the app mode", () => {
    expect(resolveTerminalPalette("both", app, [app, both], "light")?.background).toBe("#fefefe");
  });
});
