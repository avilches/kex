import type { MarkdownEngine } from "@/modules/markdown/lib/markdownEngine";

export const RICH_DEBOUNCE_MS = 200;

export type MarkdownRenderer = "legacy" | "tiptap" | "milkdown";

// A rich engine that cannot start falls back to the cheap renderer, so a broken
// engine never blanks the preview of a file the user is editing.
export function pickRenderer(engine: MarkdownEngine, failed: boolean): MarkdownRenderer {
  if (failed || engine === "legacy") return "legacy";
  return engine;
}

// A rich engine reparses the whole document per update; the legacy renderer is
// cheap and keeps the live text it always had.
export function shouldDebounce(engine: MarkdownEngine): boolean {
  return engine !== "legacy";
}
