import { describe, expect, it } from "vitest";
import { cellSegments } from "@/modules/markdown/codemirror/lib/tableCellInline";

describe("cellSegments", () => {
  it("returns plain text as one segment and nothing for an empty cell", () => {
    expect(cellSegments("just text")).toEqual([{ type: "text", value: "just text" }]);
    expect(cellSegments("")).toEqual([]);
  });

  it("splits text around a link", () => {
    expect(cellSegments("see [the docs](https://example.com) now")).toEqual([
      { type: "text", value: "see " },
      { type: "link", text: "the docs", url: "https://example.com" },
      { type: "text", value: " now" },
    ]);
  });

  it("handles several links and a link filling the whole cell", () => {
    expect(cellSegments("[a](https://a.com) and [b](https://b.com)")).toEqual([
      { type: "link", text: "a", url: "https://a.com" },
      { type: "text", value: " and " },
      { type: "link", text: "b", url: "https://b.com" },
    ]);
  });

  it("strips a link title and angle brackets from the destination", () => {
    expect(cellSegments('[a](https://a.com "Title")')).toEqual([{ type: "link", text: "a", url: "https://a.com" }]);
    expect(cellSegments("[a](<https://a.com/x y>)")).toEqual([
      { type: "link", text: "a", url: "https://a.com/x y" },
    ]);
  });

  it("leaves bracketed text without a destination as plain text", () => {
    expect(cellSegments("[TODO] item")).toEqual([{ type: "text", value: "[TODO] item" }]);
  });
});
