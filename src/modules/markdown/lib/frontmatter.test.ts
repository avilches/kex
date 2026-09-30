import { describe, expect, it } from "vitest";
import { frontmatterAsCodeBlock, splitFrontmatter } from "@/modules/markdown/lib/frontmatter";

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
});

describe("frontmatterAsCodeBlock", () => {
  it("wraps the frontmatter in a yaml fence and keeps the body", () => {
    expect(frontmatterAsCodeBlock("---\ntitle: Foo\n---\n\n# Hello\n")).toBe(
      "```yaml\ntitle: Foo\n```\n\n# Hello\n",
    );
  });

  it("handles a closing delimiter without a trailing newline and an empty block", () => {
    expect(frontmatterAsCodeBlock("---\na: 1\n---")).toBe("```yaml\na: 1\n```\n");
    expect(frontmatterAsCodeBlock("---\n---\nx")).toBe("```yaml\n\n```\nx");
  });

  it("leaves a file without frontmatter alone and avoids clashing with backticks inside", () => {
    expect(frontmatterAsCodeBlock("# Hi\n")).toBe("# Hi\n");
    expect(frontmatterAsCodeBlock("---\nk: ```\n---\nx")).toBe("~~~~yaml\nk: ```\n~~~~\nx");
  });
});
