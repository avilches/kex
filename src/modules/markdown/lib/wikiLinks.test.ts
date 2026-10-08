import { describe, expect, it } from "vitest";
import { newWikiNotePath, resolveWikiTarget, wikiLinkAt } from "@/modules/markdown/lib/wikiLinks";

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

describe("newWikiNotePath", () => {
  const current = "/ws/notes/today.md";

  it("creates next to the current note and adds the extension once", () => {
    expect(newWikiNotePath("Idea", current, "/ws")).toBe("/ws/notes/Idea.md");
    expect(newWikiNotePath("Idea.md", current, "/ws")).toBe("/ws/notes/Idea.md");
    expect(newWikiNotePath(" proyectos/Idea ".trim(), current, "/ws")).toBe("/ws/notes/proyectos/Idea.md");
  });

  it("refuses names that escape or are not plain relative paths", () => {
    for (const bad of ["../x", "a/../x", "/etc/x", "a//b", "C:x", "a|b", "", "  "]) {
      expect(newWikiNotePath(bad, current, "/ws")).toBeNull();
    }
  });

  it("refuses when the current note is outside the workspace", () => {
    expect(newWikiNotePath("Idea", "/other/today.md", "/ws")).toBeNull();
  });
});
