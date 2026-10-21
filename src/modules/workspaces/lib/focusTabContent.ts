export type FocusTabDeps = {
  focusEditor: (tabId: string) => void;
  focusMarkdown: (tabId: string) => void;
  focusBrowser: (tabId: string) => void;
  focusLeaf: (tabId: string) => void;
};

// Hidden tabs stay mounted, so the DOM focus of the tab being left can linger
// and swallow keystrokes. Every activation that moves no focus by itself must
// hand it to the content of the tab that becomes active, whatever its kind.
export function focusTabContent(
  kind: string | undefined,
  tabId: string,
  deps: FocusTabDeps,
): void {
  if (kind === "editor") deps.focusEditor(tabId);
  else if (kind === "markdown") deps.focusMarkdown(tabId);
  else if (kind === "browser") deps.focusBrowser(tabId);
  else deps.focusLeaf(tabId);
}
