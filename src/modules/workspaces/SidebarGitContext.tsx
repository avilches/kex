import { createContext, useContext } from "react";
import type { GitStatusSnapshot } from "@/lib/native";
import type { GitStatusCode } from "@/modules/explorer/lib/gitStatusUtils";
import type { GitColorScheme } from "@/modules/settings/store";

// Git status exists only for the active workspace, so the rows of any other
// workspace must ignore it.
export type SidebarGit = {
  workspaceId: string;
  status: GitStatusSnapshot | null;
  statusMap: Map<string, GitStatusCode> | null;
  scheme: GitColorScheme;
};

const SidebarGitContext = createContext<SidebarGit | null>(null);

export const SidebarGitProvider = SidebarGitContext.Provider;

export function useSidebarGit(): SidebarGit | null {
  return useContext(SidebarGitContext);
}
