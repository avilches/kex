import { describe, expect, it } from "vitest";
import { headingsFromMarkdown } from "@/modules/markdown/milkdown/outline";

describe("headingsFromMarkdown", () => {
  it("extracts levels and slugs", () => {
    expect(headingsFromMarkdown("# One\n\n## Two words\n")).toEqual([
      { text: "One", level: 1, id: "one" },
      { text: "Two words", level: 2, id: "two-words" },
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
});
