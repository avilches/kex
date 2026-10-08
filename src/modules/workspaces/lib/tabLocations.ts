import { allPanes } from "./splitNode";
import type { Workspace } from "./types";

export function tabLocations(
  workspaces: Pick<Workspace, "id" | "paneTree">[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const ws of workspaces) {
    for (const pane of allPanes(ws.paneTree)) {
      for (const tab of pane.tabs) out[tab.id] = ws.id;
    }
  }
  return out;
}

export function sameLocations(
  a: Record<string, string> | null,
  b: Record<string, string>,
): boolean {
  if (!a) return false;
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  return ak.every((k) => a[k] === b[k]);
}
