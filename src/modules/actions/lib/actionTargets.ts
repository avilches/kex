import { DEFAULT_ACCEPTS, type AppAccepts } from "@/modules/external-editors/catalog";
import { isAgent, isApp, type Action } from "./types";

export type ActionTarget = "file" | "folder" | "workspace";

/** The place a script acts on, from where it was told to run. A fixed folder, like the workspace
 * root, is a place of its own that no menu changes. */
export function actionTarget(action: Pick<Action, "runs">): ActionTarget {
  return action.runs === "file" ? "file" : action.runs === "folder" ? "folder" : "workspace";
}

/** What an app takes, a folder when it never said. */
export function appAccepts(action: Pick<Action, "accepts">): AppAccepts {
  return action.accepts ?? DEFAULT_ACCEPTS;
}

/** The words for what an app takes, for the Add combo and the edit modal. */
export const ACCEPTS_LABELS: Record<AppAccepts, string> = {
  file: "Files",
  folder: "Folders",
  both: "Files and folders",
};

export const acceptsFolder = (a: AppAccepts): boolean => a !== "file";
export const acceptsFile = (a: AppAccepts): boolean => a !== "folder";

/** The two switches of the edit modal as one value. With neither on there is nothing to open, so
 * it returns the current value: the last switch cannot be turned off. */
export function acceptsFromSwitches(files: boolean, folders: boolean, current: AppAccepts): AppAccepts {
  if (files && folders) return "both";
  if (files) return "file";
  if (folders) return "folder";
  return current;
}

/** Where the focused tab is: a terminal gives a folder, a tab with a path gives a file. */
export type FocusPlace = { file: boolean; folder: boolean };

/** Whether the Header carries the Action. The Header never changes with the focused tab, so it carries
 * what acts on the workspace root: an agent, an app that takes a folder, and a script that runs on any
 * folder (it acts on the root from there), only in the root or in one fixed folder. A script on any file
 * and an app that only edits files need a file, which the Header does not have. */
export function inHeader(action: Action): boolean {
  if (isAgent(action)) return true;
  if (isApp(action)) return acceptsFolder(appAccepts(action));
  return action.runs !== "file";
}

/** Whether a menu or the focused-tab submenu on a folder or a file offers the Action: exactly what it
 * acts on. A script that always runs in the root or in one fixed folder acts on no row. */
export function offeredAt(action: Action, place: "folder" | "file"): boolean {
  return takes(action)[place];
}

/** What an Action can act on: an agent a folder, an app what it says it accepts, a script the one
 * place it runs on. A script that runs in the workspace root or a fixed folder acts on neither. */
export function takes(action: Action): { folder: boolean; file: boolean } {
  if (isAgent(action)) return { folder: true, file: false };
  if (isApp(action)) {
    const accepts = appAccepts(action);
    return { folder: acceptsFolder(accepts), file: acceptsFile(accepts) };
  }
  return { folder: action.runs === "folder", file: action.runs === "file" };
}
