import { allPanes } from "@/modules/workspaces/lib/splitNode";
import type { SplitNode } from "@/modules/workspaces/lib/types";

export function openFilePaths(tree: SplitNode | null | undefined): Set<string> {
  const paths = new Set<string>();
  if (!tree) return paths;
  for (const pane of allPanes(tree)) {
    for (const tab of pane.tabs) {
      if (tab.kind === "editor" || tab.kind === "markdown") {
        paths.add(tab.path.replace(/\\/g, "/"));
      }
    }
  }
  return paths;
}
