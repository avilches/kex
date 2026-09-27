import { describe, expect, it } from "vitest";
import { isExternalUrl } from "@/modules/markdown/codemirror/lib/externalUrl";

describe("isExternalUrl", () => {
  it("accepts http, https and mailto destinations", () => {
    expect(isExternalUrl("https://example.com")).toBe(true);
    expect(isExternalUrl("HTTP://example.com/a?b=c")).toBe(true);
    expect(isExternalUrl("mailto:me@example.com")).toBe(true);
  });

  it("rejects relative, anchor, file and script destinations", () => {
    for (const url of ["./notes.md", "#section", "notes.md", "file:///etc/passwd", "javascript:alert(1)", ""]) {
      expect(isExternalUrl(url)).toBe(false);
    }
  });
});
