import { Language, LanguageDescription, LanguageSupport } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { LANGUAGES } from "@/modules/editor/lib/languageDefinitions";

function toSupport(ext: Extension): LanguageSupport {
  if (ext instanceof LanguageSupport) return ext;
  if (ext instanceof Language) return new LanguageSupport(ext);
  throw new Error("language loader returned neither a LanguageSupport nor a Language");
}

// Built from the editor's own registry, so a fence tag highlights with exactly
// the languages a file of that extension does, each one lazily loaded.
const descriptions = LANGUAGES.map((def) =>
  LanguageDescription.of({
    name: def.name,
    alias: def.extensions,
    load: async () => toSupport(await def.loader()),
  }),
);

// Exact match on name or extension only: fuzzy matching would send "csharp" to C.
export function codeLanguages(info: string): LanguageDescription | null {
  return LanguageDescription.matchLanguageName(descriptions, info, false);
}
