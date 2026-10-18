import { gitStatusCategory, type GitStatusCategory, type GitStatusCode } from "./gitStatusUtils";
import type { GitColorScheme } from "@/modules/settings/store";

// Every table reaches 4.5:1 on the sidebar of every built-in theme of its mode
// (themes/contrast.test.ts), so the values are the original palette nudged to
// clear the worst sidebar, not tuned per theme.
const VSCODE_HEX_BY_CATEGORY: Record<GitStatusCategory, string> = {
  modified: "#E2C08D",
  added: "#85BA8E",
  untracked: "#73C991",
  renamed: "#73C991",
  deleted: "#E09E92",
};

const JETBRAINS_HEX_BY_CATEGORY: Record<GitStatusCategory, string> = {
  modified: "#8FB2CD",
  added: "#94B88B",
  untracked: "#DF9E9B",
  renamed: "#8FB2CD",
  deleted: "#AEAEAE",
};

// The dark palettes are pastel and wash out on a light background, so light
// mode gets saturated, darker counterparts of the same hues.
const VSCODE_LIGHT_HEX_BY_CATEGORY: Record<GitStatusCategory, string> = {
  modified: "#8C4C00",
  added: "#16692E",
  untracked: "#0A693B",
  renamed: "#0A693B",
  deleted: "#A93226",
};

const JETBRAINS_LIGHT_HEX_BY_CATEGORY: Record<GitStatusCategory, string> = {
  modified: "#285F97",
  added: "#27692A",
  untracked: "#A93226",
  renamed: "#285F97",
  deleted: "#5C5C5C",
};

export function gitStatusHexColor(
  code: GitStatusCode,
  scheme: GitColorScheme,
  mode: "light" | "dark" = "dark",
): string | null {
  const category = gitStatusCategory(code);
  if (!category) return null;
  const light = mode === "light";
  const table =
    scheme === "vscode"
      ? light ? VSCODE_LIGHT_HEX_BY_CATEGORY : VSCODE_HEX_BY_CATEGORY
      : light ? JETBRAINS_LIGHT_HEX_BY_CATEGORY : JETBRAINS_HEX_BY_CATEGORY;
  return table[category];
}
