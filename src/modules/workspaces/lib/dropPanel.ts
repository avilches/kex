import { newPanelId } from "@/lib/ids";
import type { Panel } from "./types";

// A folder dropped onto the workspace opens a fresh terminal at that cwd
// (matching the explorer's "Open in Terminal"); a file opens an editor.
export function panelForDroppedPath(path: string, isDir: boolean): Panel {
  return isDir
    ? { id: newPanelId(), kind: "terminal", cwd: path }
    : { id: newPanelId(), kind: "editor", path, preview: false, dirty: false };
}
