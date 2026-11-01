import { DEFAULT_ACCEPTS, type AppAccepts } from "@/modules/external-editors/catalog";
import { commandVariablesUsed } from "./commandTemplate";
import { isAgent, isApp, type Action } from "./types";

// A script reads its place from the variables of its command; one Action has one target, so
// {filepath} and {workspace} together make a file Action. An app says what it accepts instead,
// and {target} stands for the place it is offered at.
export type ActionTarget = "file" | "folder" | "workspace";

const FOLDER_VARS = new Set(["cwd", "dir", "branch", "repo"]);

/** The target a command asks for through its variables. */
export function actionTarget(command: string): ActionTarget {
  const used = commandVariablesUsed(command);
  if (used.has("filepath") || used.has("filename")) return "file";
  for (const name of used) if (FOLDER_VARS.has(name)) return "folder";
  return "workspace";
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
  return actionTarget(action.command) === "workspace";
}

/** Whether the context combo lists the Action for the focused tab. An agent never, and an app
 * only for a file: a folder is reached from the Header or the Actions menu of a row. */
export function inCombo(action: Action, place: FocusPlace): boolean {
  if (isAgent(action)) return false;
  if (isApp(action)) return place.file && acceptsFile(appAccepts(action));
  const target = actionTarget(action.command);
  return target === "file" ? place.file : target === "folder" ? place.folder : false;
}

/** Whether an Action in the context combo only ever works on a file, which words its note. */
export function acceptsOnlyFile(action: Action): boolean {
  if (isApp(action)) return appAccepts(action) === "file";
  return actionTarget(action.command) === "file";
}

/** Whether the combo has anything it could ever list, which decides if it is drawn at all. */
export function comboCandidate(action: Action): boolean {
  if (isAgent(action)) return false;
  if (isApp(action)) return acceptsFile(appAccepts(action));
  return actionTarget(action.command) !== "workspace";
}
