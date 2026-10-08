import { describe, expect, it } from "vitest";
import {
  positionAfterPreview,
  previewToSourceLine,
  sourceToPreviewLine,
  type ViewPosition,
} from "@/modules/markdown/lib/viewPosition";

describe("line mapping between source and Preview", () => {
  it("is the identity without frontmatter", () => {
    const raw = "# T\n\ntext\n";
    expect(sourceToPreviewLine(raw, 3)).toBe(3);
    expect(previewToSourceLine(raw, 3)).toBe(3);
  });

  it("is the identity when the frontmatter keeps its line count", () => {
    const raw = "---\ntitle: x\n---\n# T\ntext\n";
    expect(sourceToPreviewLine(raw, 5)).toBe(5);
    expect(previewToSourceLine(raw, 5)).toBe(5);
  });

  it("shifts the lines after an empty frontmatter, and maps them back", () => {
    const raw = "---\n---\n# T\ntext\n";
    expect(sourceToPreviewLine(raw, 4)).toBe(5);
    expect(previewToSourceLine(raw, 5)).toBe(4);
  });

  it("keeps a line inside the frontmatter inside it", () => {
    const raw = "---\ntitle: x\n---\n# T\n";
    expect(sourceToPreviewLine(raw, 2)).toBe(2);
    expect(previewToSourceLine(raw, 2)).toBe(2);
  });
});

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
