import { isMarkdownPath } from "@/lib/utils";
import type { MarkdownEngine } from "@/modules/markdown/lib/markdownEngine";
import type { Tab } from "@/modules/workspaces/lib/types";

// Every tab that can render markdown carries the engine it was opened with, so
// the workspace JSON is explicit and hand-editable, and so changing the default
// never reinterprets a tab that is already open.
export function sealMarkdownEngine<T extends Tab>(tab: T, engine: MarkdownEngine): T {
  if (tab.kind !== "markdown" && tab.kind !== "editor") return tab;
  if (tab.markdownEngine != null) return tab;
  if (tab.kind === "editor" && !isMarkdownPath(tab.path)) return tab;
  return { ...tab, markdownEngine: engine };
}
