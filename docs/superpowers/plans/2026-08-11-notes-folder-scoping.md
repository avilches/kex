# Notes Folder Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the notes list show exactly one folder at a time, with the folder tree collapsed by default, custom order stored per folder, and dead paths pruned from `kex.json` automatically.

**Architecture:** All behaviour changes land in the pure core under `src/modules/notes/lib/` first (path helpers, folder helpers, filtering, sorting, config shape, pruning), each with vitest coverage. The three components (`CollectionsColumn`, `NoteListColumn`, `NotesView`) are then adapted to the new core. `NotesView` stays the coordinator that owns the index and hands derived data down.

**Tech Stack:** React 19, TypeScript, vitest, dnd-kit, hugeicons, Tailwind v4. No new dependencies. No Rust changes: `notes_list` already returns every folder and every note's `folder` field.

**Spec:** `docs/superpowers/specs/2026-08-11-notes-folder-scoping-design.md`

## Global Constraints

- Package manager is **pnpm** only. Never npm, npx or yarn.
- Frontend checks that must pass: `pnpm lint`, `pnpm check-types`, `pnpm test`. No Rust file changes in this plan, so `cargo clippy` and `cargo test` are not part of the loop.
- `pnpm test` runs `vitest run`. A single file: `pnpm test src/modules/notes/lib/noteSort.test.ts`.
- **No backward compatibility.** Never write migration code, shims, or fallback reads of an old JSON key. Renamed fields simply start from their default value.
- **No new em-dash** (`—`) anywhere: code, comments, commits, docs. `docs/FORK.md` already uses one as a bullet separator on every line; leave those in place and never add another. **No emojis** anywhere.
- Imports are always `@/...`, never relative across modules. Inside the same directory, relative (`./notesConfig`) matches the existing notes code and stays.
- Comments: default to none. If one is genuinely needed, 1 to 2 lines explaining *why*, never *what*.
- Commit messages in English, imperative, one logical change per commit. Never add "Co-authored-by" or any "Generated with" line.
- Vault-relative paths are always forward-slash (they come from `to_canon` in Rust). The empty string is the vault root.

---

### Task 1: Shared path helpers, and delete the three duplicated `baseName` copies

The notes module has the same `baseName` function copied into three files, and this plan needs two more path helpers. `src/lib/pathUtils.ts` already exports an equivalent `pathBasename`, so the copies go away and the new helpers land next to it.

This closes [IMP-NOTES-01](../../pending/improvements/IMP-NOTES-01-duplicado-basename.md) for the notes module. The fourth copy, `basename` in `src/modules/workspaces/lib/tabTitle.tsx`, is deliberately left alone: it adds `.filter(Boolean)`, so it returns `docs` for `docs/` where `pathBasename` returns the empty string. Unifying them would change tab titles for trailing-slash paths, which is outside this feature.

**Files:**
- Modify: `src/lib/pathUtils.ts` (add two exports after `pathBasename`, line 16)
- Test: `src/lib/pathUtils.test.ts`
- Modify: `src/modules/notes/NotesView.tsx:20-23` (delete local `basename`, import `pathBasename`)
- Modify: `src/modules/notes/CollectionsColumn.tsx:56-59` (delete local `baseName`, import `pathBasename`)
- Modify: `src/modules/notes/NoteRow.tsx:38-41` (delete local `baseName`, import `pathBasename`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `splitPath(relPath: string): [string, string]` returning `[dir, name]`, where `dir` is `""` for a path with no slash.
  - `ancestorsOf(relPath: string): string[]` returning every proper ancestor folder, outermost first, excluding the path itself and excluding the root.
  - `pathBasename(path: string): string` already exists at `src/lib/pathUtils.ts:12`; tasks 4, 6, 7 and 8 import it.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/pathUtils.test.ts`:

```ts
describe("splitPath", () => {
  it("splits a nested path into dir and name", () => {
    expect(splitPath("docs/pending/BUG-52.md")).toEqual(["docs/pending", "BUG-52.md"]);
  });
  it("returns an empty dir for a root-level path", () => {
    expect(splitPath("README.md")).toEqual(["", "README.md"]);
  });
  it("handles the empty string", () => {
    expect(splitPath("")).toEqual(["", ""]);
  });
});

describe("ancestorsOf", () => {
  it("lists proper ancestors outermost first", () => {
    expect(ancestorsOf("docs/pending/bugs/BUG-52.md")).toEqual([
      "docs",
      "docs/pending",
      "docs/pending/bugs",
    ]);
  });
  it("returns nothing for a root-level path or the root itself", () => {
    expect(ancestorsOf("README.md")).toEqual([]);
    expect(ancestorsOf("")).toEqual([]);
  });
});
```

Add `ancestorsOf` and `splitPath` to the existing import from `./pathUtils` at the top of the file.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test src/lib/pathUtils.test.ts`
Expected: FAIL, `splitPath is not a function` / no exported member `ancestorsOf`.

- [ ] **Step 3: Implement the helpers**

In `src/lib/pathUtils.ts`, right after `pathBasename` (line 16):

```ts
// Vault-relative, forward-slash paths only: these two never see OS separators.
export function splitPath(relPath: string): [string, string] {
  const i = relPath.lastIndexOf("/");
  return i === -1 ? ["", relPath] : [relPath.slice(0, i), relPath.slice(i + 1)];
}

export function ancestorsOf(relPath: string): string[] {
  const out: string[] = [];
  let i = relPath.indexOf("/");
  while (i !== -1) {
    out.push(relPath.slice(0, i));
    i = relPath.indexOf("/", i + 1);
  }
  return out;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm test src/lib/pathUtils.test.ts`
Expected: PASS.

- [ ] **Step 5: Delete the three duplicated helpers**

In `src/modules/notes/NotesView.tsx`, delete lines 20 to 23 (the local `basename`), add `import { pathBasename } from "@/lib/pathUtils";` to the import block, and rename the three call sites (`basename(relPath)` at lines 181 and 200, `basename(pendingDelete.relPath)` at line 261) to `pathBasename(...)`.

In `src/modules/notes/CollectionsColumn.tsx`, delete lines 56 to 59 (`baseName`), add `import { pathBasename } from "@/lib/pathUtils";`, and change the single call site at line 87 to `pathBasename(props.relPath)`.

In `src/modules/notes/NoteRow.tsx`, delete lines 38 to 41 (`baseName`), add `import { pathBasename } from "@/lib/pathUtils";`, and change the three call sites (line 47 in the `useState` initialiser, line 56 in the effect, line 73 in `commitRename`) to `pathBasename(note.relPath)`.

- [ ] **Step 6: Verify the whole frontend still builds and passes**

Run: `pnpm check-types && pnpm lint && pnpm test`
Expected: all three pass. No behaviour changed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pathUtils.ts src/lib/pathUtils.test.ts src/modules/notes/NotesView.tsx src/modules/notes/CollectionsColumn.tsx src/modules/notes/NoteRow.tsx
git commit -m "refactor(notes): share path helpers from pathUtils instead of three local copies"
```

---

### Task 2: `childFolders` and `countDirectNotes` in `folderTree.ts`

Purely additive. The old `countNotesPerFolder` stays until task 7 removes it, so the app keeps compiling.

**Files:**
- Modify: `src/modules/notes/lib/folderTree.ts`
- Test: `src/modules/notes/lib/folderTree.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `childFolders(folders: string[], parent: string): string[]` returning the immediate children of `parent` (`""` means the vault root), sorted case-insensitively. Used by task 8.
  - `countDirectNotes(notes: { folder: string }[]): Map<string, number>` counting notes per exact folder, root included. Used by tasks 7 and 8.

- [ ] **Step 1: Write the failing tests**

Append to `src/modules/notes/lib/folderTree.test.ts`, and add `childFolders` plus `countDirectNotes` to the import from `./folderTree`:

```ts
describe("childFolders", () => {
  const folders = ["docs", "docs/sub", "docs/sub/deep", "Alpha", "alpha2", "docs2"];

  it("returns immediate children only, not grandchildren", () => {
    expect(childFolders(folders, "docs")).toEqual(["docs/sub"]);
  });

  it("returns the top-level folders for the root, sorted case-insensitively", () => {
    expect(childFolders(folders, "")).toEqual(["Alpha", "alpha2", "docs", "docs2"]);
  });

  it("does not match sibling prefixes", () => {
    expect(childFolders(["docs2/x", "docs2"], "docs")).toEqual([]);
  });

  it("returns nothing for a leaf folder", () => {
    expect(childFolders(folders, "docs/sub/deep")).toEqual([]);
  });
});

describe("countDirectNotes", () => {
  it("counts notes per exact folder, root included", () => {
    const counts = countDirectNotes([
      { folder: "" },
      { folder: "docs" },
      { folder: "docs/sub" },
      { folder: "docs/sub" },
    ]);
    expect(counts.get("")).toBe(1);
    expect(counts.get("docs")).toBe(1);
    expect(counts.get("docs/sub")).toBe(2);
  });

  it("has no entry for a folder that only holds subfolders", () => {
    const counts = countDirectNotes([{ folder: "archive/2024" }]);
    expect(counts.get("archive")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test src/modules/notes/lib/folderTree.test.ts`
Expected: FAIL, `childFolders is not a function`.

- [ ] **Step 3: Implement both helpers**

Append to `src/modules/notes/lib/folderTree.ts`:

```ts
export function childFolders(folders: string[], parent: string): string[] {
  const prefix = parent === "" ? "" : `${parent}/`;
  return folders
    .filter((f) => {
      if (!f.startsWith(prefix)) return false;
      const rest = f.slice(prefix.length);
      return rest !== "" && !rest.includes("/");
    })
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

export function countDirectNotes(notes: { folder: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of notes) counts.set(n.folder, (counts.get(n.folder) ?? 0) + 1);
  return counts;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm test src/modules/notes/lib/folderTree.test.ts`
Expected: PASS, including the pre-existing `countNotesPerFolder` and `buildFolderTree` tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/notes/lib/folderTree.ts src/modules/notes/lib/folderTree.test.ts
git commit -m "feat(notes): add childFolders and countDirectNotes helpers"
```

---

### Task 3: `filterByFolder` matches exactly one folder

One-line behaviour change with no call-site change. After this commit, selecting `docs` in the tree shows only the notes directly in `docs`. Every folder is still reachable from the tree, which lists them all, so nothing becomes unreachable before task 8 adds the folder rows to the list.

**Files:**
- Modify: `src/modules/notes/lib/noteSort.ts:4-7`
- Test: `src/modules/notes/lib/noteSort.test.ts:26-35`

**Interfaces:**
- Consumes: nothing.
- Produces: `filterByFolder(notes, folder)` now returns only notes whose `folder` equals `folder`. Task 7 relies on this when the root row becomes the vault root.

- [ ] **Step 1: Rewrite the two existing tests to the new expectation**

Replace the whole `describe("filterByFolder", ...)` block in `src/modules/notes/lib/noteSort.test.ts` (lines 26 to 35) with:

```ts
describe("filterByFolder", () => {
  const notes = [n("a.md"), n("docs/b.md"), n("docs/sub/c.md"), n("docs2/d.md")];

  it("root means only the notes directly in the root", () => {
    expect(filterByFolder(notes, "").map((x) => x.relPath)).toEqual(["a.md"]);
  });

  it("matches the folder exactly, excluding its subtree and sibling prefixes", () => {
    expect(filterByFolder(notes, "docs").map((x) => x.relPath)).toEqual(["docs/b.md"]);
  });

  it("matches a nested folder", () => {
    expect(filterByFolder(notes, "docs/sub").map((x) => x.relPath)).toEqual(["docs/sub/c.md"]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test src/modules/notes/lib/noteSort.test.ts`
Expected: FAIL on the first two, because the current implementation returns 4 notes for `""` and 2 for `docs`.

- [ ] **Step 3: Implement the exact match**

Replace lines 4 to 7 of `src/modules/notes/lib/noteSort.ts`:

```ts
export function filterByFolder(notes: NoteListItem[], folder: string): NoteListItem[] {
  return notes.filter((n) => n.folder === folder);
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm test src/modules/notes/lib/noteSort.test.ts`
Expected: PASS. The `mergeNoteOrder` tests still pass; task 4 deletes them.

- [ ] **Step 5: Commit**

```bash
git add src/modules/notes/lib/noteSort.ts src/modules/notes/lib/noteSort.test.ts
git commit -m "feat(notes): filter the note list to exactly one folder"
```

---

### Task 4: New persisted shape, `expandedFolders` and `folderOrder`

The breaking change, done end to end in one commit so the repo never has a state that does not typecheck. `collapsedFolders` becomes `expandedFolders` with inverted meaning, and the flat `noteOrder` map becomes one ordered list of file names per folder. `mergeNoteOrder` is deleted: with an exact folder filter there is no cross-folder state left for a drag to damage.

**Files:**
- Modify: `src/modules/notes/lib/notesConfig.ts` (whole file)
- Test: `src/modules/notes/lib/notesConfig.test.ts` (whole file)
- Modify: `src/modules/notes/lib/noteSort.ts` (`sortNotes` signature, delete `mergeNoteOrder` at lines 42-69)
- Test: `src/modules/notes/lib/noteSort.test.ts` (`sortNotes` custom case, delete the `mergeNoteOrder` describe at lines 71-108)
- Modify: `src/modules/notes/lib/useNotesState.ts:124-137` (`setNoteOrder`, `toggleFolderCollapsed`)
- Modify: `src/modules/notes/NoteListColumn.tsx:50, 71-74, 90-102, 109, 201`
- Modify: `src/modules/notes/CollectionsColumn.tsx:40, 46, 108, 111, 123, 178, 239, 253-256, 262`
- Modify: `src/modules/notes/NotesView.tsx:216, 222, 252`

**Interfaces:**
- Consumes: `pathBasename` and `splitPath` from `@/lib/pathUtils` (task 1).
- Produces:
  - `NotesConfig` with `folderOrder: Record<string, string[]>` and `expandedFolders: string[]`.
  - `sortNotes(notes: NoteListItem[], mode: NoteSortMode, order: string[] | undefined)`.
  - `useNotesState` actions `setFolderOrder(folder: string, names: string[])` and `toggleFolderExpanded(relPath: string)`. Tasks 5 to 8 build on these names.

- [ ] **Step 1: Write the failing tests for the new config shape**

Replace the whole content of `src/modules/notes/lib/notesConfig.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test src/modules/notes/lib/notesConfig.test.ts`
Expected: FAIL on every new expectation, since the current config still has `noteOrder` and `collapsedFolders`.

- [ ] **Step 3: Rewrite `notesConfig.ts`**

Replace the whole content of `src/modules/notes/lib/notesConfig.ts` with:

```ts
import { splitPath } from "@/lib/pathUtils";

export type NoteSortMode = "modified" | "title" | "created" | "custom";

export type NotesConfig = {
  quickAccess: string[];
  sortMode: NoteSortMode;
  folderOrder: Record<string, string[]>;
  expandedFolders: string[];
  groupByDate: boolean;
  selectedFolder: string;
};

export const DEFAULT_NOTES_CONFIG: NotesConfig = {
  quickAccess: [],
  sortMode: "modified",
  folderOrder: {},
  expandedFolders: [],
  groupByDate: true,
  selectedFolder: "",
};

const SORT_MODES: readonly string[] = ["modified", "title", "created", "custom"];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseNotesConfig(raw: string | null): NotesConfig {
  if (!raw) return { ...DEFAULT_NOTES_CONFIG };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_NOTES_CONFIG };
  }
  if (!isPlainObject(parsed)) return { ...DEFAULT_NOTES_CONFIG };
  const ns = parsed.notes;
  if (!isPlainObject(ns)) return { ...DEFAULT_NOTES_CONFIG };
  const folderOrder: Record<string, string[]> = {};
  if (isPlainObject(ns.folderOrder)) {
    for (const [k, v] of Object.entries(ns.folderOrder)) {
      if (isStringArray(v)) folderOrder[k] = v;
    }
  }
  return {
    quickAccess: isStringArray(ns.quickAccess) ? ns.quickAccess : [],
    sortMode: SORT_MODES.includes(ns.sortMode as string)
      ? (ns.sortMode as NoteSortMode)
      : DEFAULT_NOTES_CONFIG.sortMode,
    folderOrder,
    expandedFolders: isStringArray(ns.expandedFolders) ? ns.expandedFolders : [],
    groupByDate:
      typeof ns.groupByDate === "boolean" ? ns.groupByDate : DEFAULT_NOTES_CONFIG.groupByDate,
    selectedFolder: typeof ns.selectedFolder === "string" ? ns.selectedFolder : "",
  };
}

export function serializeNotesConfig(raw: string | null, config: NotesConfig): string {
  let root: Record<string, unknown> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (isPlainObject(parsed)) root = parsed;
    } catch {
      // invalid file: the first user mutation legitimately replaces it (spec, Error handling)
    }
  }
  root.notes = config;
  return `${JSON.stringify(root, null, 2)}\n`;
}

export function renamePathInConfig(config: NotesConfig, from: string, to: string): NotesConfig {
  const map = (p: string): string =>
    p === from ? to : p.startsWith(`${from}/`) ? `${to}${p.slice(from.length)}` : p;
  // A note rename only ever touches the list of its own folder. A folder rename
  // cannot collide here: the filesystem forbids a note and a folder sharing a name.
  const [fromDir, fromName] = splitPath(from);
  const [toDir, toName] = splitPath(to);
  const folderOrder: Record<string, string[]> = {};
  for (const [folder, names] of Object.entries(config.folderOrder)) {
    const next =
      folder !== fromDir
        ? names
        : toDir === fromDir
          ? names.map((x) => (x === fromName ? toName : x))
          : names.filter((x) => x !== fromName);
    if (next.length > 0) folderOrder[map(folder)] = next;
  }
  return {
    ...config,
    quickAccess: config.quickAccess.map(map),
    folderOrder,
    expandedFolders: config.expandedFolders.map(map),
    selectedFolder: map(config.selectedFolder),
  };
}

export function deletePathInConfig(config: NotesConfig, relPath: string): NotesConfig {
  const gone = (p: string): boolean => p === relPath || p.startsWith(`${relPath}/`);
  const [dir, name] = splitPath(relPath);
  const folderOrder: Record<string, string[]> = {};
  for (const [folder, names] of Object.entries(config.folderOrder)) {
    if (gone(folder)) continue;
    const next = folder === dir ? names.filter((x) => x !== name) : names;
    if (next.length > 0) folderOrder[folder] = next;
  }
  return {
    ...config,
    quickAccess: config.quickAccess.filter((p) => !gone(p)),
    folderOrder,
    expandedFolders: config.expandedFolders.filter((p) => !gone(p)),
    selectedFolder: gone(config.selectedFolder) ? "" : config.selectedFolder,
  };
}
```

- [ ] **Step 4: Run the config tests and verify they pass**

Run: `pnpm test src/modules/notes/lib/notesConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the `sortNotes` test and delete the `mergeNoteOrder` tests**

In `src/modules/notes/lib/noteSort.test.ts`, remove `mergeNoteOrder` from the import list, delete the whole `describe("mergeNoteOrder", ...)` block (lines 71 to 108 of the original file), and replace the `sortNotes` describe body's calls so the third argument is an array or `undefined`:

```ts
describe("sortNotes", () => {
  const a = n("a.md", { title: "Zebra", mtime: 300, created: 100 });
  const b = n("b.md", { title: "alpha", mtime: 200, created: 300 });
  const c = n("c.md", { title: "Mango", mtime: 100, created: 200 });

  it("modified: mtime desc", () => {
    expect(sortNotes([c, a, b], "modified", undefined).map((x) => x.relPath)).toEqual([
      "a.md", "b.md", "c.md",
    ]);
  });
  it("title: case-insensitive asc", () => {
    expect(sortNotes([a, b, c], "title", undefined).map((x) => x.title)).toEqual([
      "alpha", "Mango", "Zebra",
    ]);
  });
  it("created: created desc", () => {
    expect(sortNotes([a, b, c], "created", undefined).map((x) => x.relPath)).toEqual([
      "b.md", "c.md", "a.md",
    ]);
  });
  it("custom: listed names in order, unlisted after by mtime desc", () => {
    const extra = n("z.md", { mtime: 999 });
    expect(
      sortNotes([a, b, c, extra], "custom", ["c.md", "b.md"]).map((x) => x.relPath),
    ).toEqual(["c.md", "b.md", "z.md", "a.md"]);
  });
  it("custom: a folder with no list falls back to mtime desc", () => {
    expect(sortNotes([c, a, b], "custom", undefined).map((x) => x.relPath)).toEqual([
      "a.md", "b.md", "c.md",
    ]);
  });
  it("custom: matches by file name inside a nested folder", () => {
    const x = n("docs/x.md", { mtime: 10 });
    const y = n("docs/y.md", { mtime: 20 });
    expect(sortNotes([x, y], "custom", ["y.md", "x.md"]).map((x2) => x2.relPath)).toEqual([
      "docs/y.md", "docs/x.md",
    ]);
  });
  it("does not mutate the input", () => {
    const input = [a, b, c];
    sortNotes(input, "title", undefined);
    expect(input.map((x) => x.relPath)).toEqual(["a.md", "b.md", "c.md"]);
  });
});
```

- [ ] **Step 6: Run the tests and verify the custom cases fail**

Run: `pnpm test src/modules/notes/lib/noteSort.test.ts`
Expected: FAIL on the custom cases and on the deleted-import line, because `sortNotes` still expects a record.

- [ ] **Step 7: Change `sortNotes` and delete `mergeNoteOrder`**

In `src/modules/notes/lib/noteSort.ts`, add `import { pathBasename } from "@/lib/pathUtils";` at the top, replace the signature and the `custom` case, and delete `mergeNoteOrder` together with its comment block (lines 42 to 69):

```ts
export function sortNotes(
  notes: NoteListItem[],
  mode: NoteSortMode,
  order: string[] | undefined,
): NoteListItem[] {
  const copy = [...notes];
  switch (mode) {
    case "title":
      copy.sort(
        (a, b) =>
          a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) ||
          a.relPath.localeCompare(b.relPath),
      );
      break;
    case "created":
      copy.sort((a, b) => b.created - a.created || a.relPath.localeCompare(b.relPath));
      break;
    case "custom": {
      const rank = new Map<string, number>();
      (order ?? []).forEach((name, i) => rank.set(name, i));
      copy.sort((a, b) => {
        const ia = rank.get(pathBasename(a.relPath));
        const ib = rank.get(pathBasename(b.relPath));
        if (ia !== undefined && ib !== undefined) return ia - ib;
        if (ia !== undefined) return -1;
        if (ib !== undefined) return 1;
        return b.mtime - a.mtime;
      });
      break;
    }
    default:
      copy.sort((a, b) => b.mtime - a.mtime || a.relPath.localeCompare(b.relPath));
  }
  return copy;
}
```

- [ ] **Step 8: Run the tests and verify they pass**

Run: `pnpm test src/modules/notes/lib`
Expected: PASS across `notesConfig.test.ts`, `noteSort.test.ts`, `folderTree.test.ts`, `useNotesIndex.test.ts`.

- [ ] **Step 9: Update `useNotesState` actions**

In `src/modules/notes/lib/useNotesState.ts`, replace `setNoteOrder` (lines 124-127) and `toggleFolderCollapsed` (lines 128-137) with:

```ts
  const setFolderOrder = useCallback(
    (folder: string, names: string[]) =>
      update((c) => ({ ...c, folderOrder: { ...c.folderOrder, [folder]: names } })),
    [update],
  );
  const toggleFolderExpanded = useCallback(
    (relPath: string) =>
      update((c) => ({
        ...c,
        expandedFolders: c.expandedFolders.includes(relPath)
          ? c.expandedFolders.filter((p) => p !== relPath)
          : [...c.expandedFolders, relPath],
      })),
    [update],
  );
```

Update the returned object (lines 155-166) to export `setFolderOrder` and `toggleFolderExpanded` instead of the old two names.

- [ ] **Step 10: Update `NoteListColumn`**

In `src/modules/notes/NoteListColumn.tsx`:

Change the prop at line 50 from `onSetNoteOrder: (order: Record<string, number>) => void;` to:

```ts
  onSetFolderOrder: (folder: string, names: string[]) => void;
```

Replace the `sorted` memo (lines 71-74):

```ts
  const order = config.folderOrder[config.selectedFolder];
  const sorted = useMemo(
    () => sortNotes(props.notes, config.sortMode, order),
    [props.notes, config.sortMode, order],
  );
```

Replace `handleDragEnd` (lines 90-102):

```ts
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const rels = sorted.map((n) => n.relPath);
    const from = rels.indexOf(String(active.id));
    const to = rels.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    rels.splice(to, 0, ...rels.splice(from, 1));
    props.onSetFolderOrder(config.selectedFolder, rels.map(pathBasename));
  };
```

Add `import { pathBasename } from "@/lib/pathUtils";` and remove `mergeNoteOrder` from the `./lib/noteSort` import.

- [ ] **Step 11: Update `CollectionsColumn`**

In `src/modules/notes/CollectionsColumn.tsx`, rename the prop `collapsedFolders: string[]` to `expandedFolders: string[]` (line 40) and `onToggleFolderCollapsed` to `onToggleFolderExpanded` (line 46). In `FolderRowProps`, rename `collapsed: Set<string>` to `expanded: Set<string>` (line 108) and `onToggleFolderCollapsed` to `onToggleFolderExpanded` (line 111).

In `FolderRow`, replace line 123 with `const isExpanded = props.expanded.has(node.relPath);` and update the three readers:

```tsx
              title={isExpanded ? "Collapse" : "Expand"}
              onClick={(e) => {
                e.stopPropagation();
                if (hasChildren) props.onToggleFolderExpanded(node.relPath);
              }}
```

```tsx
              <HugeiconsIcon
                icon={isExpanded ? ArrowDown01Icon : ArrowRight01Icon}
                size={11}
                strokeWidth={1.85}
              />
```

and the children guard at line 239 becomes `{isExpanded &&`.

Replace the `collapsed` memo (lines 253-256) and its use in `folderRowShared` (line 262):

```ts
  const expanded = useMemo(() => new Set(props.expandedFolders), [props.expandedFolders]);
```

```ts
    expanded,
    onToggleFolderExpanded: props.onToggleFolderExpanded,
```

- [ ] **Step 12: Update the `NotesView` wiring**

In `src/modules/notes/NotesView.tsx`, change the three props being passed:

```tsx
            expandedFolders={state.config.expandedFolders}
```
```tsx
            onToggleFolderExpanded={state.toggleFolderExpanded}
```
```tsx
            onSetFolderOrder={state.setFolderOrder}
```

- [ ] **Step 13: Verify the whole frontend**

Run: `pnpm check-types && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 14: Commit**

```bash
git add src/modules/notes
git commit -m "feat(notes): persist expanded folders and per-folder custom order"
```

---

### Task 5: Expand the ancestors of the selected folder

With every folder collapsed by default, a persisted `selectedFolder` of `docs/pending` would leave the selection invisible in the tree. Reading the config seeds the ancestors, and so does selecting a folder, which is what will make drilling down from a folder row keep the tree in step in task 8.

**Files:**
- Modify: `src/modules/notes/lib/notesConfig.ts` (add `withAncestors`, use it in `parseNotesConfig`)
- Test: `src/modules/notes/lib/notesConfig.test.ts`
- Modify: `src/modules/notes/lib/useNotesState.ts` (`setSelectedFolder`, lines 138-141)

**Interfaces:**
- Consumes: `ancestorsOf` from `@/lib/pathUtils` (task 1), `NotesConfig` (task 4).
- Produces: `withAncestors(expanded: string[], folder: string): string[]`, exported from `notesConfig.ts` and used by `useNotesState`.

- [ ] **Step 1: Write the failing tests**

Add to `src/modules/notes/lib/notesConfig.test.ts`, and add `withAncestors` to the import:

```ts
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
```

And inside `describe("parseNotesConfig")`:

```ts
  it("seeds the ancestors of the selected folder into expandedFolders", () => {
    const raw = JSON.stringify({
      notes: { expandedFolders: [], selectedFolder: "docs/pending/bugs" },
    });
    expect(parseNotesConfig(raw).expandedFolders).toEqual(["docs", "docs/pending"]);
  });
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test src/modules/notes/lib/notesConfig.test.ts`
Expected: FAIL, no exported member `withAncestors`.

- [ ] **Step 3: Implement it**

In `src/modules/notes/lib/notesConfig.ts`, extend the import to `import { ancestorsOf, splitPath } from "@/lib/pathUtils";` and add:

```ts
export function withAncestors(expanded: string[], folder: string): string[] {
  const missing = ancestorsOf(folder).filter((a) => !expanded.includes(a));
  return missing.length === 0 ? expanded : [...expanded, ...missing];
}
```

In `parseNotesConfig`, compute the two fields before the return and use them:

```ts
  const selectedFolder = typeof ns.selectedFolder === "string" ? ns.selectedFolder : "";
  const expandedFolders = isStringArray(ns.expandedFolders) ? ns.expandedFolders : [];
```

then in the returned object:

```ts
    expandedFolders: withAncestors(expandedFolders, selectedFolder),
    selectedFolder,
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm test src/modules/notes/lib/notesConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Expand ancestors on selection too**

In `src/modules/notes/lib/useNotesState.ts`, add `withAncestors` to the import from `./notesConfig` and replace `setSelectedFolder` (lines 138-141):

```ts
  const setSelectedFolder = useCallback(
    (selectedFolder: string) =>
      update((c) => ({
        ...c,
        selectedFolder,
        expandedFolders: withAncestors(c.expandedFolders, selectedFolder),
      })),
    [update],
  );
```

- [ ] **Step 6: Verify**

Run: `pnpm check-types && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/modules/notes/lib/notesConfig.ts src/modules/notes/lib/notesConfig.test.ts src/modules/notes/lib/useNotesState.ts
git commit -m "feat(notes): expand the ancestors of the selected folder"
```

---

### Task 6: Prune dead paths from `kex.json`

Nothing today removes state for a folder or note that stopped existing outside Kex. This adds a pure pruning pass driven by the index, guarded so a failed, in-flight, or truncated walk can never delete live state, and makes `update` skip the write when the config comes back unchanged.

**Files:**
- Modify: `src/modules/notes/lib/notesConfig.ts` (add `pruneNotesConfig`)
- Test: `src/modules/notes/lib/notesConfig.test.ts`
- Modify: `src/modules/notes/lib/useNotesState.ts` (`update` identity guard, new `pruneAgainstIndex`)
- Modify: `src/modules/notes/NotesView.tsx` (new effect)

**Interfaces:**
- Consumes: `pathBasename` from `@/lib/pathUtils` (task 1), `NotesConfig` (task 4).
- Produces:
  - `pruneNotesConfig(config: NotesConfig, folders: string[], notes: { folder: string; relPath: string }[]): NotesConfig`, returning the same reference when nothing changed.
  - `useNotesState` action `pruneAgainstIndex(folders: string[], notes: { folder: string; relPath: string }[]): void`.

- [ ] **Step 1: Write the failing tests**

Add to `src/modules/notes/lib/notesConfig.test.ts`, adding `pruneNotesConfig` to the import:

```ts
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
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test src/modules/notes/lib/notesConfig.test.ts`
Expected: FAIL, no exported member `pruneNotesConfig`.

- [ ] **Step 3: Implement the pruning**

In `src/modules/notes/lib/notesConfig.ts`, extend the import to `import { ancestorsOf, pathBasename, splitPath } from "@/lib/pathUtils";` and append:

```ts
function sameFolderOrder(
  a: Record<string, string[]>,
  b: Record<string, string[]>,
): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => {
    const x = a[k];
    const y = b[k];
    return y !== undefined && x.length === y.length && x.every((v, i) => v === y[i]);
  });
}

export function pruneNotesConfig(
  config: NotesConfig,
  folders: string[],
  notes: { folder: string; relPath: string }[],
): NotesConfig {
  const live = new Set(folders);
  const namesByFolder = new Map<string, Set<string>>();
  for (const note of notes) {
    let names = namesByFolder.get(note.folder);
    if (!names) {
      names = new Set<string>();
      namesByFolder.set(note.folder, names);
    }
    names.add(pathBasename(note.relPath));
  }

  const expandedFolders = config.expandedFolders.filter((f) => live.has(f));
  const folderOrder: Record<string, string[]> = {};
  for (const [folder, names] of Object.entries(config.folderOrder)) {
    // The vault root always exists, so it is never in the index folder list.
    if (folder !== "" && !live.has(folder)) continue;
    const alive = namesByFolder.get(folder);
    const next = alive === undefined ? [] : names.filter((x) => alive.has(x));
    if (next.length > 0) folderOrder[folder] = next;
  }
  const selectedFolder =
    config.selectedFolder === "" || live.has(config.selectedFolder) ? config.selectedFolder : "";

  const changed =
    expandedFolders.length !== config.expandedFolders.length ||
    selectedFolder !== config.selectedFolder ||
    !sameFolderOrder(folderOrder, config.folderOrder);
  return changed ? { ...config, expandedFolders, folderOrder, selectedFolder } : config;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm test src/modules/notes/lib/notesConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the identity guard and the action in `useNotesState`**

In `src/modules/notes/lib/useNotesState.ts`, add `pruneNotesConfig` to the import from `./notesConfig`, and change `update` (lines 95-104) so an unchanged config costs no write:

```ts
  const update = useCallback(
    (fn: (c: NotesConfig) => NotesConfig) => {
      setConfig((prev) => {
        const next = fn(prev);
        if (next === prev) return prev;
        scheduleWrite(next);
        return next;
      });
    },
    [scheduleWrite],
  );
```

Add the action next to the others:

```ts
  const pruneAgainstIndex = useCallback(
    (folders: string[], notes: { folder: string; relPath: string }[]) =>
      update((c) => pruneNotesConfig(c, folders, notes)),
    [update],
  );
```

and add `pruneAgainstIndex` to the returned object.

- [ ] **Step 6: Run the pruning on every complete index result**

In `src/modules/notes/NotesView.tsx`, add this effect right after the existing reset effect (after line 57):

```tsx
  useEffect(() => {
    // A failed, in-flight, or capped walk reports a partial folder set. Pruning
    // against one of those would delete live state.
    if (index.loading || index.error !== null || index.truncated) return;
    state.pruneAgainstIndex(index.folders, index.notes);
  }, [
    index.loading,
    index.error,
    index.truncated,
    index.folders,
    index.notes,
    state.pruneAgainstIndex,
  ]);
```

- [ ] **Step 7: Verify**

Run: `pnpm check-types && pnpm lint && pnpm test`
Expected: all pass. If biome complains about the dependency array, keep the listed dependencies and add the `// biome-ignore lint/correctness/useExhaustiveDependencies:` line explaining that the effect reads only its dependencies, following the pattern already at line 46 of the same file.

- [ ] **Step 8: Commit**

```bash
git add src/modules/notes
git commit -m "feat(notes): prune dead folders and note names from kex.json"
```

---

### Task 7: The tree root row is the vault root, and counts are direct

`filterByFolder` already stopped being recursive in task 3, so the row labelled "All notes" now shows only the notes sitting directly in the root. This makes the row tell the truth: it takes the vault folder's own name and a direct count, and the recursive counter is replaced everywhere.

**Files:**
- Modify: `src/modules/notes/lib/folderTree.ts` (delete `countNotesPerFolder`, lines 24-35)
- Test: `src/modules/notes/lib/folderTree.test.ts` (delete its describe, lines 19-31)
- Modify: `src/modules/notes/CollectionsColumn.tsx` (props, root row, counts)
- Modify: `src/modules/notes/NotesView.tsx` (compute `counts` and `rootLabel`, pass them down)

**Interfaces:**
- Consumes: `countDirectNotes` (task 2), `pathBasename` (task 1).
- Produces: `CollectionsColumn` props `counts: Map<string, number>` and `rootLabel: string`, replacing the `notes: NoteListItem[]` prop. Task 8 reuses the same `counts` map for the folder rows in the list.

- [ ] **Step 1: Delete the recursive counter and its test**

Remove `countNotesPerFolder` from `src/modules/notes/lib/folderTree.ts` (lines 24-35) and its `describe` block from `src/modules/notes/lib/folderTree.test.ts` (lines 19-31), including the name in the import.

- [ ] **Step 2: Run the tests and verify the module still passes**

Run: `pnpm test src/modules/notes/lib/folderTree.test.ts`
Expected: PASS with the `buildFolderTree`, `childFolders`, `countDirectNotes` and `nextFolderName` describes.

- [ ] **Step 3: Move the counting up into `NotesView`**

In `src/modules/notes/NotesView.tsx`, add `import { childFolders, countDirectNotes, nextFolderName } from "./lib/folderTree";` (replacing the existing `nextFolderName` import; `childFolders` is used in task 8) and add next to the other memos:

```tsx
  const counts = useMemo(() => countDirectNotes(index.notes), [index.notes]);
  const rootLabel = useMemo(() => pathBasename(canonRoot) || canonRoot, [canonRoot]);
```

Replace the `notes={index.notes}` prop on `CollectionsColumn` with:

```tsx
            counts={counts}
            rootLabel={rootLabel}
```

- [ ] **Step 4: Consume them in `CollectionsColumn`**

In `src/modules/notes/CollectionsColumn.tsx`, replace `notes: NoteListItem[];` in `CollectionsColumnProps` with:

```ts
  counts: Map<string, number>;
  rootLabel: string;
```

Delete the local `counts` memo (line 252) and use `props.counts` in `folderRowShared`. Remove the now-unused `countNotesPerFolder` import and, if `NoteListItem` is no longer referenced, its type import too (`notesByRelPath` still uses it, so check before removing).

Replace the root row's icon, label and count (lines 332-341):

```tsx
              <HugeiconsIcon
                icon={Folder01Icon}
                size={12}
                strokeWidth={1.85}
                className="shrink-0"
              />
              <span className="min-w-0 flex-1 truncate">{props.rootLabel}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {props.counts.get("") ?? 0}
              </span>
```

- [ ] **Step 5: Verify**

Run: `pnpm check-types && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/modules/notes
git commit -m "feat(notes): make the tree root the vault folder and count direct notes"
```

---

### Task 8: Folder rows at the top of the note list

The last piece of the navigation model: the subfolders of the selected folder render as rows above the notes, so drilling down does not require going back to the tree. They are always alphabetical, never draggable, and sit outside the date groups. They carry no context menu, deliberately: inline folder rename is keyed by path alone, so a folder with a row in both the tree and the list would open two inputs and the second commit would fail against a path that no longer exists.

**Files:**
- Modify: `src/modules/notes/NoteListColumn.tsx` (new local `FolderListRow`, two new props, render block, empty state)
- Modify: `src/modules/notes/NotesView.tsx` (build `folderRows`, pass it and `onSelectFolder`)

**Interfaces:**
- Consumes: `childFolders` and `countDirectNotes` (task 2), `pathBasename` (task 1), `setSelectedFolder` with ancestor expansion (task 5).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add the two props and the row component**

In `src/modules/notes/NoteListColumn.tsx`, add to `NoteListColumnProps`:

```ts
  folderRows: { relPath: string; name: string; count: number }[];
  onSelectFolder: (relPath: string) => void;
```

Add `Folder01Icon` to the `@hugeicons/core-free-icons` import and this component above `NoteListColumn`:

```tsx
function FolderListRow(props: {
  relPath: string;
  name: string;
  count: number;
  onSelect: (relPath: string) => void;
}) {
  return (
    <div
      className="flex h-7 cursor-pointer items-center gap-1.5 rounded px-2 text-[12.5px] text-foreground hover:bg-accent"
      onClick={() => props.onSelect(props.relPath)}
      title={props.relPath}
    >
      <HugeiconsIcon icon={Folder01Icon} size={12} strokeWidth={1.85} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{props.name}</span>
      <span className="shrink-0 text-[10.5px] text-muted-foreground">{props.count}</span>
    </div>
  );
}
```

- [ ] **Step 2: Render the rows above the notes**

Replace the body of the scroll container in `NoteListColumn` (the ternary chain at lines 183-225) so the folder block renders before the note branches and the empty state accounts for it:

```tsx
        {props.error ? (
          <div className="flex flex-col items-start gap-2 p-2 text-[12px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <HugeiconsIcon icon={AlertCircleIcon} size={13} strokeWidth={1.85} />
              Could not list notes: {props.error}
            </span>
            <button
              type="button"
              onClick={props.onRetry}
              className="rounded border border-border px-2 py-0.5 text-[11px] text-foreground hover:bg-accent"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {props.folderRows.length > 0 && (
              <div className="mb-1 border-b border-border/60 pb-1">
                {props.folderRows.map((f) => (
                  <FolderListRow
                    key={f.relPath}
                    relPath={f.relPath}
                    name={f.name}
                    count={f.count}
                    onSelect={props.onSelectFolder}
                  />
                ))}
              </div>
            )}
            {sorted.length === 0 && props.folderRows.length === 0 && !props.loading ? (
              <div className="p-2 text-[12px] text-muted-foreground">
                No notes here. Create one with the + button.
              </div>
            ) : config.sortMode === "custom" ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sorted.map((n) => n.relPath)}
                  strategy={verticalListSortingStrategy}
                >
                  {sorted.map(renderRow)}
                </SortableContext>
              </DndContext>
            ) : groups ? (
              groups.map((g) => (
                <div key={g.bucket}>
                  <div className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.bucket}
                  </div>
                  {g.notes.map(renderRow)}
                </div>
              ))
            ) : (
              sorted.map(renderRow)
            )}
          </>
        )}
```

- [ ] **Step 3: Build the rows in `NotesView`**

In `src/modules/notes/NotesView.tsx`, add after the `counts` memo from task 7:

```tsx
  const folderRows = useMemo(
    () =>
      childFolders(index.folders, state.config.selectedFolder).map((relPath) => ({
        relPath,
        name: pathBasename(relPath),
        count: counts.get(relPath) ?? 0,
      })),
    [index.folders, state.config.selectedFolder, counts],
  );
```

and pass the two new props to `NoteListColumn`:

```tsx
            folderRows={folderRows}
            onSelectFolder={state.setSelectedFolder}
```

- [ ] **Step 4: Verify**

Run: `pnpm check-types && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 5: Manual check in the app**

Run: `pnpm tauri dev`

Walk through, in this order, in a workspace that has a `workspaceRoot`:

1. The folder tree opens fully collapsed. Expand `docs`, quit the app, reopen: only `docs` is expanded.
2. Select `docs`. The list shows `docs`'s subfolders on top with their direct counts, then only the notes directly in `docs`. Click a subfolder row: the list moves into it and the tree expands to reveal it, selected.
3. Select the root row: it carries the workspace folder name and shows only the root-level notes plus the top-level folders.
4. Set the sort to Custom, drag two notes in `docs`, then move to another folder and back. The order held. Check `kex.json`: `folderOrder` has an entry for `docs` with file names only.
5. Switch the sort to Modified and back to Custom. The `docs` order is still there.
6. With the app closed, delete a folder that had an entry and was expanded. Reopen, open the notes tab: the entry and the expansion are gone from `kex.json`, and if that folder was selected the list is back on the root.
7. Turn on date grouping with a folder that has both subfolders and notes: the folder rows sit above the first date header.

- [ ] **Step 6: Commit**

```bash
git add src/modules/notes
git commit -m "feat(notes): show subfolder rows above the notes in the list"
```

---

### Task 9: Documentation and pending work

**Files:**
- Modify: `docs/FORK.md:390`
- Modify: `docs/PENDING.md` (the IMP-NOTES-01 and IMP-NOTES-07 lines)
- Delete: `docs/pending/improvements/IMP-NOTES-01-duplicado-basename.md`
- Modify: `docs/pending/improvements/IMP-NOTES-07-verificacion-manual-pendiente.md`
- Modify: `docs/pending/bugs/BUG-52-notes-hygiene-varios.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Update the fork divergence list**

In `docs/FORK.md`, line 390, replace the field list so it names the current shape:

```
- **Config persistence** — all view state (`quickAccess`, `sortMode`, `folderOrder`, `expandedFolders`, `groupByDate`, `selectedFolder`) lives in `kex.json` at the workspace root under the `notes` namespace (vault-relative forward-slash paths). `folderOrder` maps a folder path to the ordered file names inside it, and the folder tree is collapsed unless a folder is listed in `expandedFolders`. Dead folders and dead file names are pruned on every complete vault walk. Read-modify-write strategy preserves foreign namespaces; invalid or missing `kex.json` falls back to defaults without overwriting until the first mutation.
```

The `**Field** — text` prefix is copied verbatim from the line already in the file, so this edit introduces no new em-dash: do not add one anywhere else, and do not reflow the neighbouring bullets.

Also update the "Two-column layout" bullet just above it so it says the note list shows one folder at a time, with subfolder rows on top.

- [ ] **Step 2: Retire IMP-NOTES-01**

Delete `docs/pending/improvements/IMP-NOTES-01-duplicado-basename.md` and its line in `docs/PENDING.md`. Task 1 removed the three notes copies. The remaining `basename` in `src/modules/workspaces/lib/tabTitle.tsx` differs on purpose (it filters empty segments), so there is nothing left to unify.

- [ ] **Step 3: Narrow item 2 of IMP-NOTES-07**

In `docs/pending/improvements/IMP-NOTES-07-verificacion-manual-pendiente.md`, replace the whole "### 2. Orden personalizado con una carpeta filtrada" section with a one-paragraph note saying the scenario no longer exists: `mergeNoteOrder` was deleted when custom order became per-folder, so there is no shared map for a filtered drag to damage. Renumber the sections that follow.

- [ ] **Step 4: Narrow item 4 of BUG-52**

In `docs/pending/bugs/BUG-52-notes-hygiene-varios.md`, rewrite item 4 so it covers only `quickAccess`: state that `expandedFolders`, `folderOrder` and `selectedFolder` are now pruned on every complete walk by `pruneNotesConfig`, and that `quickAccess` is deliberately left alone because pinning is explicit user intent and the greyed row is the signal. Keep the note that opening a ghost pin raises a read error, which is the part still worth fixing.

- [ ] **Step 5: Final full verification**

Run: `pnpm lint && pnpm check-types && pnpm test`
Expected: all pass. No Rust file changed in this plan, so the cargo checks are unaffected.

- [ ] **Step 6: Commit**

```bash
git add docs
git commit -m "docs: record the folder-scoped notes list and retire the resolved pending items"
```
