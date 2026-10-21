import type { ViewSearchHandle } from "@/lib/cmSearch";
import type { SearchAddon } from "@xterm/addon-search";
import type { SearchTarget } from "../SearchInline";

export type SearchTargetInput = {
  tabKind: string | undefined;
  tabId: string | null;
  terminalAddon: SearchAddon | null;
  editorHandle: (ViewSearchHandle & { focus: () => unknown }) | null;
  markdownHandle: { search: ViewSearchHandle; focus: () => unknown } | null;
  gitHistoryHandle: {
    setQuery: (q: string) => void;
    clearQuery: () => void;
  } | null;
  focusTerminal: (tabId: string) => void;
};

export function buildSearchTarget(input: SearchTargetInput): SearchTarget {
  const { tabKind, tabId } = input;
  if (tabKind === "terminal" && tabId !== null && input.terminalAddon) {
    const addon = input.terminalAddon;
    return { kind: "terminal", addon, focus: () => input.focusTerminal(tabId) };
  }
  if (tabKind === "editor" && input.editorHandle) {
    const handle = input.editorHandle;
    return { kind: "editor", handle, focus: () => void handle.focus() };
  }
  if (tabKind === "markdown" && input.markdownHandle) {
    const md = input.markdownHandle;
    return { kind: "editor", handle: md.search, focus: () => void md.focus() };
  }
  if (tabKind === "git-history" && input.gitHistoryHandle)
    return {
      kind: "git-history",
      handle: input.gitHistoryHandle,
      focus: () => {},
    };
  return null;
}
