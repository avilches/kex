import { gitStatusCategory, type GitStatusCategory, type GitStatusCode } from "./gitStatusUtils";
import type { GitColorScheme } from "@/modules/settings/store";

const VSCODE_HEX_BY_CATEGORY: Record<GitStatusCategory, string> = {
  modified: "#E2C08D",
  added: "#81B88B",
  untracked: "#73C991",
  renamed: "#73C991",
  deleted: "#C74E39",
};

const JETBRAINS_HEX_BY_CATEGORY: Record<GitStatusCategory, string> = {
  modified: "#6897BB",
  added: "#629755",
  untracked: "#C75450",
  renamed: "#6897BB",
  deleted: "#9E9E9E",
};

// The dark palettes are pastel and wash out on a light background, so light
// mode gets saturated, darker counterparts of the same hues.
const VSCODE_LIGHT_HEX_BY_CATEGORY: Record<GitStatusCategory, string> = {
  modified: "#C26A00",
  added: "#1E8E3E",
  untracked: "#0F9D58",
  renamed: "#0F9D58",
  deleted: "#C0392B",
};

const JETBRAINS_LIGHT_HEX_BY_CATEGORY: Record<GitStatusCategory, string> = {
  modified: "#2F6FB0",
  added: "#2E7D32",
  untracked: "#C0392B",
  renamed: "#2F6FB0",
  deleted: "#757575",
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
