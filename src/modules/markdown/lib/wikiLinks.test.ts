import { describe, expect, it } from "vitest";
import { newWikiNotePath, resolveWikiTarget, wikiBoundary, wikiLinkAt } from "@/modules/markdown/lib/wikiLinks";

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
  const make = (name: string, root = "/ws") => newWikiNotePath(name, current, root);

  it("creates next to the current note and adds the extension once", () => {
    expect(make("Idea")).toEqual({ path: "/ws/notes/Idea.md" });
    expect(make("Idea.md")).toEqual({ path: "/ws/notes/Idea.md" });
    expect(make("proyectos/Idea")).toEqual({ path: "/ws/notes/proyectos/Idea.md" });
  });

  it("collapses . and .. so pepe/../file is just file", () => {
    expect(make("pepe/../file")).toEqual({ path: "/ws/notes/file.md" });
    expect(make("./a//b")).toEqual({ path: "/ws/notes/a/b.md" });
  });

  it("lets .. climb up to the root and no further", () => {
    expect(make("../Top")).toEqual({ path: "/ws/Top.md" });
    expect(make("../../Top")).toEqual({ error: "outside" });
    expect(make("../x", "/ws/notes")).toEqual({ error: "outside" });
    expect(make("a/../../../x")).toEqual({ error: "outside" });
  });

  it("stays inside the note's own folder when that is the root", () => {
    expect(make("sub/x", "/ws/notes")).toEqual({ path: "/ws/notes/sub/x.md" });
    expect(make("sub/../x", "/ws/notes")).toEqual({ path: "/ws/notes/x.md" });
  });

  it("rejects names that are not a plain relative file name", () => {
    for (const bad of ["/etc/x", "C:x", "a|b", "", "  ", "a/..", "a/", ".", "a /b"]) {
      expect(make(bad)).toEqual({ error: "invalid" });
    }
  });

  it("refuses when the current note is outside the root", () => {
    expect(newWikiNotePath("Idea", "/other/today.md", "/ws")).toEqual({ error: "outside" });
  });
});

describe("wikiBoundary", () => {
  it("uses the root when the note is under it", () => {
    expect(wikiBoundary("/ws", "/ws/a/n.md")).toBe("/ws");
    expect(wikiBoundary("/ws", "/ws/n.md")).toBe("/ws");
  });

  it("falls back to the note's folder without a root or outside it", () => {
    expect(wikiBoundary(null, "/x/y/n.md")).toBe("/x/y");
    expect(wikiBoundary("/ws", "/other/n.md")).toBe("/other");
    expect(wikiBoundary("/ws", "/ws2/n.md")).toBe("/ws2");
  });
});
