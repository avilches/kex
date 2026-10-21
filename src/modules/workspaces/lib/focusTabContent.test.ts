import { describe, expect, it, vi } from "vitest";
import { focusTabContent } from "./focusTabContent";

function deps() {
  return {
    focusEditor: vi.fn(),
    focusMarkdown: vi.fn(),
    focusBrowser: vi.fn(),
    focusLeaf: vi.fn(),
  };
}

describe("focusTabContent", () => {
  it.each([
    ["editor", "focusEditor"],
    ["markdown", "focusMarkdown"],
    ["browser", "focusBrowser"],
    ["terminal", "focusLeaf"],
    [undefined, "focusLeaf"],
  ] as const)("%s routes to %s only", (kind, expected) => {
    const d = deps();
    focusTabContent(kind, "tab-1", d);
    for (const [name, fn] of Object.entries(d)) {
      if (name === expected) expect(fn).toHaveBeenCalledWith("tab-1");
      else expect(fn).not.toHaveBeenCalled();
    }
  });
});
