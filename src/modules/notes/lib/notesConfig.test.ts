import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTES_CONFIG,
  deletePathInConfig,
  parseNotesConfig,
  renamePathInConfig,
  serializeNotesConfig,
  withAncestors,
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
        folderOrder: { "": ["README.md"], docs: ["IPC.md", "TODO.md"] },
        expandedFolders: ["docs"],
        groupByDate: false,
        selectedFolder: "docs",
      },
    });
    expect(parseNotesConfig(raw)).toEqual({
      quickAccess: ["docs/TODO.md"],
      sortMode: "title",
      folderOrder: { "": ["README.md"], docs: ["IPC.md", "TODO.md"] },
      expandedFolders: ["docs"],
      groupByDate: false,
      selectedFolder: "docs",
    });
  });

  it("falls back per field on wrong types", () => {
    const raw = JSON.stringify({
      notes: {
        quickAccess: "nope",
        sortMode: "bogus",
        folderOrder: { docs: "nope", ok: ["a.md"], nested: [1, 2] },
        expandedFolders: [1, 2],
        groupByDate: "yes",
        selectedFolder: 7,
      },
    });
    expect(parseNotesConfig(raw)).toEqual({
      ...DEFAULT_NOTES_CONFIG,
      folderOrder: { ok: ["a.md"] },
    });
  });

  it("ignores the removed collapsedFolders and noteOrder keys", () => {
    const raw = JSON.stringify({
      notes: { collapsedFolders: ["docs"], noteOrder: { "a.md": 0 } },
    });
    expect(parseNotesConfig(raw)).toEqual(DEFAULT_NOTES_CONFIG);
  });

  it("seeds the ancestors of the selected folder into expandedFolders", () => {
    const raw = JSON.stringify({
      notes: { expandedFolders: [], selectedFolder: "docs/pending/bugs" },
    });
    expect(parseNotesConfig(raw).expandedFolders).toEqual(["docs", "docs/pending"]);
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

describe("withAncestors", () => {
  it("adds the missing ancestors and keeps the existing entries", () => {
    expect(withAncestors(["public"], "docs/pending/bugs")).toEqual([
      "public",
      "docs",
      "docs/pending",
    ]);
  });

  it("returns the same array reference when nothing is missing", () => {
    const expanded = ["docs", "docs/pending"];
    expect(withAncestors(expanded, "docs/pending")).toBe(expanded);
  });

  it("adds nothing for the root or a top-level folder", () => {
    const expanded: string[] = [];
    expect(withAncestors(expanded, "")).toBe(expanded);
    expect(withAncestors(expanded, "docs")).toBe(expanded);
  });
});

describe("path fixups", () => {
  const config = {
    ...DEFAULT_NOTES_CONFIG,
    quickAccess: ["docs/TODO.md", "docs/pending/bugs/foo.md", "README.md"],
    folderOrder: {
      "": ["README.md"],
      docs: ["TODO.md", "IPC.md"],
      "docs/pending": ["foo.md"],
    },
    expandedFolders: ["docs/pending"],
    selectedFolder: "docs/pending",
  };

  it("renames a note inside its own folder list", () => {
    const next = renamePathInConfig(config, "docs/TODO.md", "docs/DONE.md");
    expect(next.quickAccess[0]).toBe("docs/DONE.md");
    expect(next.folderOrder.docs).toEqual(["DONE.md", "IPC.md"]);
    expect(next.folderOrder[""]).toEqual(["README.md"]);
  });

  it("renames a folder by remapping keys and leaving file names alone", () => {
    const next = renamePathInConfig(config, "docs/pending", "docs/queue");
    expect(next.quickAccess[1]).toBe("docs/queue/bugs/foo.md");
    expect(next.folderOrder["docs/queue"]).toEqual(["foo.md"]);
    expect(next.folderOrder["docs/pending"]).toBeUndefined();
    expect(next.expandedFolders).toEqual(["docs/queue"]);
    expect(next.selectedFolder).toBe("docs/queue");
  });

  it("does not rename sibling prefixes (docs/pending2 stays)", () => {
    const c = { ...config, quickAccess: ["docs/pending2/x.md"] };
    const next = renamePathInConfig(c, "docs/pending", "docs/queue");
    expect(next.quickAccess[0]).toBe("docs/pending2/x.md");
  });

  it("deletes a note from its folder list", () => {
    const next = deletePathInConfig(config, "docs/TODO.md");
    expect(next.quickAccess).toEqual(["docs/pending/bugs/foo.md", "README.md"]);
    expect(next.folderOrder.docs).toEqual(["IPC.md"]);
  });

  it("drops a folder list that the delete emptied", () => {
    const next = deletePathInConfig(config, "docs/pending/foo.md");
    expect(next.folderOrder["docs/pending"]).toBeUndefined();
  });

  it("deletes a folder subtree and resets selectedFolder", () => {
    const next = deletePathInConfig(config, "docs/pending");
    expect(next.quickAccess).toEqual(["docs/TODO.md", "README.md"]);
    expect(next.folderOrder["docs/pending"]).toBeUndefined();
    expect(next.folderOrder.docs).toEqual(["TODO.md", "IPC.md"]);
    expect(next.expandedFolders).toEqual([]);
    expect(next.selectedFolder).toBe("");
  });
});
