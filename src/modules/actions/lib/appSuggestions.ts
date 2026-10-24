import { EDITOR_CATALOG } from "@/modules/external-editors/catalog";
import type { DetectedEditor } from "@/modules/external-editors/types";
import { splitActionName } from "./actionName";
import type { ScriptCwdMode } from "@/modules/workspaces/lib/types";
import type { Action, ActionKind } from "./types";

export type AppSuggestion = {
  /** Unique within a list: the app id, plus the variable the preset points at. */
  key: string;
  /** Detected app it comes from, absent for the custom app. */
  appId?: string;
  name: string;
  /** Icon to draw, null for the generic one. */
  iconId: string | null;
  /** Editable template that goes through the argv expander. */
  defaultCommand: string;
  kind: ActionKind;
  /** Agents only: where the preset starts the agent. */
  cwdMode?: ScriptCwdMode;
};

export const CUSTOM_APP_SUGGESTION: AppSuggestion = {
  key: "custom",
  name: "Custom app",
  iconId: null,
  defaultCommand: "",
  kind: "app",
};

const KNOWN = new Map(EDITOR_CATALOG.map((e) => [e.id, e]));

const sameCommand = (a: string, b: string): boolean => a.trim() === b.trim();

type Identity = { kind: ActionKind; command: string; cwdMode?: ScriptCwdMode };

/** An app is defined by its command alone: the name, the icon and the appId do not matter. An
 * agent is defined by its command and where it starts, so one binary backs two presets. */
export function sameIdentity(a: Identity, b: Identity): boolean {
  if (a.kind !== b.kind || !sameCommand(a.command, b.command)) return false;
  return a.kind !== "agent" || a.cwdMode === b.cwdMode;
}

export function hasCommandOf(
  actions: readonly Action[],
  command: string,
  kind: ActionKind = "app",
  cwdMode?: ScriptCwdMode,
): boolean {
  return !!command.trim() && actions.some((a) => sameIdentity(a, { kind, command, cwdMode }));
}

/** The presets still to install: a preset whose identity some Action already has is installed,
 * and installed presets stay out of the combo, because the good next step is Edit on that
 * Action, not a second copy. */
export function uninstalledSuggestions(
  suggestions: readonly AppSuggestion[],
  actions: readonly Action[],
): AppSuggestion[] {
  return suggestions.filter((s) => !(s.appId && hasCommandOf(actions, s.defaultCommand, s.kind, s.cwdMode)));
}

/** The detected preset an Action is, by its identity, or undefined when it is the user's own. */
export function presetOf(
  action: Pick<Action, "kind" | "command" | "cwdMode">,
  suggestions: readonly AppSuggestion[],
): AppSuggestion | undefined {
  if (action.kind === "script") return undefined;
  return suggestions.find(
    (s) =>
      s.appId &&
      sameIdentity(
        { kind: s.kind, command: s.defaultCommand, cwdMode: s.cwdMode },
        { kind: action.kind, command: action.command, cwdMode: action.cwdMode },
      ),
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

const AGENT_VARIANTS = ["workspace", "context"] as const satisfies readonly ScriptCwdMode[];

/** Two presets per enabled agent, starting in the workspace root or in the current directory.
 * The command is the agent id, which is the bare binary name the scan looked up, so the Action
 * stays portable across machines and never carries a resolved path or a Windows `.exe`. */
export function agentSuggestionsFromDetected(agents: readonly DetectedEditor[]): AppSuggestion[] {
  return agents
    .filter((a) => a.enabled !== false)
    .flatMap((agent) =>
      AGENT_VARIANTS.map((cwdMode) => ({
        key: `${agent.id}:${cwdMode}`,
        appId: agent.id,
        name: agent.name,
        iconId: agent.id,
        defaultCommand: agent.id,
        kind: "agent" as const,
        cwdMode,
      })),
    )
    .sort(compareByName);
}
