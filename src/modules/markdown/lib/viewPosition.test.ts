import { describe, expect, it } from "vitest";
import { positionAfterPreview, type ViewPosition } from "@/modules/markdown/lib/viewPosition";

describe("positionAfterPreview", () => {
  const saved: ViewPosition = { cursorLine: 40, cursorCol: 7, topLine: 30 };

  it("restores the exact position when Preview was not scrolled", () => {
    expect(positionAfterPreview(saved, 30)).toBe(saved);
  });

  it("puts the cursor at the top of what was read after scrolling", () => {
    expect(positionAfterPreview(saved, 55)).toEqual({ cursorLine: 55, cursorCol: 0, topLine: 55 });
  });

  it("works with no saved position", () => {
    expect(positionAfterPreview(null, 12)).toEqual({ cursorLine: 12, cursorCol: 0, topLine: 12 });
  });
});
