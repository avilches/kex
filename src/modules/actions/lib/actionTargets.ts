import type { AppAccepts } from "@/modules/external-editors/catalog";
import { commandVariablesUsed } from "./commandTemplate";
import { isAgent, isApp, type Action } from "./types";

// What an Action binds to. A script reads it from the variables its command uses (the file it
// opens, the folder it runs in, or nothing local, so it is a matter of the workspace alone); one
// Action has one target, so {filepath} and {workspace} together make a file Action. An app that
// uses {target} does not read it from its command: it says what it accepts, and the same app is
// offered wherever that fits, with {target} standing for the place it is offered at.
export type ActionTarget = "file" | "folder" | "workspace";

const FOLDER_VARS = new Set(["cwd", "dir", "branch", "repo"]);

/** The target a command asks for through its variables. */
export function actionTarget(command: string): ActionTarget {
  const used = commandVariablesUsed(command);
  if (used.has("filepath") || used.has("filename")) return "file";
  for (const name of used) if (FOLDER_VARS.has(name)) return "folder";
  return "workspace";
}

/** Whether an app reads its place from `accepts` and {target}. An app saved with a command that
 * names its place with a variable of its own ({filepath}, {cwd}, {workspace}) is placed by that
 * variable like a script, so it keeps behaving as it did and never moves with the focused tab. */
export function usesTarget(action: Pick<Action, "kind"> & Partial<Pick<Action, "command">>): boolean {
  return isApp(action) && commandVariablesUsed(action.command ?? "").has("target");
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
 * agent, an Action of the workspace, and an app that takes a folder, which opens the workspace
 * root. An app that only takes files has nothing to open from the bar. */
export function inBar(action: Action): boolean {
  if (isAgent(action)) return true;
  if (usesTarget(action)) return acceptsFolder(appAccepts(action));
  return actionTarget(action.command) === "workspace";
}

/** Whether the context combo lists the Action for the focused tab: an app by what it accepts,
 * anything else by the variables of its command. An agent never, because its place is the bar. */
export function inCombo(action: Action, place: FocusPlace): boolean {
  if (isAgent(action)) return false;
  if (usesTarget(action)) {
    const accepts = appAccepts(action);
    return (place.folder && acceptsFolder(accepts)) || (place.file && acceptsFile(accepts));
  }
  const target = actionTarget(action.command);
  return target === "file" ? place.file : target === "folder" ? place.folder : false;
}

/** Whether an Action in the context combo only ever works on a file, which words its note. */
export function acceptsOnlyFile(action: Action): boolean {
  if (usesTarget(action)) return appAccepts(action) === "file";
  return actionTarget(action.command) === "file";
}

/** Whether the combo has anything it could ever list, which decides if it is drawn at all. */
export function comboCandidate(action: Action): boolean {
  if (isAgent(action)) return false;
  if (usesTarget(action)) return true;
  return actionTarget(action.command) !== "workspace";
}
