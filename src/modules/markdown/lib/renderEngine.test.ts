import { describe, expect, it } from "vitest";
import {
  pickRenderer,
  RICH_DEBOUNCE_MS,
  shouldDebounce,
} from "@/modules/markdown/lib/renderEngine";

describe("pickRenderer", () => {
  it("maps each engine to its renderer", () => {
    expect(pickRenderer("legacy", false)).toBe("legacy");
    expect(pickRenderer("tiptap", false)).toBe("tiptap");
    expect(pickRenderer("milkdown", false)).toBe("milkdown");
  });

  it("falls back to the legacy renderer when a rich engine failed to start", () => {
    expect(pickRenderer("tiptap", true)).toBe("legacy");
    expect(pickRenderer("milkdown", true)).toBe("legacy");
  });
});

describe("shouldDebounce", () => {
  it("debounces only the rich engines, which reparse a whole document", () => {
    expect(shouldDebounce("legacy")).toBe(false);
    expect(shouldDebounce("tiptap")).toBe(true);
    expect(shouldDebounce("milkdown")).toBe(true);
  });

  it("uses a delay short enough to feel live", () => {
    expect(RICH_DEBOUNCE_MS).toBeLessThanOrEqual(300);
  });
});
