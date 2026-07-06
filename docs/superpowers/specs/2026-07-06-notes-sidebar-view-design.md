# Notes Sidebar View Design

**Feature:** HelixNotes-style notes view as a new Sidebar tab after Git
**Date:** 2026-07-06
**Reference app:** HelixNotes (`/Users/avilches/Work/Proy/Repos/HelixNotes`, Svelte 5 + Tauri 2)

---

## Problem

Kex has no notes-oriented way to browse the markdown files of a workspace. HelixNotes offers a
proven model: a quick-access list, a folder tree, and a sortable note list with title, preview and
date. The goal is to bring that model into Kex as an optional Sidebar view that activates when a
workspace has a `workspaceRoot` defined, treating the workspace root as the note vault.

This is plan A of two independent plans. Plan B (rich markdown editor, see
`2026-07-06-rich-markdown-editor-design.md`) upgrades what happens after a note is opened; this
plan works with the existing `markdown` tab kind and does not depend on plan B.

---

## Scope

In scope (v1, mirrors the HelixNotes features the view needs):

- New Sidebar view `notes`, listed after `git` in the tab strip.
- Two internal columns:
  - Column 1: Quick Access section on top (pinned notes, drag to reorder), folder tree below
    (collapsible, note counts).
  - Column 2: sortable note list (title, preview snippet, relative date), with sort modes
    `modified | title | created | custom` and drag-to-reorder in `custom` mode, plus optional
    date grouping headers (Today, This Week, ...) when sorting by date.
- Open a note in a center tab (existing `kind: "markdown"`); single click opens as preview tab,
  double click pins, same convention as the explorer.
- Note actions: new note, rename, delete, add/remove Quick Access, reveal in explorer.
- Folder actions: new folder, rename, delete, collapse/expand.
- Persistence of all notes UI state in `kex.json` at the workspace root.

Out of scope (documented as possible future phases, all exist in HelixNotes):

- Trash (soft delete), per-note version history, daily notes, tasks view, tags, full-text search
  (tantivy), knowledge graph, WebDAV sync, backups, AI. Kex is a no-AI fork; AI is permanently
  out. Delete uses `fs_delete` directly (no trash) in v1.

---

## Decisions (chosen vs alternatives)

1. **Tab visibility**: the `notes` tab renders in the Sidebar tab strip only when the active
   workspace has `workspaceRoot` set. Alternative considered: always show the tab with an empty
   state prompting to define a root. Chosen: hidden, per the literal requirement ("cuando se
   define un workspace root, haya una pestana nueva"). If the persisted view is `notes` and the
   workspace has no root, `parseView`/render falls back to `explorer`.
2. **Vault root**: the whole `workspaceRoot` is the vault. Every `.md`/`.markdown`/`.mdx` under it
   (with heavy-dir pruning: `node_modules`, `.git`, `target`, `dist`, ...) is a note; every
   directory containing at least one note (or any directory, see 2a) is a folder. Alternative:
   a dedicated `notes/` subfolder. Chosen: whole root, matching Helix where the vault is the
   entire tree, and matching the use case of browsing a repo's docs as notes.
   2a. The folder tree shows all non-pruned directories, not only those with notes, so the user
   can create a note anywhere. Plain alphabetical order; the count badge shows 0 for empty dirs.
3. **Note metadata is non-invasive**: unlike Helix (which writes YAML frontmatter with
   `id/title/tags/pinned` into each note), Kex never modifies user `.md` files to store metadata.
   - Title resolution: frontmatter `title:` if present, else first `# H1`, else file name without
     extension (same fallback chain as Helix reading).
   - Pinned/favorite state lives in `kex.json` (`quickAccess`), not in frontmatter.
   - `created` comes from filesystem btime when available, falling back to mtime (Linux without
     statx btime). Helix reads `created` from frontmatter; we do not require it, but if a
     frontmatter `created:` exists it wins.
4. **Persistence in `kex.json` at the workspace root** (explicit requirement). Single JSON file,
   namespaced so future features can share it:

   ```json
   {
     "notes": {
       "quickAccess": ["docs/TODO.md", "docs/pending/bugs/foo.md"],
       "sortMode": "modified",
       "noteOrder": { "docs/TODO.md": 0, "README.md": 1 },
       "collapsedFolders": ["docs/pending"],
       "groupByDate": true,
       "selectedFolder": "docs"
     }
   }
   ```

   - All paths are vault-relative, forward-slash, canonical.
   - Read with `fs_read_file`, written atomically with `fs_write_file` (debounced 300ms), same
     workspace-auth gating as every fs command.
   - Unknown keys are preserved on write (read-modify-write of the parsed object) so other
     namespaces are never clobbered.
   - No backward compatibility machinery, per project policy: invalid or missing file means
     defaults.
   - External edits to `kex.json` are picked up when the Notes view (re)loads for a workspace;
     live watching of `kex.json` itself is not in v1.
   - The file is user-visible in their repo; whether to gitignore it is the user's call (mirrors
     `.vscode/settings.json` semantics). Kex does not touch `.gitignore`.
5. **Note list data via one Rust command**: new `notes_list(root, workspace)` walks the vault once
   (crate `ignore`, same pruning and `MAX_SCANNED`-style cap as `fs_search`) and returns
   `{ path, relPath, title, mtime, created, snippet, folder }` per note, reading only the head of
   each file (~2KB) for frontmatter title / H1 / snippet. Alternative: N x `fs_read_file` from the
   frontend (rejected: IPC round-trips) or reusing `fs_read_dir` (no titles/snippets).
6. **Note view opens as a center Tab**, not embedded in the Sidebar. The requirement mentions
   "las notas ordenables con su vista"; in Helix the third panel is the editor. Kex's equivalent
   of that third panel is the tab area, so clicking a note opens `{ kind: "markdown", path }` via
   the existing `openFileInTab` path. Alternative rejected: embedding a preview inside the Sidebar
   (too narrow, duplicates the tab system).
7. **Module placement**: new `src/modules/notes/` module (barrel `index.ts`), lazy-loaded from
   `Sidebar.tsx` like the other views. State hook `useNotes` inside `modules/notes/lib/`.
8. **Sort mode `custom`**: drag-to-reorder rows with dnd-kit (already a dependency, used by
   WorkspaceBar). Order persisted as `noteOrder` map (relPath to index) in `kex.json`; notes
   missing from the map sort after the mapped ones, by mtime desc (Helix behavior).
9. **Quick Access reorder**: dnd-kit as well; persisted as the array order of `quickAccess`.
   Renaming or deleting a note updates `quickAccess` and `noteOrder` entries pointing at the old
   relPath (no dangling paths).
10. **Refresh**: subscribe to the existing `fs_watch` on the vault root (the explorer already
    watches; the notes view listens to the same `fs:changed` event) and re-run `notes_list`
    debounced. Editing a note in a Kex tab also triggers refresh via `fs:file-written`.

---

## UI layout

```
+ Sidebar (view = notes) ------------------------------------+
| [Explorer] [Git] [Notes]            <- existing tab strip  |
| +---------------------+-----------------------------------+|
| | QUICK ACCESS        | [Sort v] [Group v] [+ New note]   ||
| |  * TODO.md          |                                   ||
| |  * bugs/foo.md      | Today                             ||
| |  (drag to reorder)  |  > Nota A        12:40            ||
| |---------------------|    snippet text...                ||
| | FOLDERS             |  > Nota B        09:15            ||
| |  v docs             |    snippet text...                ||
| |    > pending        | This Week                         ||
| |  > src              |  > Nota C        Mon               ||
| |  (root)             |    ...                            ||
| +---------------------+-----------------------------------+|
+------------------------------------------------------------+
```

- The two columns are split with `react-resizable-panels` (same primitive as the Sidebar/pane
  dividers), with a sensible min size per column.
- Column 1 top: "Quick Access" header + rows (icon, title). Empty state: hint text "Pin notes
  here from the note list context menu".
- Column 1 bottom: folder tree. Selecting a folder filters column 2 to notes directly under it
  plus its subtree (Helix lists the notebook subtree). A "(root)" entry (label "All notes")
  shows every note in the vault and is the default selection.
- Column 2 header: sort dropdown (`Modified | Title | Created | Custom`), group-by-date toggle
  (only meaningful for date sorts), new-note button. Small inline buttons follow the
  `ActionButton` convention from `ShortcutsSection.tsx`.
- Note row: title (resolved), snippet (muted, 1 line), relative date. Context menu: Open,
  Open to the side (split), Pin/Unpin from Quick Access, Rename, Delete, Reveal in Explorer.
- All icons hugeicons; no emojis.

---

## Data flow

```
App.tsx
  activeWorkspace.workspaceRoot ---> Sidebar (notesRoot prop, null when undefined)
                                        |
                                        v
                              NotesView (lazy, mounted like other views)
                                 |            |
                        useNotesState        useNotesIndex
                        (kex.json IO)        (notes_list + fs watch refresh)
                                 |            |
                        CollectionsColumn   NoteListColumn
                        (QuickAccess +      (sort/group/drag, open note)
                         FolderTree)              |
                                                  v
                                        onOpenFile(path, pin) -> openFileInTab (existing)
```

- `useNotesState(root)`: loads `kex.json` on mount / root change, exposes state + mutators
  (`toggleQuickAccess`, `reorderQuickAccess`, `setSortMode`, `setNoteOrder`,
  `toggleFolderCollapsed`, `setSelectedFolder`, `setGroupByDate`), each mutator writes through
  (debounced) with read-modify-write preserving foreign namespaces. Functional core
  (`notesConfig.ts`: parse/serialize/update helpers, pure) + thin hook shell.
- `useNotesIndex(root)`: calls `notes_list`, holds `NoteListItem[]`, refreshes on `fs:changed`
  under root and on `fs:file-written`, debounced 300ms. Sorting/grouping/filter-by-folder are
  pure functions in `noteSort.ts` (unit-testable).
- The view renders only when visible (`view === "notes"`), but stays mounted like the other
  Sidebar views. First data load is deferred until the first time the view becomes visible
  (zero cost if never opened).

---

## Rust backend

New file `src-tauri/src/modules/fs/notes.rs`:

```rust
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteListItem {
    pub path: String,      // canonical, forward-slash
    pub rel_path: String,  // vault-relative, forward-slash
    pub title: String,     // frontmatter title | first H1 | file stem
    pub mtime: u64,        // ms epoch
    pub created: u64,      // btime when available, else frontmatter created, else mtime
    pub snippet: String,   // first non-empty, non-heading body line, trimmed to 120 chars
    pub folder: String,    // vault-relative dir ("" for root)
}

#[tauri::command]
pub async fn notes_list(root: String, workspace: Option<WorkspaceEnv>)
    -> Result<Vec<NoteListItem>, String>
```

- Walk with the `ignore` crate honoring `.gitignore`, prune the same dir set as `search.rs`,
  cap scanned files (reuse the `MAX_SCANNED` approach), filter `md|markdown|mdx` extensions.
- Read only the first ~2KB per note; parse optional YAML frontmatter (`title:`, `created:`)
  with a minimal hand parser (no new crate; gray_matter is not needed for two scalar keys).
  Robust against empty files, binary content, frontmatter-only files.
- Gate through the workspace authorization registry exactly like `fs_read_dir` / `fs_search`.
- Register in `lib.rs` `invoke_handler`; document in `docs/IPC.md`.

Everything else reuses existing commands: `fs_create_file` (new note), `fs_create_dir` (new
folder), `fs_rename`, `fs_delete`, `fs_read_file`/`fs_write_file` (kex.json), `fs_watch`.

New note naming: `Untitled.md`, then `Untitled 2.md`, ... in the selected folder (Helix
behavior), created with empty content (no frontmatter injected), opened pinned, with inline
rename primed on the new row (same inline-rename pattern as the explorer).

---

## Sidebar integration

- `sidebarState.ts`: `SidebarView` gains `"notes"`; fix `parseView` to accept
  `"git" | "history" | "notes"` (it currently drops `history` too, a latent bug).
- `Sidebar.tsx`: `VIEWS` becomes a function of `notesEnabled` (workspaceRoot defined) or filters
  at render: `[explorer, git, ...(notesEnabled ? [notes] : [])]`. Content block follows the
  existing always-mounted + `invisible pointer-events-none` pattern. If `view === "notes"` and
  notes becomes unavailable (root removed), fall back to `explorer`.
- Shortcut: new `sidebar.showNotes` entry in `SHORTCUTS` (group Sidebar, default binding chosen
  next to `sidebar.showGit`), handler in App.tsx like the other `sidebar.show*` ids. No-op when
  the workspace has no root.

---

## Error handling

- `workspaceRoot` deleted on disk / unauthorized: `notes_list` returns an error; the view shows
  an inline error state with a retry button, never crashes.
- `kex.json` invalid JSON: log once, treat as defaults, do not overwrite until the first user
  mutation (then write the valid structure; the broken content is the user's to fix, but a
  mutation legitimately replaces it).
- Rename/delete races (file gone between list and action): surface the fs error as a toast,
  refresh the index.
- Large vaults: capped scan + `truncated` semantics; if the cap hits, show "showing first N
  notes" hint.

---

## Testing

- Rust: unit tests for `notes_list` against a temp vault (title chain frontmatter/H1/stem,
  snippet edge cases, pruning, mtime order, cap). Locks a core-subsystem invariant per
  AGENTS.md.
- Frontend (vitest): pure function tests for `noteSort.ts` (all four sort modes, custom order
  with unmapped notes, date grouping buckets) and `notesConfig.ts` (parse defaults on invalid
  JSON, read-modify-write preserves foreign keys, rename/delete path fixups in
  quickAccess/noteOrder).
- Manual checklist in the plan (open/pin/reorder/rename/delete, cross-workspace switch, no-root
  workspace hides the tab).

---

## Documentation updates (same commit as code)

- `docs/ARCHITECTURE.md`: new `notes/` module, kex.json model.
- `docs/IPC.md`: `notes_list`.
- `docs/FORK.md`: feature added relative to upstream.
- `AGENTS.md`: module layout entry.
- `CLAUDE.md` glossary: new canonical terms (NotesView, Quick Access, kex.json).
- `docs/NOTES_AND_BOOKMARKS_PLAN.md`: mark its notes phases as superseded by this spec (file kept).
