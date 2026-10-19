import { flattenColor, normalizeHex } from "@/modules/theme/readableColors";
import type { TerminalPalette, ThemeColors } from "@/modules/theme/types";

export type SearchHighlightColors = {
  matchBackground: string;
  activeMatchBackground: string;
  matchOverviewRuler: string;
  activeMatchColorOverviewRuler: string;
};

export type BlockRulerColors = { ok: string; fail: string };

export const DEFAULT_SEARCH_HIGHLIGHT: SearchHighlightColors = {
  matchBackground: "#515c6a",
  activeMatchBackground: "#d18616",
  matchOverviewRuler: "#d18616",
  activeMatchColorOverviewRuler: "#d18616",
};

export const DEFAULT_BLOCK_RULERS: BlockRulerColors = {
  ok: "#5fb3b3",
  fail: "#e5706b",
};

const MATCH_ALPHA = 0.3;
const ACTIVE_MATCH_ALPHA = 0.45;
const MATCH_RULER_ALPHA = 0.55;

export function searchHighlightColors(
  colors: ThemeColors | undefined,
  terminal: TerminalPalette | undefined,
): SearchHighlightColors {
  const bg = terminal?.background ? normalizeHex(terminal.background) : null;
  if (!bg) return DEFAULT_SEARCH_HIGHLIGHT;
  const over = (
    fg: string | undefined,
    alpha: number,
    fallback: string,
  ): string => {
    const rgb = fg ? normalizeHex(fg) : null;
    if (!rgb) return fallback;
    const value = `rgb(${Number.parseInt(rgb.slice(1, 3), 16)}, ${Number.parseInt(rgb.slice(3, 5), 16)}, ${Number.parseInt(rgb.slice(5, 7), 16)}, ${alpha})`;
    return flattenColor(value, bg) ?? fallback;
  };
  return {
    matchBackground: over(
      terminal?.foreground,
      MATCH_ALPHA,
      DEFAULT_SEARCH_HIGHLIGHT.matchBackground,
    ),
    activeMatchBackground: over(
      colors?.primary,
      ACTIVE_MATCH_ALPHA,
      DEFAULT_SEARCH_HIGHLIGHT.activeMatchBackground,
    ),
    matchOverviewRuler: over(
      colors?.primary,
      MATCH_RULER_ALPHA,
      DEFAULT_SEARCH_HIGHLIGHT.matchOverviewRuler,
    ),
    activeMatchColorOverviewRuler: over(
      colors?.primary,
      1,
      DEFAULT_SEARCH_HIGHLIGHT.activeMatchColorOverviewRuler,
    ),
  };
}

export function blockRulerColors(
  colors: ThemeColors | undefined,
  terminal: TerminalPalette | undefined,
): BlockRulerColors {
  const ok = terminal?.ansi?.[14] ? normalizeHex(terminal.ansi[14]) : null;
  const fail = colors?.destructive ? normalizeHex(colors.destructive) : null;
  return {
    ok: ok ?? DEFAULT_BLOCK_RULERS.ok,
    fail: fail ?? DEFAULT_BLOCK_RULERS.fail,
  };
}

function read(
  getVar: (name: string) => string,
  name: string,
  fallback: string,
): string {
  const value = getVar(name).trim();
  return value || fallback;
}

export function searchHighlightFromVars(
  getVar: (name: string) => string,
): SearchHighlightColors {
  return {
    matchBackground: read(
      getVar,
      "--terminal-search-match",
      DEFAULT_SEARCH_HIGHLIGHT.matchBackground,
    ),
    activeMatchBackground: read(
      getVar,
      "--terminal-search-active",
      DEFAULT_SEARCH_HIGHLIGHT.activeMatchBackground,
    ),
    matchOverviewRuler: read(
      getVar,
      "--terminal-search-match-ruler",
      DEFAULT_SEARCH_HIGHLIGHT.matchOverviewRuler,
    ),
    activeMatchColorOverviewRuler: read(
      getVar,
      "--terminal-search-active-ruler",
      DEFAULT_SEARCH_HIGHLIGHT.activeMatchColorOverviewRuler,
    ),
  };
}

export function blockRulersFromVars(
  getVar: (name: string) => string,
): BlockRulerColors {
  return {
    ok: read(getVar, "--terminal-block-ruler-ok", DEFAULT_BLOCK_RULERS.ok),
    fail: read(
      getVar,
      "--terminal-block-ruler-fail",
      DEFAULT_BLOCK_RULERS.fail,
    ),
  };
}
