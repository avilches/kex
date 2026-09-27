import { describe, expect, it } from "vitest";
import { frontmatterEnd } from "@/modules/markdown/codemirror/lib/frontmatterEnd";

describe("frontmatterEnd", () => {
  it("returns 0 when the document has no frontmatter", () => {
    expect(frontmatterEnd("# Title\n\nBody text.\n")).toBe(0);
  });

  it("returns the offset right after the closing --- line", () => {
    const text = "---\ntitle: Note\ntags: [a, b]\n---\n# Title\n";
    const fm = "---\ntitle: Note\ntags: [a, b]\n---\n";
    expect(frontmatterEnd(text)).toBe(fm.length);
  });

  it("returns 0 for an unterminated frontmatter block", () => {
    expect(frontmatterEnd("---\ntitle: Note\n# not a real close\n")).toBe(0);
  });

  it("only scans a bounded prefix, never the whole document", () => {
    const hugeBody = "x".repeat(1_000_000);
    expect(frontmatterEnd(`# Title\n\n${hugeBody}`)).toBe(0);
  });
});
