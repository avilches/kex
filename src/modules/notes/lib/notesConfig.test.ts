import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTES_CONFIG,
  deletePathInConfig,
  parseNotesConfig,
  pruneNotesConfig,
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

  it("drops quickAccess entries that escape the vault", () => {
    const raw = JSON.stringify({
      notes: {
        quickAccess: [
          "docs/TODO.md",
          "/etc/passwd",
          "C:/Windows/win.ini",
          "../../secrets.md",
          "docs/../../secrets.md",
          "docs\\TODO.md",
        ],
      },
    });
    expect(parseNotesConfig(raw).quickAccess).toEqual(["docs/TODO.md"]);
  });

  it("falls back to the vault root for a selectedFolder that escapes the vault", () => {
    const escaping = [
      "/etc",
      "C:/Windows",
      "../..",
      "docs/../..",
      "docs\\pending",
    ];
    for (const selectedFolder of escaping) {
      const raw = JSON.stringify({ notes: { selectedFolder } });
      expect(parseNotesConfig(raw).selectedFolder).toBe("");
    }
  });

  it("keeps legitimate names that merely contain dots or a dot-dot prefix", () => {
    const raw = JSON.stringify({
      notes: {
        quickAccess: ["..config/a..b.md", "docs/a..b.md"],
        selectedFolder: "..config",
      },
    });
    expect(parseNotesConfig(raw)).toMatchObject({
      quickAccess: ["..config/a..b.md", "docs/a..b.md"],
      selectedFolder: "..config",
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
    const c = {
      ...config,
      quickAccess: ["docs/pending2/x.md"],
      folderOrder: { ...config.folderOrder, "docs/pending2": ["x.md"] },
    };
    const next = renamePathInConfig(c, "docs/pending", "docs/queue");
    expect(next.quickAccess[0]).toBe("docs/pending2/x.md");
    expect(next.folderOrder["docs/pending2"]).toEqual(["x.md"]);
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

describe("pruneNotesConfig", () => {
  const config = {
    ...DEFAULT_NOTES_CONFIG,
    quickAccess: ["docs/gone.md"],
    folderOrder: {
      "": ["README.md"],
      docs: ["IPC.md", "gone.md"],
      "docs/dead": ["x.md"],
    },
    expandedFolders: ["docs", "docs/dead"],
    selectedFolder: "docs/dead",
  };
  const folders = ["docs"];
  const notes = [
    { folder: "", relPath: "README.md" },
    { folder: "docs", relPath: "docs/IPC.md" },
  ];

  it("drops folders the index does not know about", () => {
    const next = pruneNotesConfig(config, folders, notes);
    expect(next.expandedFolders).toEqual(["docs"]);
    expect(next.folderOrder["docs/dead"]).toBeUndefined();
  });

  it("keeps the root entry and drops dead file names", () => {
    const next = pruneNotesConfig(config, folders, notes);
    expect(next.folderOrder[""]).toEqual(["README.md"]);
    expect(next.folderOrder.docs).toEqual(["IPC.md"]);
  });

  it("drops an entry whose folder lost every note", () => {
    const c = { ...config, folderOrder: { docs: ["gone.md"] } };
    const next = pruneNotesConfig(c, folders, [{ folder: "", relPath: "README.md" }]);
    expect(next.folderOrder).toEqual({});
  });

  it("resets a selectedFolder that no longer exists", () => {
    expect(pruneNotesConfig(config, folders, notes).selectedFolder).toBe("");
  });

  it("leaves quickAccess untouched", () => {
    expect(pruneNotesConfig(config, folders, notes).quickAccess).toEqual(["docs/gone.md"]);
  });

  it("returns the same reference when there is nothing to prune", () => {
    const clean = {
      ...DEFAULT_NOTES_CONFIG,
      folderOrder: { docs: ["IPC.md"] },
      expandedFolders: ["docs"],
      selectedFolder: "docs",
    };
    expect(pruneNotesConfig(clean, folders, notes)).toBe(clean);
  });

  it("keeps the root selected and the root entry when the vault has no folders", () => {
    const clean = { ...DEFAULT_NOTES_CONFIG, folderOrder: { "": ["README.md"] } };
    const next = pruneNotesConfig(clean, [], [{ folder: "", relPath: "README.md" }]);
    expect(next).toBe(clean);
  });
});
