import { isHtmlPath, isMarkdownPath } from "@/lib/utils";
import type { Tab } from "@/modules/workspaces/lib/types";

// An `editor` tab over a file that has a rendered view: the only kind whose
// raw/overlay/split preview can be toggled from the keyboard.
export function isPreviewableEditorTab(tab: Tab | null | undefined): boolean {
  return tab?.kind === "editor" && (isMarkdownPath(tab.path) || isHtmlPath(tab.path));
}
