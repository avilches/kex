import { scriptCwdProblem } from "@/modules/workspaces/lib/scriptCwd";
import {
  TITLE_VARIABLE_DOCS,
  type TitleVariableGroup,
} from "@/modules/workspaces/lib/titleTemplate";
import type { ScriptCwdMode } from "@/modules/workspaces/lib/types";
import type { AppSuggestion } from "./appSuggestions";
import {
  commandProblem,
  missingVariables,
  unsafeVariables,
  type CommandShell,
} from "./commandTemplate";
import type { Action } from "./types";

// A command runs against a place (folder, file, workspace), never against a running
// program or a browser page, so only these variables exist for it.
const COMMAND_VARIABLES = ["cwd", "dir", "branch", "repo", "workspace", "file", "path", "host"] as const;

export type CommandVariable = (typeof COMMAND_VARIABLES)[number];

export type CommandVariableDoc = {
  name: CommandVariable;
  description: string;
  group: TitleVariableGroup;
};

export function commandVariableDocs(): CommandVariableDoc[] {
  return COMMAND_VARIABLES.flatMap((name) => {
    const doc = TITLE_VARIABLE_DOCS.find((v) => v.name === name);
    return doc ? [{ name, description: doc.description, group: doc.group }] : [];
  });
}

export const CWD_MODE_LABELS: Record<ScriptCwdMode, string> = {
  workspace: "Workspace root folder",
  context: "Last folder from terminal or editor",
  fixed: "Fixed folder",
};

// Switching kind keeps what the user wrote. A script gains the folder choice it did not
// have; an app loses it, since an app is launched from the folder of its own command.
export function withKind(action: Action, runInTerminal: boolean): Action {
  if (action.runInTerminal === runInTerminal) return action;
  if (!runInTerminal) {
    const { cwdMode: _mode, cwd: _cwd, ...rest } = action;
    return { ...rest, runInTerminal };
  }
  return { ...action, runInTerminal, cwdMode: action.cwdMode ?? "workspace" };
}

// Picking a suggestion fills the name, the icon (through appId) and the command. A name
// the user already typed is theirs and stays.
export function withSuggestion(action: Action, suggestion: AppSuggestion): Action {
  const next: Action = {
    ...action,
    runInTerminal: false,
    command: suggestion.defaultCommand,
    name: action.name.trim() ? action.name : suggestion.name,
  };
  delete next.cwdMode;
  delete next.cwd;
  if (suggestion.appId) next.appId = suggestion.appId;
  else delete next.appId;
  return next;
}

export type ActionProblem = { kind: "command" | "cwd" | "context"; message: string };

function formatNames(names: readonly string[]): string {
  return names.map((n) => `{${n}}`).join(", ");
}

// What is wrong with a row right now. Command and folder problems stop the action from
// ever working; a context problem only says it cannot run where the user is at the moment,
// so it is shown as a note and does not block saving.
export function actionProblems(
  action: Action,
  context: { vars: Record<string, string>; shell: CommandShell } | null,
): ActionProblem[] {
  const out: ActionProblem[] = [];
  const shell = action.runInTerminal ? context?.shell ?? "posix" : undefined;
  const problem = action.command.trim() ? commandProblem(action.command, shell) : null;
  if (problem) out.push({ kind: "command", message: problem });
  if (action.runInTerminal && action.cwdMode === "fixed" && action.cwd) {
    const cwd = scriptCwdProblem(action.cwd);
    if (cwd) out.push({ kind: "cwd", message: cwd });
  }
  if (!problem && context && action.command.trim()) {
    const missing = missingVariables(action.command, context.vars);
    if (missing.length > 0) {
      out.push({ kind: "context", message: `${formatNames(missing)} has no value in the current tab` });
    } else if (action.runInTerminal) {
      const unsafe = unsafeVariables(action.command, context.vars, context.shell);
      if (unsafe.length > 0) {
        out.push({
          kind: "context",
          message: `${formatNames(unsafe)} holds a character a script cannot take safely`,
        });
      }
    }
  }
  return out;
}

// A row with no command is a form the user abandoned; it goes when the editor closes.
export function dropEmptyActions(list: readonly Action[]): string[] {
  return list.filter((a) => !a.command.trim()).map((a) => a.id);
}
