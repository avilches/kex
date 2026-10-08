import { describe, expect, it } from "vitest";
import { resolveWikiTarget, wikiLinkAt } from "@/modules/markdown/lib/wikiLinks";

describe("wikiLinkAt", () => {
  it("parses a plain link", () => {
    expect(wikiLinkAt("a [[My Note]] b", 2)).toEqual({ from: 2, to: 13, target: "My Note", labelFrom: 4 });
  });

  it("drops the anchor from the target and shows the alias", () => {
    const l = wikiLinkAt("[[Note#Head|see this]]", 0);
    expect(l?.target).toBe("Note");
    expect(l?.labelFrom).toBe(12);
  });

  it("rejects single brackets, empty targets and nested brackets", () => {
    expect(wikiLinkAt("[TODO]", 0)).toBeNull();
    expect(wikiLinkAt("[[]]", 0)).toBeNull();
    expect(wikiLinkAt("[[#only anchor]]", 0)).toBeNull();
    expect(wikiLinkAt("[[a [b] c]]", 0)).toBeNull();
  });
});

describe("resolveWikiTarget", () => {
  const root = "/ws";
  const files = ["/ws/deep/er/Note.md", "/ws/Note.md", "/ws/sub/Other.md"];

  it("matches by name ignoring case and extension, shallowest first", () => {
    expect(resolveWikiTarget("note", root, files)).toBe("/ws/Note.md");
    expect(resolveWikiTarget("Note.md", root, files)).toBe("/ws/Note.md");
  });

  it("matches a trailing path", () => {
    expect(resolveWikiTarget("sub/other", root, files)).toBe("/ws/sub/Other.md");
  });

  it("returns null when nothing matches", () => {
    expect(resolveWikiTarget("Missing", root, files)).toBeNull();
    expect(resolveWikiTarget("  ", root, files)).toBeNull();
  });
});
