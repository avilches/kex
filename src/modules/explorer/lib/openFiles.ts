import { allPanes } from "@/modules/workspaces/lib/splitNode";
import type { SplitNode } from "@/modules/workspaces/lib/types";

// Maps each file open in a tab to whether every tab showing it is a preview.
export function openFilePaths(
  tree: SplitNode | null | undefined,
): Map<string, boolean> {
  const paths = new Map<string, boolean>();
  if (!tree) return paths;
  for (const pane of allPanes(tree)) {
    for (const tab of pane.tabs) {
      if (tab.kind === "editor" || tab.kind === "markdown") {
        const key = tab.path.replace(/\\/g, "/");
        paths.set(key, (paths.get(key) ?? true) && tab.preview === true);
      }
    }
  }
  return paths;
}
