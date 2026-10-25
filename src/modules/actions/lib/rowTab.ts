import type { Tab } from "@/modules/workspaces/lib/types";

// A folder seen as the terminal an Action would run from.
export function rowTabAt(path: string): Tab {
  return { id: "ctx-folder", kind: "terminal", cwd: path, title: "" };
}
