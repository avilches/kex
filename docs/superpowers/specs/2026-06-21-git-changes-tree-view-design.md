# Git Changes: Tree View (IntelliJ-style) Design

## Goal

Let the user switch the Source Control changes panel between two renderings:

- **List** (current): flat file list grouped in the existing Staged Changes / Changes sections.
- **Tree**: a single global directory tree with the minimal necessary structure, like IntelliJ IDEA (single-child directory chains compacted).

The active mode is persisted in `settings.json` and toggled from an icon inside the Source Control panel toolbar.

## Non-goals

- No change to the underlying git data model or Tauri commands.
- No persistence of per-directory collapse state.
- No change to the List mode behavior (it stays exactly as today).

## 1. View mode and flag

New persisted preference, mirroring the `showHidden` pattern in `src/modules/settings/store.ts`:

- `scmViewMode: "list" | "tree"`, default `"list"`.
- Add to the `Preferences` type, a `KEY_SCM_VIEW_MODE` constant, default in `DEFAULT_PREFERENCES`, a getter in `loadPreferences()`, a `setScmViewMode()` setter, and an entry in `PREF_KEY_MAP`.
- Consumed via `usePreferencesStore((s) => s.scmViewMode)`.

A string union (not a boolean) leaves room for a future third mode; only two exist now.

**Toggle control:** a new `IconActionButton` in the panel top toolbar (next to fetch/pull/refresh). Its icon alternates between a list glyph and a tree glyph; tooltip reads "Group by directory" in list mode and "Show as list" in tree mode. Clicking calls `setScmViewMode`, which persists.

## 2. Functional core: tree building

A new pure module `src/modules/source-control/scmTree.ts`, with no React or Tauri dependencies, fully unit-testable.

**Input:** the combined `SourceControlEntry[]` (staged + unstaged together, since the tree is a single global tree). A file with both staged and unstaged changes (`MM`) arrives as two distinct entries (`+:path` and `-:path`) and is treated as two independent leaves, exactly as today.

**Output:** a tree of nodes:

- `DirNode { name, fullPath, children, fileCount }` where `name` may be a compacted segment chain (e.g. `src/modules/source-control`). `fileCount` is the number of descendant file leaves.
- `FileNode { entry }` (a leaf carrying the `SourceControlEntry`, including its `mode` and status).

**Rules:**

1. Group by the segments of `entry.path` (split on `/`; git paths already arrive normalized as forward-slash).
2. **Compact single-child chains:** if a directory contains exactly one subdirectory and no files, merge its name into the child (`a` + `b` -> `a/b`). Compaction stops as soon as there is branching (more than one child) or the level contains any file.
3. Files at the repository root hang directly off the root node, with no folder.
4. Ordering: directories before files, then alphabetical, case-insensitive, within each group.

A second pure function `flattenTree(tree, collapsedSet)` produces the flat row array with a `depth` field for the virtualizer (same shape as the explorer's `buildRows`), skipping children of collapsed directories.

**Tests** (lock the invariants):

- Compaction merges single-child chains correctly.
- Branching (two children) breaks the merge.
- A directory containing both a subdirectory and a file does not compact.
- Root-level files attach to the root with no folder.
- An `MM` file yields two independent leaves under the same directory.
- Ordering: directories first, then case-insensitive alphabetical.
- `flattenTree` honors the collapsed set and emits correct `depth`.

## 3. Render, actions, navigation

In `SourceControlPanel`, the `rows` memo branches on `scmViewMode`:

- `"list"`: exactly as today (Staged / Changes sections with their headers). Unchanged.
- `"tree"`: rows produced by `flattenTree`. Two new `RowDescriptor` kinds: `tree-dir` and `tree-file`. The virtualizer and keyboard/selection logic keep operating over the flat array, as now.

**Rows:**

- `tree-dir`: collapse/expand chevron + folder icon + name (possibly compacted) + descendant file count on the right. Clicking the row toggles collapse. Indented by `depth`.
- `tree-file`: reuses the current row visuals (file icon, name, colored status code, hover stage/unstage/discard actions per file), indented by `depth`, but **without** the directory breadcrumb (the tree now conveys hierarchy).

**Collapse state:** a `useState<Set<string>>` of collapsed `fullPath`s, in memory, empty by default (everything expanded). Resets on panel reload. Not persisted.

**Bulk actions (top toolbar, visible only in tree mode):** Stage all / Unstage all / Discard all as `IconActionButton`s operating on the whole repo, reusing the existing `onStageAll` / `onUnstageAll` / `onDiscardAll` handlers. Not added in list mode (they remain in the section headers, no duplication).

**Per-folder actions (hover on `tree-dir`):** Stage / Unstage / Discard every file under that folder. Implemented by filtering entries whose `path` descends from the node's `fullPath` and calling the existing per-file operations in batch. These are part of the deliverable but secondary: if during implementation they add disproportionate risk, they may move to a follow-up commit.

**Keyboard navigation:** up/down traverse rows (folders included); on a `tree-dir`, Enter or arrow toggles collapse; on a `tree-file`, Enter opens the diff (current behavior). This lives in the panel's local handler, not the shortcuts registry.

## Documentation

Update `docs/ARCHITECTURE.md` (source-control module entry) to mention the tree view mode in the same commit as the code.

## File touch list

- `src/modules/settings/store.ts` — new `scmViewMode` preference plumbing.
- `src/modules/source-control/scmTree.ts` — new pure tree builder + flatten (with tests alongside).
- `src/modules/source-control/SourceControlPanel.tsx` — toggle button, branched `rows` memo, `tree-dir` / `tree-file` rows, collapse state, toolbar bulk actions, keyboard handling.
- `src/modules/source-control/useSourceControlPanel.ts` — expose the combined entry list if not already convenient for the tree builder.
- `docs/ARCHITECTURE.md` — note the tree mode.
