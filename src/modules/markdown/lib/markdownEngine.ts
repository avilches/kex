export type MarkdownEngine = "tiptap" | "milkdown" | "legacy";

export const MARKDOWN_ENGINES: readonly MarkdownEngine[] = [
  "tiptap",
  "milkdown",
  "legacy",
] as const;

export const DEFAULT_MARKDOWN_ENGINE: MarkdownEngine = "tiptap";

function isEngine(value: unknown): value is MarkdownEngine {
  return (
    value === "tiptap" || value === "milkdown" || value === "legacy"
  );
}

export function parseMarkdownEngine(value: unknown): MarkdownEngine {
  return isEngine(value) ? value : DEFAULT_MARKDOWN_ENGINE;
}

// A tab without an engine, or with a value no longer known, renders with the
// current default instead of failing to render at all.
export function resolveMarkdownEngine(
  tabEngine: MarkdownEngine | undefined,
  preference: MarkdownEngine,
): MarkdownEngine {
  return isEngine(tabEngine) ? tabEngine : parseMarkdownEngine(preference);
}
