import { pathDirname } from "@/lib/pathUtils";

// Values a run takes from where it was launched instead of the focused tab: the context menus
// (explorer rows, breadcrumbs, tabs) and the context combo of the Header run an Action against
// their own folder or file.
export type RunOverlay = {
  /** Values that replace the focused tab's, key by key. */
  vars?: Readonly<Record<string, string>>;
  /** Where a spawned app or an agent is launched from; the folder or file folder of the row. */
  spawnCwd?: string;
  /** The workspace to run in when it is not the active one (a row of the new terminal palette). */
  workspaceId?: string;
};

/** The overlay of an app opened on `target` from the context combo: {target} becomes that folder
 * or file, and the app is launched from the folder (the file's own folder for a file). */
export function runOverlayFor(target: string, kind: "file" | "folder" = "folder"): RunOverlay {
  const folder = kind === "file" ? pathDirname(target) : target;
  return { vars: { target }, spawnCwd: folder };
}
