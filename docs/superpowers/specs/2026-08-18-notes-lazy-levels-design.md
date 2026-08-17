# Notes Lazy Levels Design

**Feature:** replace the recursive vault index with per-level reads on demand, so the notes view
costs what you look at instead of what the vault contains
**Date:** 2026-08-18
**Supersedes:** the `notes_list` command and the whole-vault index introduced in
`2026-07-06-notes-sidebar-view-design.md`. Builds on
`2026-08-11-notes-folder-scoping-design.md`, whose persisted state and folder-scoped list stay
exactly as they are.

---

## Problem

`notes_list` walks the entire vault on every load. For each directory it emits a folder entry, and
for each markdown file it opens the file and reads the first 2 KB to extract the title, the snippet
and the frontmatter `created` date. The walk stops at 50,000 scanned entries and reports
`truncated`.

That model breaks as soon as the vault is not a project. Pointing a workspace at a home directory
makes the walk spend its whole budget inside the first large directory it enters and stop, so the
folder tree shows an arbitrary handful of folders and the note list shows the scan-cap notice. The
cost is also structural rather than incidental: the expensive part is opening every markdown file
in the vault, and nothing in the view needs more than one folder's worth of that data at a time.

The recursion is not needed for what the view actually shows. The folder tree renders one level at
a time, the note list is already scoped to exactly one folder, and the counters count the notes
directly inside a folder. Three things did lean on the full index, and each has a cheaper answer:

- Quick Access titles, which can be read for the pinned paths alone.
- The automatic pruning of `kex.json`, which only needs to know whether the paths already recorded
  there still exist. That is an existence check over a handful of paths, not a walk.
- The chevron and the counter of a collapsed folder, which need a shallow listing of that folder,
  not a recursive one.

There is also a latent bug this replaces. The filesystem watcher
(`src-tauri/src/modules/fs/watch.rs`) is **not recursive**: it watches an explicit list of
directories registered from the frontend through `fs_watch_add`. Only the explorer
(`src/modules/explorer/lib/useFileTree.ts`) and the editor's file sync register anything. The notes
view listens for `fs:changed` without ever registering a directory, so today it learns about an
external change only when the explorer happens to have that same directory open. Reading per level
gives the view the exact list of directories it should register.

---

## Scope

In scope:

- Three new Tauri commands that read one directory level at a time.
- `useNotesIndex` becomes a per-folder cache with explicit watcher registration.
- The folder tree renders from that cache instead of from a flat list of every folder.
- Pruning becomes an existence check over the paths recorded in `kex.json`.
- Quick Access titles are resolved for the pinned paths alone.
- `notes_list`, the 50,000 entry cap, the `truncated` flag and its footer are deleted.

Out of scope:

- Any change to the `kex.json` shape. All six fields under the `notes` namespace keep their
  meaning: `quickAccess`, `sortMode`, `folderOrder`, `expandedFolders`, `groupByDate`,
  `selectedFolder`.
- Any change to sorting, per-folder custom order, date grouping, or the collapsed-by-default tree.
- Subfolder rows inside the note list. They were built and then removed by explicit decision: the
  tree is the only way to navigate folders, and the note list holds notes only.
- A vault-wide view of every note, and any feature that would need a full index (full-text search,
  tags, backlinks). Wiki-link autocomplete already avoids the index: it uses one `fs_glob` call on
  demand (`src/modules/markdown/lib/wikiLinks.ts`).

---

## Decisions

### 1. One command, a list of folders

```rust
notes_read_dirs(root: String, folders: Vec<String>, workspace: Option<WorkspaceEnv>)
  -> Result<NotesReadDirsResult, String>

struct NotesReadDirsResult { dirs: Vec<NotesDir> }

struct NotesDir {
  folder: String,          // vault-relative, "" is the root
  notes: Vec<NoteItem>,    // the notes directly inside `folder`
  subfolders: Vec<SubfolderItem>,
  missing: bool,           // the folder no longer exists
}

struct NoteItem { rel_path: String, title: String, snippet: String, mtime: u64, created: u64 }
struct SubfolderItem { name: String, note_count: u32, has_subfolders: bool }
```

It takes a list rather than a single folder because opening the view has to load the root plus
every folder in `expandedFolders`, and one round trip beats one per branch.

For each requested folder it reads that directory only. Its own notes get the full treatment that
`read_note_item` does today: title from frontmatter, first H1 or file stem, a 120-character
snippet, `mtime`, and `created` from frontmatter or filesystem birth time. Each subfolder gets a
shallow listing instead: count the markdown files, and note whether any subdirectory exists. No
file inside a subfolder is opened, which is what keeps the chevron and the counter exact without
paying for them.

A folder that no longer exists comes back with `missing: true` rather than failing the whole call,
so one dead entry in `expandedFolders` cannot break the load.

Alternative considered: one command per folder, called once per level. Rejected because restoring a
session with several expanded branches would fan out into one round trip per branch on every
activation.

Filtering follows the walk it replaces exactly, so nothing the user currently sees changes:
markdown extensions are `md`, `markdown` and `mdx`, dot entries are skipped, the ten heavy
directory names in `PRUNE_DIRS` are skipped, and entries ignored by git are left out. Per-directory
gitignore matching is not a problem at one level of depth: `fs_read_dir` already does it in
`git_non_ignored_names` with a `WalkBuilder` limited to depth 1, and the same helper serves here.

Keeping that filter does not bring back the wart it caused. A gitignored folder used to lose its
persisted state because pruning asked the index whether the folder still existed, and the index
had filtered it out. Pruning now asks the filesystem directly through `notes_paths_exist`, which
knows nothing about git, so the listing filter and the existence check are independent concerns and
only the listing keeps the filter.

Duplicates in `folders` are collapsed before reading, since the root, the expanded set and the
selected folder overlap in the common case.

### 2. `NoteItem` drops the absolute path

The current `NoteListItem.path` carries the canonical absolute path of every note and nothing in
the frontend reads it: `NotesView` rebuilds paths from `relPath`. The new payload omits it, which
closes item 1 of [BUG-52](../../pending/bugs/BUG-52-notes-hygiene-varios.md).

### 3. Two small companion commands

```rust
notes_read_heads(root: String, rel_paths: Vec<String>, workspace: Option<WorkspaceEnv>)
  -> Result<Vec<NoteHead>, String>
struct NoteHead { rel_path: String, title: String, snippet: String, missing: bool }

notes_paths_exist(root: String, rel_paths: Vec<String>, workspace: Option<WorkspaceEnv>)
  -> Result<Vec<PathExists>, String>
struct PathExists { rel_path: String, kind: PathKind }  // File | Dir | Absent
```

The first resolves Quick Access titles for the pinned paths alone. The second is the existence
check that drives pruning. Both take a list so each is one round trip, and both are bounded by the
size of `kex.json` rather than by the vault.

Every path in all three commands is vault-relative and validated against escaping the vault, the
same rule `parseNotesConfig` already applies with `isSafeVaultPath`. A path that fails validation is
rejected rather than resolved.

### 4. `useNotesIndex` becomes a per-folder cache

The hook stops exposing `{ notes, folders, truncated }` and exposes a map from folder path to that
folder's loaded contents, plus `loading` and `error`.

The loaded set is exactly the root, the folders in `expandedFolders`, and `selectedFolder`. That is
also the set registered with the watcher through `fs_watch_add`. Expanding a folder loads it and
registers it; collapsing drops its cache entry and deregisters it. While the view is inactive
nothing is read and nothing is subscribed, which is the behaviour the previous work established
and which must not regress.

### 5. A change reloads only the folder that changed

`fs:changed` carries the paths that changed. Since each loaded folder is registered separately, the
directory containing a changed path identifies which cache entry is stale, and only that folder is
re-read, with the existing 300 ms debounce. `fs:file-written`, which the app emits for its own
writes regardless of registration, is routed the same way.

One subtlety decides the routing rule. A folder's note count and its chevron live in its **parent's**
payload, because that is who listed it. So a change inside `docs/pending` makes two entries stale:
`docs/pending` itself, whose note list changed, and `docs`, whose count for `docs/pending` changed.
The rule is therefore: given a changed path, take the folder that contains it and re-read that
folder and its parent, skipping either one that is not loaded. A change in a folder that is not
loaded at all is ignored, which cannot lose anything, because an unloaded folder holds no state to
refresh and is registered nowhere.

On reactivation the whole loaded set is re-read once, because the view was unsubscribed while
hidden and cannot know what happened in the meantime.

### 6. The tree renders from the cache

`buildFolderTree`, which built the full hierarchy from a flat list of every folder, is deleted.
`CollectionsColumn` renders recursively from the cache: a loaded folder contributes its subfolders
with their counts and chevrons, and a folder that is not loaded is simply a closed row. The
frontend no longer counts anything, so `countDirectNotes` goes too, and `filterByFolder` goes
because the backend already returns exactly one folder's notes. `folderTree.ts` is left with
`nextFolderName` alone.

### 7. Pruning by existence check

When the view activates, one `notes_paths_exist` call carries every path recorded in `kex.json`:
the entries of `expandedFolders`, the keys of `folderOrder`, each file name inside those keys
joined to its folder, and `selectedFolder`. `pruneNotesConfig` keeps its current rules and its
identity contract, but takes the existence answer instead of the index: a folder path that is
absent or is not a directory loses its entry, a file name that is absent leaves its list, a list
emptied that way disappears, and a `selectedFolder` that is gone falls back to the root. The root
key is never pruned. `quickAccess` is still never pruned, because pinning is explicit intent and
the greyed row is the signal.

The three guards that protected the old prune (loading, error, truncated) disappear with the walk
they protected. What replaces them is narrower: prune only when the existence call succeeded.

### 8. Creating a note needs its folder loaded

`nextUntitledName` picks the first free `Untitled` from the sibling file names, so creating a note
in a folder that is not loaded has to load it first. That flow becomes: load the folder if absent
from the cache, then compute the name, then create. It is one extra round trip in that one case.

### 9. No cap on a single folder

The old cap existed because a recursive walk has no bound. The number of markdown files in one
directory is chosen by a person, so no cap is introduced. If it ever hurts, the fix is local to one
command.

---

## Data flow

```
activate view
  |
  +-- notes_read_dirs(root, ["", ...expandedFolders, selectedFolder])   one call
  +-- notes_read_heads(root, quickAccess)                               one call
  +-- notes_paths_exist(root, every path recorded in kex.json)          one call
  |
  v
per-folder cache  ->  CollectionsColumn (tree rows, counts, chevrons)
                  ->  NoteListColumn (the selected folder's notes, sorted)
                  ->  fs_watch_add for the loaded set

expand a folder   -> notes_read_dirs(root, [that folder]) + fs_watch_add
collapse a folder -> drop its cache entry + fs_watch_remove
fs:changed(path)  -> re-read the folder that owns `path`, debounced 300 ms
```

---

## Error handling

- A folder that vanished returns `missing: true`. Its cache entry is dropped, and if it was the
  selected folder the view falls back to the root. Pruning removes its persisted state on the next
  activation.
- A folder that cannot be read, for instance a macOS directory protected by privacy settings,
  returns an error for that folder alone. The rest of the call still resolves. The tree shows the
  row with no count rather than hiding it, which is a change from the current behaviour: the walk
  silently dropped anything it could not read, which is what made protected directories vanish
  without explanation.
- A failed call leaves the previous cache in place and surfaces the existing error state with its
  Retry button. Nothing is pruned.
- `kex.json` handling is unchanged: invalid content falls back to defaults and is not overwritten
  until the first user mutation.
- Two windows on the same vault remain last-writer-wins over `kex.json`, unchanged and still item 5
  of BUG-52.

---

## Testing

The Rust side gets tests against a temporary directory, in the same style as the existing
`notes.rs` tests: a folder's own notes are read with title, snippet and dates; subfolder counts
count markdown only and ignore other files; `has_subfolders` is true only when a subdirectory
exists; dot entries and the pruned directory names are skipped; a requested folder that does not
exist comes back as missing rather than failing the call; several folders in one call each return
their own contents; `notes_read_heads` marks a missing path; `notes_paths_exist` distinguishes
file, directory and absent; and a path that tries to escape the vault is rejected.

On the frontend the pure core keeps its coverage: `pruneNotesConfig` gets rewritten around the
existence answer and its tests move with it, including the identity case that avoids a needless
write. Routing a changed path to the folders it invalidates is a pure function and gets its own
tests: a note changed inside a loaded folder invalidates that folder and its parent, a path in the
root invalidates the root alone, a path in a folder that is not loaded invalidates nothing, and a
path outside the vault invalidates nothing.

There is no component test infrastructure in this repo, so the tree rendering from the cache and
the watcher registration are verified by hand. That walkthrough is added to
[IMP-NOTES-07](../../pending/improvements/IMP-NOTES-07-verificacion-manual-pendiente.md) with the
rest.

---

## Documentation impact

- `docs/IPC.md`: remove `notes_list`, document the three new commands.
- `docs/ARCHITECTURE.md`: the notes module description mentions the `notes_list` command and the
  index; update both.
- `docs/FORK.md`: the notes bullets describe a vault-wide index and its scan cap; update them, and
  note that the view now registers its own directories with the watcher.
- `docs/pending/bugs/BUG-52-notes-hygiene-varios.md`: item 1 (the dead `path` field) is closed by
  decision 2, and item 2 (the short read and the multibyte cut in `read_head`) lands in the new
  command, so it should be fixed there rather than left pointing at deleted code.
- `docs/pending/improvements/IMP-NOTES-08-minors-del-scoping-por-carpeta.md`: items 2 and 3 (the
  truncated drag and the deferred first prune) stop existing, since there is no truncation and
  pruning no longer races a walk. Item 4 (a gitignored folder read as deleted) stops existing too.
