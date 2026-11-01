import type { AppAccepts } from "@/modules/external-editors/catalog";
import { commandVariablesUsed } from "./commandTemplate";
import { isAgent, isApp, type Action } from "./types";

// What an Action binds to. A script reads it from the variables its command uses (the file it
// opens, the folder it runs in, or nothing local, so it is a matter of the workspace alone); one
// Action has one target, so {filepath} and {workspace} together make a file Action. An app does
// not read it from its command: it says what it accepts, and the same app is offered wherever
// that fits, with {target} standing for the place it is offered at.
export type ActionTarget = "file" | "folder" | "workspace";

const FOLDER_VARS = new Set(["cwd", "dir", "branch", "repo"]);

/** The target a script's command asks for. */
export function actionTarget(command: string): ActionTarget {
  const used = commandVariablesUsed(command);
  if (used.has("filepath") || used.has("filename")) return "file";
  for (const name of used) if (FOLDER_VARS.has(name)) return "folder";
  return "workspace";
}

/** What an app takes, a folder when it never said. */
export function appAccepts(action: Pick<Action, "accepts">): AppAccepts {
  return action.accepts ?? "folder";
}

/** The words for what an app takes, for the Add combo and the edit modal. */
export const ACCEPTS_LABELS: Record<AppAccepts, string> = {
  file: "Files",
  folder: "Folders",
  both: "Files and folders",
};

export const acceptsFolder = (a: AppAccepts): boolean => a !== "file";
export const acceptsFile = (a: AppAccepts): boolean => a !== "folder";

/** Where the focused tab is: a terminal gives a folder, a tab with a path gives a file. */
export type FocusPlace = { file: boolean; folder: boolean };

/** The Header bar never changes with the focused tab, so it carries only what needs no tab: an
 * agent, a workspace script, and an app that accepts a folder, which starts in the workspace
 * root. An app that only takes files has nothing to open from the bar. */
export function inBar(action: Action): boolean {
  if (isAgent(action)) return true;
  if (isApp(action)) return acceptsFolder(appAccepts(action));
  return actionTarget(action.command) === "workspace";
}

/** Whether the context combo lists the Action for the focused tab: an app by what it accepts,
 * a script by the variables of its command. An agent never, because its place is the bar. */
export function inCombo(action: Action, place: FocusPlace): boolean {
  if (isAgent(action)) return false;
  if (isApp(action)) {
    const accepts = appAccepts(action);
    return (place.folder && acceptsFolder(accepts)) || (place.file && acceptsFile(accepts));
  }
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
  if (isApp(action)) return true;
  return actionTarget(action.command) !== "workspace";
}
