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

export function gitStatusHexColor(
  code: GitStatusCode,
  scheme: GitColorScheme,
): string | null {
  const category = gitStatusCategory(code);
  if (!category) return null;
  return (scheme === "vscode" ? VSCODE_HEX_BY_CATEGORY : JETBRAINS_HEX_BY_CATEGORY)[
    category
  ];
}
