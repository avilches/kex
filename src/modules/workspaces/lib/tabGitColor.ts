import type { GitStatusSnapshot } from "@/lib/native";
import { gitStatusHexColor } from "@/modules/explorer/lib/gitStatusColor";
import { type GitStatusCode, lookupGitStatus } from "@/modules/explorer/lib/gitStatusUtils";
import type { GitColorScheme } from "@/modules/settings/store";
import type { Tab } from "./types";

export function tabGitColor(
  tab: Tab,
  statusMap: Map<string, GitStatusCode> | null | undefined,
  status: GitStatusSnapshot | null | undefined,
  scheme: GitColorScheme | undefined,
  mode: "light" | "dark",
): string | null {
  if (tab.kind !== "editor" || !statusMap || !status) return null;
  const code = lookupGitStatus(statusMap, status.repoRoot, tab.path);
  return code ? gitStatusHexColor(code, scheme ?? "vscode", mode) : null;
}
