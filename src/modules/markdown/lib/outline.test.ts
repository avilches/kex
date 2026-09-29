import { describe, expect, it } from "vitest";
import { headingsFromMarkdown } from "@/modules/markdown/lib/outline";

describe("headingsFromMarkdown", () => {
  it("extracts levels and slugs", () => {
    expect(headingsFromMarkdown("# One\n\n## Two words\n")).toEqual([
      { text: "One", level: 1, id: "one", line: 0 },
      { text: "Two words", level: 2, id: "two-words", line: 2 },
    ]);
  });

  it("dedupes repeated slugs", () => {
    expect(headingsFromMarkdown("# A\n# A\n").map((h) => h.id)).toEqual(["a", "a-1"]);
  });

  it("ignores headings inside fences", () => {
    expect(headingsFromMarkdown("```\n# not a heading\n```\n")).toEqual([]);
  });

  it("strips trailing closing hashes", () => {
    expect(headingsFromMarkdown("## Title ##\n")[0].text).toBe("Title");
  });

  it("reports the 0-based line of each heading, skipping fenced ones", () => {
    const md = "# A\n\n```\n# no\n```\n\n## B\n";
    expect(headingsFromMarkdown(md).map((h) => h.line)).toEqual([0, 6]);
  });
});
