import { createContext, useContext } from "react";

// Resolved color of the workspace a pane tree belongs to (null: no color).
const WorkspaceColorContext = createContext<string | null>(null);

export const WorkspaceColorProvider = WorkspaceColorContext.Provider;

export function useWorkspaceColor(): string | null {
  return useContext(WorkspaceColorContext);
}
