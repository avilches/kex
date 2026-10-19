import { describe, expect, it } from "vitest";
import {
  blockRulerColors,
  blockRulersFromVars,
  DEFAULT_BLOCK_RULERS,
  DEFAULT_SEARCH_HIGHLIGHT,
  searchHighlightColors,
  searchHighlightFromVars,
} from "./terminalHighlight";
import type { TerminalPalette } from "./types";

const dark = {
  colors: { primary: "#c4b5fd", destructive: "#ef4444" },
  terminal: {
    background: "#1c1c1c",
    foreground: "#d4d4d4",
    ansi: [
      "#101010",
      "#cc241d",
      "#98971a",
      "#d79939",
      "#458588",
      "#b16286",
      "#689d6a",
      "#a89984",
      "#282828",
      "#fb4934",
      "#b8bb26",
      "#fabd2f",
      "#83a598",
      "#d3869b",
      "#8ec07c",
      "#ebdbb2",
    ] as unknown as TerminalPalette["ansi"],
  },
};

function composite(fg: string, over: string, alpha: number): string {
  const h = (s: string) => [
    Number.parseInt(s.slice(1, 3), 16),
    Number.parseInt(s.slice(3, 5), 16),
    Number.parseInt(s.slice(5, 7), 16),
  ];
  const [fr, fgc, fb] = h(fg);
  const [br, bgg, bb] = h(over);
  const mix = (f: number, o: number) =>
    Math.round(o + (f - o) * alpha)
      .toString(16)
      .padStart(2, "0");
  return `#${mix(fr, br)}${mix(fgc, bgg)}${mix(fb, bb)}`;
}

describe("searchHighlightColors", () => {
  it("falls back to the defaults without a terminal background", () => {
    expect(searchHighlightColors(undefined, undefined)).toEqual(
      DEFAULT_SEARCH_HIGHLIGHT,
    );
    expect(
      searchHighlightColors(dark.colors, { foreground: "#111111" }),
    ).toEqual(DEFAULT_SEARCH_HIGHLIGHT);
  });

  it("derives the match wash from the terminal foreground over its background", () => {
    const result = searchHighlightColors(undefined, {
      background: "#1c1c1c",
      foreground: "#d4d4d4",
    });
    expect(result.matchBackground).toBe(composite("#d4d4d4", "#1c1c1c", 0.3));
  });

  it("derives the active match from the theme primary", () => {
    const light = {
      colors: { primary: "#7c3aed" },
      terminal: { background: "#ffffff", foreground: "#222222" },
    };
    const result = searchHighlightColors(light.colors, light.terminal);
    expect(result.activeMatchColorOverviewRuler).toBe("#7c3aed");
    expect(result.activeMatchBackground).toBe(
      composite("#7c3aed", "#ffffff", 0.45),
    );
    expect(result.matchOverviewRuler).toBe(
      composite("#7c3aed", "#ffffff", 0.55),
    );
  });

  it("differs between a dark and a light palette", () => {
    const darkResult = searchHighlightColors(dark.colors, dark.terminal);
    const lightResult = searchHighlightColors(
      { primary: "#7c3aed" },
      {
        background: "#ffffff",
        foreground: "#222222",
      },
    );
    expect(darkResult.matchBackground).not.toBe(lightResult.matchBackground);
  });
});

describe("blockRulerColors", () => {
  it("takes ok from bright cyan and fail from destructive", () => {
    expect(blockRulerColors(dark.colors, dark.terminal)).toEqual({
      ok: "#8ec07c",
      fail: "#ef4444",
    });
  });

  it("falls back to the defaults for missing tokens", () => {
    expect(blockRulerColors(undefined, undefined)).toEqual(
      DEFAULT_BLOCK_RULERS,
    );
  });
});

describe("var readers", () => {
  it("uses the provided CSS variables when present", () => {
    const vars: Record<string, string> = {
      "--terminal-search-match": "#112233",
      "--terminal-search-active": "#aa0000",
    };
    const result = searchHighlightFromVars((n) => vars[n] ?? "");
    expect(result.matchBackground).toBe("#112233");
    expect(result.activeMatchBackground).toBe("#aa0000");
    expect(result.matchOverviewRuler).toBe(
      DEFAULT_SEARCH_HIGHLIGHT.matchOverviewRuler,
    );
    expect(result.activeMatchColorOverviewRuler).toBe(
      DEFAULT_SEARCH_HIGHLIGHT.activeMatchColorOverviewRuler,
    );
  });

  it("falls back for missing ruler vars", () => {
    expect(blockRulersFromVars(() => "")).toEqual(DEFAULT_BLOCK_RULERS);
    const vars: Record<string, string> = {
      "--terminal-block-ruler-ok": "#00ff00",
    };
    expect(blockRulersFromVars((n) => vars[n] ?? "").ok).toBe("#00ff00");
  });
});
