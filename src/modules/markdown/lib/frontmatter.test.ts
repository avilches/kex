import { describe, expect, it } from "vitest";
import { joinFrontmatter, splitFrontmatter } from "@/modules/markdown/lib/frontmatter";

describe("splitFrontmatter", () => {
  it("splits a standard frontmatter block including delimiters", () => {
    const raw = "---\ntitle: Foo\ntags: [a, b]\n---\n\n# Hello\n";
    const { frontmatter, body } = splitFrontmatter(raw);
    expect(frontmatter).toBe("---\ntitle: Foo\ntags: [a, b]\n---\n");
    expect(body).toBe("\n# Hello\n");
  });

  it("returns empty frontmatter when the file does not start with ---", () => {
    const raw = "# Hello\n---\nnot frontmatter\n---\n";
    expect(splitFrontmatter(raw)).toEqual({ frontmatter: "", body: raw });
  });

  it("returns empty frontmatter when the block is unterminated", () => {
    const raw = "---\ntitle: Foo\nno closing";
    expect(splitFrontmatter(raw)).toEqual({ frontmatter: "", body: raw });
  });

  it("handles CRLF files without corrupting them", () => {
    const raw = "---\r\ntitle: Foo\r\n---\r\nbody\r\n";
    const { frontmatter, body } = splitFrontmatter(raw);
    expect(frontmatter + body).toBe(raw);
    expect(body).toBe("body\r\n");
  });

  it("round-trips byte-exact through joinFrontmatter", () => {
    for (const raw of ["---\na: 1\n---\nbody", "no fm at all", "", "---\n---\nx"]) {
      const { frontmatter, body } = splitFrontmatter(raw);
      expect(joinFrontmatter(frontmatter, body)).toBe(raw);
    }
  });
});
