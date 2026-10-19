import { EDITOR_CATALOG } from "@/modules/external-editors/catalog";
import type { DetectedEditor } from "@/modules/external-editors/types";

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
const VARIANTS = ["path", "workspace", "cwd"] as const;

/** One entry per enabled detected app and preset variable, followed by nothing else. */
export function suggestionsFromDetected(detected: readonly DetectedEditor[]): AppSuggestion[] {
  return detected.filter((e) => e.enabled !== false).flatMap((editor) => {
    const name = KNOWN.get(editor.id)?.name ?? editor.name;
    return VARIANTS.map((target) => ({
      key: `${editor.id}:${target}`,
      appId: editor.id,
      name: `${name} (${target})`,
      iconId: editor.id,
      defaultCommand: commandFor(editor, `{${target}}`),
    }));
  });
}
