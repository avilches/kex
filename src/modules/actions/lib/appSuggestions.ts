import { EDITOR_CATALOG, getEditorTargetType } from "@/modules/external-editors/catalog";
import type { DetectedEditor } from "@/modules/external-editors/types";

export type AppSuggestion = {
  /** Unique within a list: the app id, plus ":workspace" for the folder variant of a file editor. */
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

// File editors that also open a folder as a project.
const FOLDER_CAPABLE = new Set(["zed", "zed-preview", "sublime-text", "atom"]);

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

function primary(editor: DetectedEditor): AppSuggestion {
  const target = getEditorTargetType(editor.id) === "workspace" ? "{workspace}" : "{path}";
  return {
    key: editor.id,
    appId: editor.id,
    name: KNOWN.get(editor.id)?.name ?? editor.name,
    iconId: editor.id,
    defaultCommand: commandFor(editor, target),
  };
}

function workspaceVariant(editor: DetectedEditor): AppSuggestion {
  const base = primary(editor);
  return {
    ...base,
    key: `${editor.id}:workspace`,
    name: `${base.name} (workspace)`,
    defaultCommand: commandFor(editor, "{workspace}"),
  };
}

const isEnabled = (e: DetectedEditor) => e.enabled !== false;

/** One suggestion per enabled detected app, followed by the folder variant of the file editors that have one. */
export function suggestionsFromDetected(detected: readonly DetectedEditor[]): AppSuggestion[] {
  const enabled = detected.filter(isEnabled);
  const variants = enabled.filter((e) => FOLDER_CAPABLE.has(e.id)).map(workspaceVariant);
  return [...enabled.map(primary), ...variants];
}

/** The default suggestion of one detected app, or the custom app when it is not detected. */
export function suggestionFor(appId: string | undefined, detected: readonly DetectedEditor[]): AppSuggestion {
  const editor = appId ? detected.find((e) => e.id === appId) : undefined;
  return editor ? primary(editor) : CUSTOM_APP_SUGGESTION;
}
