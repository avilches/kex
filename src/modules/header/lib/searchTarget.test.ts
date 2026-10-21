import { describe, expect, it, vi } from "vitest";
import { CM_DIFF_SETUP, CM_EDITOR_SETUP, CM_MARKDOWN_PREVIEW_SETUP, CM_MARKDOWN_SETUP, CM_THEME_PREVIEW_SETUP } from "@/lib/codemirrorSetup";
import { buildSearchTarget, type SearchTargetInput } from "./searchTarget";

const search = {
  setQuery: vi.fn(),
  findNext: vi.fn(),
  findPrevious: vi.fn(),
  clearQuery: vi.fn(),
};

const base: SearchTargetInput = {
  tabKind: undefined,
  tabId: "tab-1",
  terminalAddon: null,
  editorHandle: null,
  markdownHandle: null,
  gitHistoryHandle: null,
  focusTerminal: vi.fn(),
};

describe("buildSearchTarget", () => {
  it("produces an editor target for a markdown tab and delegates to its search handle", () => {
    const focus = vi.fn();
    const target = buildSearchTarget({
      ...base,
      tabKind: "markdown",
      markdownHandle: { search, focus },
    });
    expect(target?.kind).toBe("editor");
    if (target?.kind !== "editor") return;
    expect(target.handle).toBe(search);
    target.focus();
    expect(focus).toHaveBeenCalledOnce();
  });

  it("returns null for a markdown tab with no registered handle", () => {
    expect(buildSearchTarget({ ...base, tabKind: "markdown" })).toBeNull();
  });

  it("returns null for tab kinds that are not searchable", () => {
    expect(buildSearchTarget({ ...base, tabKind: "browser" })).toBeNull();
  });
});

describe("CodeMirror setups", () => {
  it("never enable the native search panel keymap", () => {
    for (const setup of [
      CM_EDITOR_SETUP,
      CM_DIFF_SETUP,
      CM_MARKDOWN_SETUP,
      CM_MARKDOWN_PREVIEW_SETUP,
      CM_THEME_PREVIEW_SETUP,
    ]) {
      expect(setup.searchKeymap).toBe(false);
    }
  });
});
