import type { Tab } from "./types";

// Locking a tab that can be a preview makes it permanent, so it is not replaced by the next one.
export function toggleTabLock(tab: Tab): Tab {
  const locked = !tab.locked;
  const pinsPreview =
    locked &&
    (tab.kind === "editor" ||
      tab.kind === "markdown" ||
      tab.kind === "git-diff" ||
      tab.kind === "git-commit-file");
  return { ...tab, locked, ...(pinsPreview ? { preview: false } : {}) } as Tab;
}
