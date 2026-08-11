# Notes Folder Scoping Design

**Feature:** folder-scoped note list, collapsed-by-default tree, per-folder custom order, and
automatic cleanup of dead paths in `kex.json`
**Date:** 2026-08-11
**Supersedes parts of:** `2026-07-06-notes-sidebar-view-design.md` (decisions 6, 8 and the
`kex.json` shape in decision 4)

---

## Problem

The notes view shipped with three behaviours that do not scale past a small vault:

1. The folder tree starts fully expanded. In a repo with `docs/pending/bugs`,
   `docs/superpowers/specs` and similar nesting, the first thing the user sees is dozens of rows.
   `kex.json` stores `collapsedFolders`, so the persisted set grows with every folder the user
   closes and the default is the noisiest possible state.
2. Selecting a folder filters the note list recursively (`filterByFolder` keeps
   `n.folder === folder || n.folder.startsWith(folder + "/")`). Clicking `docs` shows every note
   in the whole subtree, so the folder tree cannot be used to narrow down to one folder's notes.
3. Custom order is a single flat map for the entire vault (`noteOrder: Record<relPath, number>`).
   Because a reorder can happen while a recursive folder filter is active, `mergeNoteOrder` has to
   carefully preserve the indices of every note outside the filter. That machinery exists only to
   protect a global order that the user never asked for.

There is also a data-hygiene problem the user raised directly: nothing prunes paths that stopped
existing. `renamePathInConfig` and `deletePathInConfig` only run for renames and deletes performed
inside Kex. Delete a folder from Finder with Kex closed and its entry stays in `kex.json` forever;
a `selectedFolder` pointing at a missing folder leaves the list permanently empty with no
explanation. This is item 4 of [BUG-52](../../pending/bugs/BUG-52-notes-hygiene-varios.md).

---

## Scope

In scope:

- Folder tree collapsed by default; `kex.json` persists the expanded set instead of the collapsed
  set.
- Note list filtered to exactly one folder, non-recursively.
- The root row of the tree becomes the vault root folder (non-recursive), not a flat all-notes
  view.
- Immediate subfolders of the selected folder render as rows at the top of the note list, above
  the notes.
- Custom order becomes a per-folder ordered list of file names in `kex.json`.
- Folder note counts become direct counts instead of recursive subtree totals.
- Automatic pruning of dead folder paths and dead note names from `kex.json`.

Out of scope:

- Pruning `quickAccess`. Pinning is explicit user intent and the greyed-out row is the signal that
  the file is gone. Item 4 of BUG-52 stays open, narrowed to `quickAccess`.
- Context menu on the folder rows of the note list (see Decisions, 8).
- Drag and drop of notes into folder rows.
- Keyboard navigation of the new folder rows. That is
  [IMP-NOTES-04](../../pending/improvements/IMP-NOTES-04-navegacion-teclado.md) and it now has one
  more surface to cover.

---

## Decisions

### 1. `expandedFolders` replaces `collapsedFolders`

`NotesConfig.collapsedFolders: string[]` becomes `expandedFolders: string[]`, holding the folders
the user has opened. Everything not listed renders collapsed.

No migration code, no fallback read of the old key, per the project's no-backward-compatibility
policy. The first time the view opens after this change the tree is fully collapsed and the stale
`collapsedFolders` key is dropped on the next write.

Alternative considered: keep `collapsedFolders` and seed it with every folder on first load. That
requires the index to be resolved before the tree can render correctly, makes the default state
depend on a filesystem walk, and writes a large array to `kex.json` for what is a default.

### 2. `folderOrder` replaces `noteOrder`

```json
{
  "notes": {
    "quickAccess": [],
    "sortMode": "modified",
    "folderOrder": { "": ["README.md"], "docs": ["IPC.md", "TODO.md"] },
    "expandedFolders": ["docs"],
    "groupByDate": true,
    "selectedFolder": ""
  }
}
```

`folderOrder` maps a vault-relative folder path to the ordered file names inside it. The empty
string is the vault root, matching the existing `selectedFolder` convention.

Values are file names, not vault-relative paths, because the key already carries the prefix. Two
consequences: renaming a folder only rewrites keys, and the JSON stays readable by hand.

`sortMode` stays global, one value for the whole vault. When it is `custom`, each folder uses its
own list. Switching to another mode does not delete anything: the lists survive and come back when
the user returns to `custom`.

Notes in a folder that are absent from its list sort after the listed ones, by mtime descending.
That is the existing rule for unmapped notes and it is unchanged. A folder with no entry at all
therefore behaves as mtime descending, and the first drag creates its entry seeded with exactly
the order that was on screen.

A reorder rewrites only the entry of the folder being viewed, with its full visible order.
`mergeNoteOrder` is deleted along with its four tests: with a non-recursive filter there is no
longer any cross-folder state for a drag to damage.

Alternative considered: per-folder `sortMode` as a second map. Rejected as more persisted state to
keep pruned, and it turns "sort the whole vault by title" into a per-folder chore.

### 3. Ancestors of the selection are expanded

With everything collapsed by default, a persisted `selectedFolder` of `docs/pending` would show
the list of a folder whose row is not even visible in the tree.

`parseNotesConfig` adds the ancestors of `selectedFolder` to `expandedFolders`, and
`setSelectedFolder` does the same, which also covers drilling down from a folder row in the list.
The folder itself is not expanded: its children are already the rows at the top of the list.

The expansion happens at the moment of the action, not derived on every render. That is what keeps
"collapse `docs` while `docs/pending` is selected" working instead of snapping back open.

### 4. Automatic pruning

New pure function in `notesConfig.ts`:

```ts
pruneNotesConfig(
  config: NotesConfig,
  folders: string[],
  notes: { folder: string; relPath: string }[],
): NotesConfig
```

Rules:

- Drop from `expandedFolders` every path absent from `folders`.
- Drop every `folderOrder` key absent from `folders`. The `""` key is never dropped: the vault root
  always exists.
- Inside each surviving entry, drop file names that no longer exist in that folder. If the list
  ends up empty, drop the entry. This is what covers a folder that still exists but has lost all
  its notes.
- Reset `selectedFolder` to `""` when it names a folder absent from `folders`.
- Return the identical object reference when nothing changed.

Called from a `NotesView` effect on every index result, guarded on `!loading && !error &&
!truncated`. All three guards matter: an in-flight or failed `notes_list` reports zero folders, and
a walk that hit the 50,000-entry cap reports a partial set. Pruning against either would delete
live state.

`useNotesState.update` gains a matching guard: when the reducer returns the same reference it skips
`scheduleWrite`, so a no-op prune costs no `kex.json` write.

Accepted limitation, to be documented: the walker honours `.gitignore`, so a folder that still
exists on disk but has just been added to `.gitignore` is indistinguishable from a deleted one and
its state is pruned.

### 5. Non-recursive filtering

`filterByFolder` becomes an exact match on `n.folder === folder`. There is no longer a special case
for the empty string: the root folder filters to notes whose `folder` is `""`.

### 6. The root row is the vault root

The tree's first row stops meaning "all notes in the vault" and becomes the vault root folder,
non-recursive like any other. Its label is the base name of the workspace root, with a folder icon,
reading like the root of a file explorer. Its count is the notes directly in the root.

The flat all-vault view disappears. Nothing else replaces it in this iteration; full-text search
was already out of scope in the original notes spec.

### 7. Folder rows in the note list

The immediate subfolders of the selected folder render as rows at the top of the list, above the
notes, separated by a thin rule. They are always sorted alphabetically, case-insensitively, and
`sortMode` does not affect them. Each shows its direct note count. Clicking a row selects that
folder, which also expands its ancestors in the tree per decision 3.

Two new pure helpers in `folderTree.ts`:

- `childFolders(folders: string[], parent: string): string[]` returns immediate children only,
  sorted case-insensitively.
- `countDirectNotes(notes: { folder: string }[]): Map<string, number>` replaces
  `countNotesPerFolder`, which walked up the ancestor chain. A folder holding only subfolders now
  shows 0.

In `custom` mode the drag context wraps only the note rows. Folder rows are not sortable. With date
grouping on, the folder rows sit above the first bucket, outside every group. The "No notes here"
empty state renders only when there are neither folder rows nor note rows.

### 8. No context menu on the folder rows of the list

Deliberate omission. Inline folder rename is driven by a single `editingFolder` path in
`NotesView`. If the same folder had a row in both the tree and the list, both rows would render an
input, both would fire `commitRename` on blur, and the second call would fail against a path that
no longer exists and raise an error toast. The full menu stays on the tree row, one click away.

Making the rename work from both surfaces means moving the editing state to identify the surface as
well as the path. That is a larger change than this feature needs.

---

## Data flow

```
notes_list (Rust)
   |
   v
useNotesIndex  ->  { notes, folders, truncated, loading, error }
   |                        |
   |                        +-- NotesView effect: pruneNotesConfig, guarded
   |                                                    |
   v                                                    v
childFolders(folders, selectedFolder)          useNotesState.config (kex.json)
countDirectNotes(notes)                                 |
filterByFolder(notes, selectedFolder)                   |
   |                                                    |
   v                                                    v
CollectionsColumn (tree)                        NoteListColumn (folder rows + notes)
```

`sortNotes` changes signature from `(notes, mode, noteOrder: Record<string, number>)` to
`(notes, mode, order: string[] | undefined)`, where `order` is the entry for the folder currently
on screen. `NoteListColumn` already receives the whole `NotesConfig`, so it reads it as
`config.folderOrder[config.selectedFolder]` with no new prop.

Component props that do change:

- `NoteListColumn` gains `folderRows: { relPath: string; name: string; count: number }[]` and
  `onSelectFolder(relPath: string)`. `NotesView` builds `folderRows` from `childFolders` and
  `countDirectNotes`, since it is the one holding the index.
- `CollectionsColumn` gains `rootLabel: string`, the base name of the workspace root, for the row
  that used to say "All notes". `NotesView` already has `root` and derives it.
- `CollectionsColumn` swaps `collapsedFolders` for `expandedFolders` and
  `onToggleFolderCollapsed` for `onToggleFolderExpanded`. Its `FolderRow` inverts the chevron
  condition accordingly.

`useNotesState` action changes:

- `setNoteOrder(order: Record<string, number>)` becomes
  `setFolderOrder(folder: string, names: string[])`.
- `toggleFolderCollapsed` becomes `toggleFolderExpanded`, operating on `expandedFolders`.
- `setSelectedFolder` also unions the ancestors into `expandedFolders`.
- New `pruneAgainstIndex(folders, notes)` wrapping `pruneNotesConfig`.

`renamePathInConfig` and `deletePathInConfig` are rewritten for the new map shape. A note rename
replaces its file name inside its folder's list. A folder rename remaps the key and the keys of
every nested folder, leaving values untouched. A folder delete drops its key and every nested key.

---

## Error handling

- Invalid or unreadable `kex.json`: unchanged, `parseNotesConfig` returns defaults and nothing is
  written until the first user mutation.
- Wrong types inside `notes`: `folderOrder` entries whose value is not an array of strings are
  dropped, matching how `noteOrder` already drops non-finite numbers. `expandedFolders` must be an
  array of strings or it falls back to empty.
- `notes_list` failure: the existing error state and Retry button stay. Pruning is skipped, so a
  transient failure cannot damage the config.
- Truncated walk: pruning is skipped for as long as results keep arriving truncated, and resumes on
  the first complete walk. The existing "Showing the first N notes" footer already signals the state
  to the user.
- Two windows on the same vault: still last-writer-wins, unchanged, and still item 5 of BUG-52.

---

## Testing

Pure core, all in existing test files:

`notesConfig.test.ts`

- `parseNotesConfig` reads `expandedFolders` and `folderOrder`, rejects wrong types in both, and
  seeds the ancestors of `selectedFolder` into `expandedFolders`.
- `pruneNotesConfig` covers each rule: dead folder in `expandedFolders`, dead `folderOrder` key,
  the `""` key surviving, dead file name inside a live entry, an entry emptied to the point of
  removal, `selectedFolder` reset, and the identity case where nothing changes returns the same
  reference.
- `renamePathInConfig` and `deletePathInConfig` against `folderOrder`, for both a note and a folder
  subtree.

`noteSort.test.ts`

- `filterByFolder` is exact: a note in `docs/pending` does not appear under `docs`.
- `sortNotes` in `custom` mode with a folder list: listed names first in their order, the rest after
  by mtime descending.
- The four `mergeNoteOrder` tests are deleted with the function.

`folderTree.test.ts`

- `childFolders` returns immediate children only, not grandchildren, ordered case-insensitively,
  and handles the root parent.
- `countDirectNotes` counts only direct notes and yields 0 for a folder holding only subfolders.

Not covered by tests, and stated as such: the render order of folder rows above date buckets, and
the ancestor expansion firing on a click, both of which live in components.

---

## Documentation and pending work

- `docs/FORK.md` line 390 enumerates the `kex.json` notes fields; update `noteOrder` and
  `collapsedFolders` there.
- `docs/ARCHITECTURE.md` module map entry for `notes/` mentions the pure core files; no change of
  substance, verify it still reads true.
- Item 2 of
  [IMP-NOTES-07](../../pending/improvements/IMP-NOTES-07-verificacion-manual-pendiente.md) is a
  manual verification of `mergeNoteOrder` under a folder filter. The function is deleted, so that
  item is removed from PENDING in the same commit as the code.
- Item 4 of [BUG-52](../../pending/bugs/BUG-52-notes-hygiene-varios.md) is narrowed to
  `quickAccess`; rewrite its text to say `expandedFolders`, `folderOrder` and `selectedFolder` are
  now pruned automatically.
