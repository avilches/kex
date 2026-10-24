import { EDITOR_CATALOG } from "@/modules/external-editors/catalog";
import type { DetectedEditor } from "@/modules/external-editors/types";
import { splitActionName } from "./actionName";
import { isApp, type Action } from "./types";

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
};

export const CUSTOM_APP_SUGGESTION: AppSuggestion = {
  key: "custom",
  name: "Custom app",
  iconId: null,
  defaultCommand: "",
};

const KNOWN = new Map(EDITOR_CATALOG.map((e) => [e.id, e]));

const sameCommand = (a: string, b: string): boolean => a.trim() === b.trim();

/** An app is defined by its command alone: the name, the icon and the appId do not matter. */
export function hasCommandOf(actions: readonly Action[], command: string): boolean {
  return !!command.trim() && actions.some((a) => isApp(a) && sameCommand(a.command, command));
}

/** The presets still to install, one per app and starting point: a preset whose command some
 * app already has is installed, and installed presets stay out of the combo, because the good
 * next step is Edit on that app, not a second copy. */
export function uninstalledSuggestions(
  suggestions: readonly AppSuggestion[],
  actions: readonly Action[],
): AppSuggestion[] {
  return suggestions.filter((s) => !(s.appId && hasCommandOf(actions, s.defaultCommand)));
}

/** The detected preset an app is, by its command, or undefined when it is the user's own. */
export function presetOf(action: Pick<Action, "kind" | "command">, suggestions: readonly AppSuggestion[]): AppSuggestion | undefined {
  if (!isApp(action)) return undefined;
  return suggestions.find((s) => s.appId && sameCommand(s.defaultCommand, action.command));
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
export function compareByName(a: AppSuggestion, b: AppSuggestion): number {
  const rank = (s: AppSuggestion) => VARIANTS.indexOf(s.key.slice(s.key.lastIndexOf(":") + 1) as (typeof VARIANTS)[number]);
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
      }));
    })
    .sort(compareByName);
}
