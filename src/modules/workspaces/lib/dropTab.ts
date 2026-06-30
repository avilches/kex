import { newTabId } from "@/lib/ids";
import type { Tab } from "./types";

// A folder dropped onto the workspace opens a fresh terminal at that cwd
// (matching the explorer's "Open in Terminal"); a file opens an editor.
export function tabForDroppedPath(path: string, isDir: boolean): Tab {
  return isDir
    ? { id: newTabId(), kind: "terminal", cwd: path }
    : { id: newTabId(), kind: "editor", path, preview: false, dirty: false };
}
