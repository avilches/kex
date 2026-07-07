import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTES_CONFIG,
  deletePathInConfig,
  parseNotesConfig,
  renamePathInConfig,
  serializeNotesConfig,
} from "./notesConfig";

describe("parseNotesConfig", () => {
  it("returns defaults for null, invalid JSON, non-object, and missing namespace", () => {
    expect(parseNotesConfig(null)).toEqual(DEFAULT_NOTES_CONFIG);
    expect(parseNotesConfig("{not json")).toEqual(DEFAULT_NOTES_CONFIG);
    expect(parseNotesConfig("[1,2]")).toEqual(DEFAULT_NOTES_CONFIG);
    expect(parseNotesConfig('{"other":{}}')).toEqual(DEFAULT_NOTES_CONFIG);
  });

  it("reads a full namespace", () => {
    const raw = JSON.stringify({
      notes: {
        quickAccess: ["docs/TODO.md"],
        sortMode: "title",
        noteOrder: { "docs/TODO.md": 0, "README.md": 1 },
        collapsedFolders: ["docs/pending"],
        groupByDate: false,
        selectedFolder: "docs",
      },
    });
    expect(parseNotesConfig(raw)).toEqual({
      quickAccess: ["docs/TODO.md"],
      sortMode: "title",
      noteOrder: { "docs/TODO.md": 0, "README.md": 1 },
      collapsedFolders: ["docs/pending"],
      groupByDate: false,
      selectedFolder: "docs",
    });
  });

  it("falls back per field on wrong types", () => {
    const raw = JSON.stringify({
      notes: {
        quickAccess: "nope",
        sortMode: "bogus",
        noteOrder: { a: "NaN", b: 2 },
        collapsedFolders: [1, 2],
        groupByDate: "yes",
        selectedFolder: 7,
      },
    });
    expect(parseNotesConfig(raw)).toEqual({
      ...DEFAULT_NOTES_CONFIG,
      noteOrder: { b: 2 },
    });
  });
});

describe("serializeNotesConfig", () => {
  it("preserves foreign top-level keys", () => {
    const raw = JSON.stringify({ future: { x: 1 }, notes: { sortMode: "title" } });
    const out = serializeNotesConfig(raw, DEFAULT_NOTES_CONFIG);
    const parsed = JSON.parse(out);
    expect(parsed.future).toEqual({ x: 1 });
    expect(parsed.notes).toEqual(DEFAULT_NOTES_CONFIG);
  });

  it("replaces invalid raw content with a fresh object", () => {
    const parsed = JSON.parse(serializeNotesConfig("{broken", DEFAULT_NOTES_CONFIG));
    expect(parsed).toEqual({ notes: DEFAULT_NOTES_CONFIG });
  });

  it("ends with a newline", () => {
    expect(serializeNotesConfig(null, DEFAULT_NOTES_CONFIG).endsWith("\n")).toBe(true);
  });
});

describe("path fixups", () => {
  const config = {
    ...DEFAULT_NOTES_CONFIG,
    quickAccess: ["docs/TODO.md", "docs/pending/bugs/foo.md", "README.md"],
    noteOrder: { "docs/TODO.md": 0, "README.md": 1 },
    collapsedFolders: ["docs/pending"],
    selectedFolder: "docs/pending",
  };

  it("renames a file everywhere", () => {
    const next = renamePathInConfig(config, "docs/TODO.md", "docs/DONE.md");
    expect(next.quickAccess[0]).toBe("docs/DONE.md");
    expect(next.noteOrder).toEqual({ "docs/DONE.md": 0, "README.md": 1 });
  });

  it("renames a folder prefix everywhere", () => {
    const next = renamePathInConfig(config, "docs/pending", "docs/queue");
    expect(next.quickAccess[1]).toBe("docs/queue/bugs/foo.md");
    expect(next.collapsedFolders).toEqual(["docs/queue"]);
    expect(next.selectedFolder).toBe("docs/queue");
  });

  it("does not rename sibling prefixes (docs/pending2 stays)", () => {
    const c = { ...config, quickAccess: ["docs/pending2/x.md"] };
    const next = renamePathInConfig(c, "docs/pending", "docs/queue");
    expect(next.quickAccess[0]).toBe("docs/pending2/x.md");
  });

  it("deletes a file", () => {
    const next = deletePathInConfig(config, "docs/TODO.md");
    expect(next.quickAccess).toEqual(["docs/pending/bugs/foo.md", "README.md"]);
    expect(next.noteOrder).toEqual({ "README.md": 1 });
  });

  it("deletes a folder subtree and resets selectedFolder", () => {
    const next = deletePathInConfig(config, "docs/pending");
    expect(next.quickAccess).toEqual(["docs/TODO.md", "README.md"]);
    expect(next.collapsedFolders).toEqual([]);
    expect(next.selectedFolder).toBe("");
  });
});
