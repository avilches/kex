import type { GitStatusCode } from "./gitStatusUtils";
import type { GitColorScheme } from "@/modules/settings/store";

const VSCODE: Record<GitStatusCode, string> = {
  M: "text-[#E2C08D]",
  A: "text-[#81B88B]",
  U: "text-[#73C991]",
  R: "text-[#73C991]",
  D: "text-[#C74E39]",
};

const JETBRAINS: Record<GitStatusCode, string> = {
  M: "text-[#6897BB]",
  A: "text-[#629755]",
  U: "text-[#C75450]",
  R: "text-[#6897BB]",
  D: "text-[#9E9E9E]",
};

export function explorerGitTextClass(
  code: GitStatusCode,
  scheme: GitColorScheme,
): string | null {
  if (scheme === "none") return null;
  return (scheme === "vscode" ? VSCODE : JETBRAINS)[code] ?? null;
}
