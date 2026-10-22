import { scriptCwdProblem } from "@/modules/workspaces/lib/scriptCwd";
import type { ScriptCwdMode } from "@/modules/workspaces/lib/types";
import {
  commandProblem,
  missingVariables,
  unsafeVariables,
  type CommandShell,
  type CommandVariable,
} from "./commandTemplate";
import type { Action } from "./types";

export { COMMAND_VARIABLES } from "./commandTemplate";

export type CommandVariableDoc = {
  name: CommandVariable;
  description: string;
};

// The docs for the picker live here: the title templates have a different vocabulary
// (their {file} and {path} keep their own meaning), so Actions do not reuse those names.
const VARIABLE_DOCS: readonly CommandVariableDoc[] = [
  { name: "cwd", description: "Full path of the folder the tab is in (for a file, the folder that holds it)" },
  { name: "dir", description: "Only the name of that folder" },
  { name: "branch", description: "Git branch of that folder, empty outside a repository" },
  { name: "repo", description: "Name of the git repository" },
  { name: "workspace", description: "Full path of the workspace root, empty when the workspace has none" },
  { name: "filename", description: "Name of the file the tab works on" },
  { name: "filepath", description: "Full path of that file" },
  { name: "host", description: "Name of this computer" },
];

export function commandVariableDocs(): readonly CommandVariableDoc[] {
  return VARIABLE_DOCS;
}

// A script row is a terminal command pointed at a folder; an app row is a background
// program. The kind is chosen on creation by the add buttons and never switched later.
export const CWD_MODE_LABELS: Record<ScriptCwdMode, string> = {
  home: "Home",
  workspace: "Workspace root",
  context: "Current tab folder (from terminal or editor)",
  fixed: "Absolute path",
};

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

// The command box keeps what is being typed apart from what is saved. While it has focus the
// draft is shown as typed; an empty one is flagged and never saved, so the stored action
// keeps its last valid command. Once focus leaves, the box shows the stored command again:
// that also picks up a change made from outside (a suggestion, another window).
export function commandDraft(input: { draft: string; stored: string; focused: boolean; saved?: boolean }): {
  shown: string;
  required: boolean;
} {
  const { draft, stored, focused, saved = true } = input;
  const empty = !draft.trim();
  // A row the store has not accepted yet has no earlier value to go back to.
  if (focused || !saved) return { shown: draft, required: empty };
  if (empty && stored.trim()) return { shown: stored, required: false };
  return { shown: stored || draft, required: !(stored || draft).trim() };
}

// What leaving the command box saves: the trimmed command when it is new and not empty.
export function commitCommand(stored: string, draft: string): { save: string | null } {
  const next = draft.trim();
  return { save: next && next !== stored ? next : null };
}
