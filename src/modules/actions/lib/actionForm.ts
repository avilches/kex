import { scriptCwdProblem } from "@/modules/workspaces/lib/scriptCwd";
import { commandProblem, missingVariables, unsafeVariables, type CommandShell, type CommandVariable } from "./commandTemplate";
import { agentCommandProblem } from "./actionsBar";
import { isAgent, isApp, isScript, usesTerminal, type Action, type ScriptRuns } from "./types";

export { COMMAND_VARIABLES } from "./commandTemplate";

export type CommandVariableDoc = {
  name: CommandVariable;
  description: string;
};

const TARGET_DOCS: Record<"app" | "folder" | "file", string> = {
  app: "What the app is opened on: the workspace root from the Header, the folder or the file from a menu",
  folder: "The folder the script was offered at: the workspace root from the Header, the folder of the menu otherwise",
  file: "Full path of the file the script was offered at",
};

/** The variables a form lists: {target} for an app and for a script that runs on any folder or any
 * file. A script that runs in the workspace root or one fixed folder, and an agent, have none. */
export function commandVariableDocs(action: Pick<Action, "kind" | "runs">): readonly CommandVariableDoc[] {
  if (isApp(action)) return [{ name: "target", description: TARGET_DOCS.app }];
  if (action.kind === "script" && action.runs === "folder") return [{ name: "target", description: TARGET_DOCS.folder }];
  if (action.kind === "script" && action.runs === "file") return [{ name: "target", description: TARGET_DOCS.file }];
  return [];
}

/** The four places a script can act, in the order the modal offers them. */
export const SCRIPT_RUNS_OPTIONS: readonly { value: ScriptRuns; label: string; hint: string }[] = [
  { value: "workspace", label: "Workspace root only", hint: "Always runs in the root of the workspace" },
  { value: "folder", label: "Any folder", hint: "Runs in the folder it is offered at; {target} is that folder" },
  { value: "file", label: "Any file", hint: "Runs in the folder of the file; {target} is the file" },
  { value: "fixed", label: "One fixed folder", hint: "Always runs in the folder you pick" },
];

export type ActionProblem = { kind: "command" | "cwd" | "context"; message: string };

function formatNames(names: readonly string[]): string {
  return names.map((n) => `{${n}}`).join(", ");
}

// What is wrong with a row right now. Command and folder problems stop the action from
// ever working; a context problem only says it cannot run where the user is at the moment,
// so it is shown as a note and does not block saving. An agent command is literal text, so
// only a control character and its folder can be wrong.
export function actionProblems(
  action: Action,
  context: { vars: Record<string, string>; shell: CommandShell } | null,
): ActionProblem[] {
  const out: ActionProblem[] = [];
  const shell = usesTerminal(action) ? context?.shell ?? "posix" : undefined;
  const agent = isAgent(action);
  const check = agent ? agentCommandProblem : (command: string) => commandProblem(command, shell, undefined, action.runs);
  const problem = action.command.trim() ? check(action.command) : null;
  if (problem) out.push({ kind: "command", message: problem });
  if (isScript(action) && action.runs === "fixed" && action.cwd) {
    const cwd = scriptCwdProblem(action.cwd);
    if (cwd) out.push({ kind: "cwd", message: cwd });
  }
  if (!agent && !problem && context && action.command.trim()) {
    const missing = missingVariables(action.command, context.vars);
    if (missing.length > 0) {
      out.push({ kind: "context", message: `${formatNames(missing)} has no value here` });
    } else if (usesTerminal(action)) {
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
