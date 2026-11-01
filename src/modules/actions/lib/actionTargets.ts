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

/** Which combos of the Header an app shows up in, for the preview of the edit modal: the Actions
 * menu when it opens folders, the File combo when it edits files. Neither means it is not offered. */
export function appCombos(accepts: AppAccepts): { actions: boolean; file: boolean } {
  return { actions: acceptsFolder(accepts), file: acceptsFile(accepts) };
}

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

/** The Header bar never changes with the focused tab, so it carries only what needs no tab: an
 * agent, an Action of the workspace, and an app that takes a folder (it opens the workspace root). */
export function inBar(action: Action): boolean {
  if (isAgent(action)) return true;
  if (isApp(action)) return acceptsFolder(appAccepts(action));
  return action.runs === "workspace" || action.runs === "fixed";
}

/** Whether the context combo lists the Action for the focused tab. An agent never, and an app
 * only for a file: a folder is reached from the Header or the Actions menu of a row. */
export function inCombo(action: Action, place: FocusPlace): boolean {
  if (isAgent(action)) return false;
  if (isApp(action)) return place.file && acceptsFile(appAccepts(action));
  const target = actionTarget(action);
  return target === "file" ? place.file : target === "folder" ? place.folder : false;
}

/** Whether an Action in the context combo only ever works on a file, which words its note. */
export function acceptsOnlyFile(action: Action): boolean {
  if (isApp(action)) return appAccepts(action) === "file";
  return actionTarget(action) === "file";
}

/** Whether the combo has anything it could ever list, which decides if it is drawn at all. */
export function comboCandidate(action: Action): boolean {
  if (isAgent(action)) return false;
  if (isApp(action)) return acceptsFile(appAccepts(action));
  return action.runs === "file";
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
