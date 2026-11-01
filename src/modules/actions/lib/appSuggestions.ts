import { newActionId } from "@/lib/ids";
import { DEFAULT_ACCEPTS, EDITOR_CATALOG, getEditorAccepts, type AppAccepts } from "@/modules/external-editors/catalog";
import type { DetectedEditor } from "@/modules/external-editors/types";
import { splitActionName } from "./actionName";
import { yoloCommand } from "./agentYolo";
import type { Action, ActionKind } from "./types";

type SuggestionBase = {
  /** Unique within a list: the app id, or the agent id, plus its kind. */
  key: string;
  /** Detected app it comes from, absent for the custom app. */
  appId?: string;
  name: string;
  /** Icon to draw, null for the generic one. */
  iconId: string | null;
  /** Editable template that goes through the argv expander. */
  defaultCommand: string;
};

// An agent has no folder of its own, so a preset is its kind, its command and nothing else. An
// app also says what its {target} may be.
export type AppSuggestion = SuggestionBase & { kind: "app" | "agent"; accepts?: AppAccepts };

export const CUSTOM_APP_SUGGESTION: AppSuggestion = {
  key: "custom",
  name: "Custom",
  iconId: null,
  defaultCommand: "",
  kind: "app",
};

const KNOWN = new Map(EDITOR_CATALOG.map((e) => [e.id, e]));

const sameCommand = (a: string, b: string): boolean => a.trim() === b.trim();

type Identity = { kind: ActionKind; command: string };

/** An app or an agent is defined by its kind and its command alone: the name, the icon and the
 * appId do not matter, and neither does a folder, because an agent has none of its own. */
export function sameIdentity(a: Identity, b: Identity): boolean {
  return a.kind === b.kind && sameCommand(a.command, b.command);
}

export function hasCommandOf(actions: readonly Action[], command: string, kind: ActionKind = "app"): boolean {
  return !!command.trim() && actions.some((a) => sameIdentity(a, { kind, command }));
}

/** The presets still to install: a preset whose identity some Action already has is installed,
 * and installed presets stay out of the combo, because the good next step is Edit on that
 * Action, not a second copy. */
export function uninstalledSuggestions(
  suggestions: readonly AppSuggestion[],
  actions: readonly Action[],
): AppSuggestion[] {
  return suggestions.filter((s) => !(s.appId && hasCommandOf(actions, s.defaultCommand, s.kind)));
}

/** The detected preset an Action is, by its identity, or undefined when it is the user's own. */
export function presetOf(
  action: Pick<Action, "kind" | "command">,
  suggestions: readonly AppSuggestion[],
): AppSuggestion | undefined {
  if (action.kind === "script") return undefined;
  return suggestions.find(
    (s) => s.appId && sameIdentity({ kind: s.kind, command: s.defaultCommand }, { kind: action.kind, command: action.command }),
  );
}

// Text goes through the template parser, where a brace is a variable; doubling keeps it literal.
function literal(text: string): string {
  return text.replace(/[{}]/g, (c) => c + c);
}

function quoteArg(arg: string): string {
  const text = literal(arg);
  if (arg !== "" && !/[\s"'\\]/.test(arg)) return text;
  return arg.includes("'") ? `"${text}"` : `'${text}'`;
}

function commandFor(editor: DetectedEditor, target: string): string {
  return [editor.binary, ...editor.argsBeforePath].map(quoteArg).concat(target).join(" ");
}


// An app is offered once. Its command ends in {target}, which stands for the place it is opened
// at (the workspace root in the Header, the folder of a folder menu, the file of a file menu),
// and the catalog says what it accepts.
export const APP_TARGET = "{target}";

// Alphabetical by name, the way the combo reads.
export function compareByName(a: AppSuggestion, b: AppSuggestion): number {
  const main = (s: AppSuggestion) => splitActionName(s.name).main;
  return main(a).localeCompare(main(b));
}

/** One preset per enabled detected app. */
export function suggestionsFromDetected(detected: readonly DetectedEditor[]): AppSuggestion[] {
  return detected
    .filter((e) => e.enabled !== false)
    .map((editor) => ({
      key: `${editor.id}:app`,
      appId: editor.id,
      name: KNOWN.get(editor.id)?.name ?? editor.name,
      iconId: editor.id,
      defaultCommand: commandFor(editor, APP_TARGET),
      kind: "app" as const,
      accepts: getEditorAccepts(editor.id),
    }))
    .sort(compareByName);
}

/** One preset per enabled agent. It has no folder of its own: the Header starts it in the
 * workspace root, and a folder menu or a New terminal row starts it in that folder. The command
 * is the bare binary name the scan looked up plus its bypass-permissions switch, so the Action
 * stays portable across machines and never carries a resolved path or a Windows `.exe`. */
export function agentSuggestionsFromDetected(agents: readonly DetectedEditor[]): AppSuggestion[] {
  return agents
    .filter((a) => a.enabled !== false)
    .map((agent) => ({
      key: `${agent.id}:agent`,
      appId: agent.id,
      name: agent.name,
      iconId: agent.id,
      defaultCommand: yoloCommand(agent.id),
      kind: "agent" as const,
    }))
    .sort(compareByName);
}

export function actionFromSuggestion(s: AppSuggestion, ownButton = false): Action {
  return {
    id: newActionId(),
    name: s.name,
    kind: s.kind,
    command: s.defaultCommand,
    ...(s.appId ? { icon: `${s.kind}:${s.appId}` } : {}),
    ...(s.kind === "app" ? { accepts: s.accepts ?? DEFAULT_ACCEPTS } : {}),
    ownButton,
  };
}
