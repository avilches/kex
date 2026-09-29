import { describe, expect, it } from "vitest";
import { autolinkHref, isExternalUrl } from "@/modules/markdown/codemirror/lib/externalUrl";

describe("autolinkHref", () => {
  it("keeps an http(s) or mailto URL, adds https:// to www. and mailto: to an address", () => {
    expect(autolinkHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(autolinkHref("mailto:me@x.com")).toBe("mailto:me@x.com");
    expect(autolinkHref("www.example.com")).toBe("https://www.example.com");
    expect(autolinkHref("me@example.com")).toBe("mailto:me@example.com");
  });

  it("leaves anything else as it is, so isExternalUrl can reject it", () => {
    expect(autolinkHref("./notes.md")).toBe("./notes.md");
    expect(isExternalUrl(autolinkHref("javascript:alert(1)"))).toBe(false);
  });
});

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
