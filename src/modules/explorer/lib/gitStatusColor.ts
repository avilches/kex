import type { GitStatusCode } from "./gitStatusUtils";
import type { GitColorScheme } from "@/modules/settings/store";

const VSCODE_HEX: Record<GitStatusCode, string> = {
  M: "#E2C08D",
  A: "#81B88B",
  U: "#73C991",
  R: "#73C991",
  D: "#C74E39",
};

const JETBRAINS_HEX: Record<GitStatusCode, string> = {
  M: "#6897BB",
  A: "#629755",
  U: "#C75450",
  R: "#6897BB",
  D: "#9E9E9E",
};

export function gitStatusHexColor(
  code: GitStatusCode,
  scheme: GitColorScheme,
): string | null {
  return (scheme === "vscode" ? VSCODE_HEX : JETBRAINS_HEX)[code] ?? null;
}
