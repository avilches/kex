import { newActionId } from "@/lib/ids";
import { EDITOR_CATALOG } from "@/modules/external-editors/catalog";
import type { DetectedEditor } from "@/modules/external-editors/types";
import { splitActionName } from "./actionName";
import { yoloCommand } from "./agentYolo";
import type { Action, ActionKind } from "./types";

type SuggestionBase = {
  /** Unique within a list: the app id, plus the variable the preset points at. */
  key: string;
  /** Detected app it comes from, absent for the custom app. */
  appId?: string;
  name: string;
  /** Icon to draw, null for the generic one. */
  iconId: string | null;
  /** Editable template that goes through the argv expander. */
  defaultCommand: string;
};

// An agent has no folder of its own, so a preset is its kind, its command and nothing else.
export type AppSuggestion = SuggestionBase & { kind: "app" | "agent" };

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

// Every app gets the same three starting points, so one app can back several Actions
// with different templates instead of the editor guessing which target fits.
const VARIANTS = ["filepath", "workspace", "cwd"] as const;

// Alphabetical by app, and within one app the three presets in their variant order, so
// the combo reads like a list of names and the variants of one app stay together.
const RANKS: readonly string[] = [...VARIANTS, "context"];

export function compareByName(a: AppSuggestion, b: AppSuggestion): number {
  const rank = (s: AppSuggestion) => RANKS.indexOf(s.key.slice(s.key.lastIndexOf(":") + 1));
  const main = (s: AppSuggestion) => splitActionName(s.name).main;
  return main(a).localeCompare(main(b)) || rank(a) - rank(b);
}

/** One entry per enabled detected app and preset variable, followed by nothing else. */
// The three starting points, so one app can back several Actions with different templates.
// Project-based IDEs (JetBrains) open workspace folders or the tab's folder, never a file.
function variantsFor(editorId: string): readonly (typeof VARIANTS)[number][] {
  return EDITOR_CATALOG.find((e) => e.id === editorId)?.group === "JetBrains"
    ? VARIANTS.filter((v) => v !== "filepath")
    : VARIANTS;
}

export function suggestionsFromDetected(detected: readonly DetectedEditor[]): AppSuggestion[] {
  return detected
    .filter((e) => e.enabled !== false)
    .flatMap((editor) => {
      const name = KNOWN.get(editor.id)?.name ?? editor.name;
      return variantsFor(editor.id).map((target) => ({
        key: `${editor.id}:${target}`,
        appId: editor.id,
        name: `${name} {${target}}`,
        iconId: editor.id,
        defaultCommand: commandFor(editor, `{${target}}`),
        kind: "app" as const,
      }));
    })
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
    ...(s.appId ? { appId: s.appId } : {}),
    ownButton,
  };
}
