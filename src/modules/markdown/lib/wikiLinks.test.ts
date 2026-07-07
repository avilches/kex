import { describe, expect, it } from "vitest";
import { resolveWikiRef, type WikiLinkContext } from "@/modules/markdown/lib/wikiLinks";

const ctx: WikiLinkContext = {
  root: "/ws",
  entries: [
    { title: "Roadmap", path: "/ws/Roadmap.md" },
    { title: "Notes", path: "/ws/team/Notes.md" },
    { title: "Notes", path: "/ws/team/deep/Notes.md" },
  ],
};

describe("resolveWikiRef", () => {
  it("resolves by exact title, case-insensitive", () => {
    expect(resolveWikiRef("roadmap", ctx)?.path).toBe("/ws/Roadmap.md");
  });
  it("strips #heading and ^block anchors before lookup", () => {
    expect(resolveWikiRef("Roadmap#Q3", ctx)?.path).toBe("/ws/Roadmap.md");
    expect(resolveWikiRef("Roadmap^abc", ctx)?.path).toBe("/ws/Roadmap.md");
  });
  it("prefers the shallowest path on ambiguous titles", () => {
    expect(resolveWikiRef("Notes", ctx)?.path).toBe("/ws/team/Notes.md");
  });
  it("resolves root-relative path refs (folder/note)", () => {
    expect(resolveWikiRef("team/deep/Notes", ctx)?.path).toBe("/ws/team/deep/Notes.md");
  });
  it("returns null for unknown refs", () => {
    expect(resolveWikiRef("Missing", ctx)).toBeNull();
  });
});
