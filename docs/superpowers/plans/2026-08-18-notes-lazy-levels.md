# Notes Lazy Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the recursive vault index of the notes view with per-level reads on demand, so the cost is proportional to what the user opens and a home directory works as a vault.

**Architecture:** Three new Tauri commands read one directory level at a time. The frontend keeps a per-folder cache whose loaded set is the root, the expanded folders and the selected folder, registers exactly those folders with the non-recursive filesystem watcher, and re-reads only what a change invalidates. The pure core keeps its shape: sorting, per-folder custom order and config pruning stay pure and tested.

**Tech Stack:** Rust with the `ignore` crate (already a dependency), Tauri 2 commands, React 19, TypeScript, vitest. No new dependencies on either side.

**Spec:** `docs/superpowers/specs/2026-08-18-notes-lazy-levels-design.md`

## Global Constraints

- Package manager is **pnpm** only, never npm/npx/yarn. `pnpm test <path>` runs one vitest file.
- Frontend checks: `pnpm check-types` and `pnpm test` must be clean. `pnpm lint` exits 1 on this repo for one pre-existing error in `src/settings/sections/WorkspacesSection.tsx`; that is not yours to fix. Verify your own files with `node_modules/.bin/biome lint <paths>` and expect 0 errors.
- Rust checks: `cd src-tauri && cargo clippy && cargo test --locked`. Both must be clean.
- **No backward compatibility.** Never write migration code, a shim, or a fallback read of a removed command or key. Users start from defaults.
- **No new em-dash** (`—`) anywhere: code, comments, commits, docs. Existing ones in `docs/FORK.md` bullet prefixes stay. **No emojis** anywhere.
- Imports are always `@/...` across modules, and this repo's biome config sorts `@/**` imports before package imports. Same-directory imports stay relative.
- Comments: default to none. If one is genuinely needed, one or two lines on *why*, never *what*. No AI-generic filler.
- Commit messages in English, imperative, one logical change each, never a "Co-authored-by" or "Generated with" line.
- Vault-relative paths are always forward-slash. The empty string is the vault root, it always exists, and it is a valid key everywhere.
- A vault-relative path that is absolute, contains a backslash, starts with a Windows drive prefix, or has any `..` segment is unsafe. Unsafe paths are never resolved: they are reported as absent or missing, never as an error, so one bad entry in `kex.json` cannot break a load.

## File structure

Rust, all under `src-tauri/src/`:

- `modules/fs/notes.rs` gains the three commands and loses `notes_list`. It keeps the head-parsing core it already has: `read_head`, `parse_head`, `parse_created_ms`, `days_from_civil`, `unquote`, `ms_modified`, `ms_created`.
- `modules/fs/tree.rs` only changes the visibility of one helper.
- `lib.rs` swaps the registered command names.

Frontend, all under `src/modules/notes/`:

- `lib/notesDir.ts` (new) owns the typed `invoke` wrappers and the payload types. Replaces `lib/notesList.ts`.
- `lib/invalidate.ts` (new) owns one pure function: which loaded folders a changed path invalidates.
- `lib/useNotesDirs.ts` (new) owns the per-folder cache, the watcher registration and the event routing. Replaces `lib/useNotesIndex.ts`.
- `lib/useQuickAccessHeads.ts` (new) owns the titles of pinned notes.
- `lib/notesConfig.ts` keeps the config parsing and the pruning, with pruning driven by existence answers.
- `lib/noteSort.ts` keeps sorting, grouping, date formatting and the two naming helpers, and loses `filterByFolder`.
- `lib/folderTree.ts` is deleted; its one surviving function moves to `lib/noteSort.ts`.
- `CollectionsColumn.tsx`, `NoteListColumn.tsx` and `NotesView.tsx` consume the above.

---

### Task 1: The `notes_read_dirs` command

Additive: `notes_list` keeps working until Task 7 deletes it, so the app builds and runs throughout.

**Files:**
- Modify: `src-tauri/src/modules/fs/notes.rs`
- Modify: `src-tauri/src/modules/fs/tree.rs:45` (visibility only)
- Modify: `src-tauri/src/lib.rs:808` (register the new command next to the old one)

**Interfaces:**
- Consumes: `PRUNE_DIRS` from `super::search`, `to_canon` from `super::`, `resolve_path` and `WorkspaceEnv` from `crate::modules::workspace`, all already imported in this file.
- Produces: the command `notes_read_dirs(root, folders, workspace)` and the serialized shapes `NoteItem`, `SubfolderItem`, `NotesDir`, `NotesReadDirsResult`. Task 3 mirrors these in TypeScript. `read_dirs_blocking(root: &Path, folders: &[String]) -> NotesReadDirsResult` is the testable core, in the style of the existing `list_blocking`.

- [ ] **Step 1: Write the failing tests**

Add to the existing `mod tests` at the bottom of `src-tauri/src/modules/fs/notes.rs`. The `write` helper already exists there.

```rust
    fn read_dirs(dir: &Path, folders: &[&str]) -> NotesReadDirsResult {
        let owned: Vec<String> = folders.iter().map(|f| f.to_string()).collect();
        read_dirs_blocking(dir, &owned)
    }

    fn one<'a>(res: &'a NotesReadDirsResult, folder: &str) -> &'a NotesDir {
        res.dirs
            .iter()
            .find(|d| d.folder == folder)
            .unwrap_or_else(|| panic!("dir {folder} not found"))
    }

    #[test]
    fn reads_only_the_requested_level() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "root.md", "# Root\nbody\n");
        write(dir.path(), "docs/a.md", "# A\nbody\n");
        write(dir.path(), "docs/deep/b.md", "# B\nbody\n");
        let res = read_dirs(dir.path(), &[""]);
        let root = one(&res, "");
        assert_eq!(
            root.notes.iter().map(|n| n.rel_path.as_str()).collect::<Vec<_>>(),
            vec!["root.md"],
        );
        assert_eq!(
            root.subfolders.iter().map(|s| s.name.as_str()).collect::<Vec<_>>(),
            vec!["docs"],
        );
        assert!(!root.missing);
        assert!(root.error.is_none());
    }

    #[test]
    fn subfolder_counts_are_direct_and_detect_children() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "docs/a.md", "a\n");
        write(dir.path(), "docs/b.md", "b\n");
        write(dir.path(), "docs/notes.txt", "not a note\n");
        write(dir.path(), "docs/deep/c.md", "c\n");
        write(dir.path(), "flat/d.md", "d\n");
        let res = read_dirs(dir.path(), &[""]);
        let root = one(&res, "");
        let docs = root.subfolders.iter().find(|s| s.name == "docs").unwrap();
        assert_eq!(docs.note_count, 2, "counts markdown directly inside, not the .txt, not the grandchild");
        assert!(docs.has_subfolders);
        let flat = root.subfolders.iter().find(|s| s.name == "flat").unwrap();
        assert_eq!(flat.note_count, 1);
        assert!(!flat.has_subfolders);
    }

    #[test]
    fn nested_folder_rel_paths_and_extensions() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "docs/sub/keep.md", "a\n");
        write(dir.path(), "docs/sub/keep2.markdown", "a\n");
        write(dir.path(), "docs/sub/keep3.mdx", "a\n");
        write(dir.path(), "docs/sub/skip.txt", "a\n");
        let sub = read_dirs(dir.path(), &["docs/sub"]);
        let d = one(&sub, "docs/sub");
        assert_eq!(
            d.notes.iter().map(|n| n.rel_path.as_str()).collect::<Vec<_>>(),
            vec!["docs/sub/keep.md", "docs/sub/keep2.markdown", "docs/sub/keep3.mdx"],
        );
    }

    #[test]
    fn skips_dot_entries_and_pruned_dirs() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), ".hidden.md", "a\n");
        write(dir.path(), ".hiddendir/a.md", "a\n");
        write(dir.path(), "node_modules/dep/readme.md", "a\n");
        write(dir.path(), "keep.md", "a\n");
        let res = read_dirs(dir.path(), &[""]);
        let root = one(&res, "");
        assert_eq!(root.notes.len(), 1);
        assert!(root.subfolders.is_empty());
    }

    #[test]
    fn several_folders_in_one_call_and_duplicates_collapse() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "a/1.md", "a\n");
        write(dir.path(), "b/2.md", "b\n");
        let res = read_dirs(dir.path(), &["a", "b", "a"]);
        assert_eq!(res.dirs.len(), 2);
        assert_eq!(one(&res, "a").notes.len(), 1);
        assert_eq!(one(&res, "b").notes.len(), 1);
    }

    #[test]
    fn a_folder_that_does_not_exist_is_missing_not_an_error() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "keep.md", "a\n");
        let res = read_dirs(dir.path(), &["", "gone", "../escape", "docs/../../escape"]);
        assert!(one(&res, "").notes.len() == 1);
        assert!(one(&res, "gone").missing);
        assert!(one(&res, "../escape").missing, "unsafe paths are missing, never an error");
        assert!(one(&res, "docs/../../escape").missing);
    }

    #[test]
    fn note_metadata_matches_the_head_parser() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "fm.md", "---\ntitle: From Frontmatter\ncreated: 2020-01-02\n---\n\nFirst body line.\n");
        let res = read_dirs(dir.path(), &[""]);
        let n = &one(&res, "").notes[0];
        assert_eq!(n.title, "From Frontmatter");
        assert_eq!(n.snippet, "First body line.");
        assert_eq!(n.created, 1_577_923_200_000);
        assert!(n.mtime > 0);
    }

    #[test]
    fn gitignored_entries_are_left_out() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".git")).unwrap();
        write(dir.path(), ".gitignore", "secret.md\nvendor/\n");
        write(dir.path(), "secret.md", "a\n");
        write(dir.path(), "public.md", "a\n");
        write(dir.path(), "vendor/v.md", "a\n");
        let res = read_dirs(dir.path(), &[""]);
        let root = one(&res, "");
        assert_eq!(
            root.notes.iter().map(|n| n.rel_path.as_str()).collect::<Vec<_>>(),
            vec!["public.md"],
        );
        assert!(root.subfolders.is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn an_unreadable_folder_reports_an_error() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let locked = dir.path().join("locked");
        std::fs::create_dir(&locked).unwrap();
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000)).unwrap();
        let res = read_dirs(dir.path(), &["locked"]);
        let d = one(&res, "locked");
        assert!(!d.missing, "it exists, it just cannot be read");
        assert!(d.error.is_some());
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd src-tauri && cargo test --locked notes::tests 2>&1 | tail -20`
Expected: compilation errors, `cannot find function read_dirs_blocking`.

- [ ] **Step 3: Make the gitignore helper reusable**

In `src-tauri/src/modules/fs/tree.rs`, line 45, change `fn git_non_ignored_names` to `pub(crate) fn git_non_ignored_names`. Nothing else in that file changes.

That helper is not what Task 1 ends up calling, but making it reachable documents that the depth-limited gitignore pattern already exists in this codebase, and Task 2's `notes_read_heads` has no walk of its own to lean on.

- [ ] **Step 4: Implement the command**

In `src-tauri/src/modules/fs/notes.rs`, add `use std::collections::{HashMap, HashSet};` to the imports and append these types and functions. Leave `notes_list`, `list_blocking`, `NoteListItem` and `NotesListResult` untouched for now.

```rust
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteItem {
    pub rel_path: String,
    pub title: String,
    pub snippet: String,
    pub mtime: u64,
    pub created: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SubfolderItem {
    pub name: String,
    pub note_count: u32,
    pub has_subfolders: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotesDir {
    pub folder: String,
    pub notes: Vec<NoteItem>,
    pub subfolders: Vec<SubfolderItem>,
    pub missing: bool,
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct NotesReadDirsResult {
    pub dirs: Vec<NotesDir>,
}

/// Vault-relative paths only. Anything that could escape the vault is refused
/// here so a hand-edited kex.json cannot reach the filesystem.
pub(crate) fn is_safe_rel(rel: &str) -> bool {
    if rel.starts_with('/') || rel.contains('\\') {
        return false;
    }
    let b = rel.as_bytes();
    if b.len() >= 2 && b[1] == b':' && b[0].is_ascii_alphabetic() {
        return false;
    }
    !rel.split('/').any(|seg| seg == "..")
}

pub(crate) fn resolve_rel(root: &Path, rel: &str) -> Option<PathBuf> {
    if !is_safe_rel(rel) {
        return None;
    }
    Some(if rel.is_empty() {
        root.to_path_buf()
    } else {
        root.join(rel)
    })
}

fn is_note(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| NOTE_EXTS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

#[tauri::command]
pub async fn notes_read_dirs(
    root: String,
    folders: Vec<String>,
    workspace: Option<WorkspaceEnv>,
) -> Result<NotesReadDirsResult, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    let root_path = resolve_path(&root, &workspace);
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    tauri::async_runtime::spawn_blocking(move || read_dirs_blocking(&root_path, &folders))
        .await
        .map_err(|e| e.to_string())
}

/// Blocking core, separated so tests can call it without Tauri's DI container.
pub fn read_dirs_blocking(root: &Path, folders: &[String]) -> NotesReadDirsResult {
    let mut seen: HashSet<&str> = HashSet::new();
    let mut dirs: Vec<NotesDir> = Vec::new();
    for folder in folders {
        if seen.insert(folder.as_str()) {
            dirs.push(read_one_dir(root, folder));
        }
    }
    NotesReadDirsResult { dirs }
}

fn missing_dir(folder: &str) -> NotesDir {
    NotesDir {
        folder: folder.to_string(),
        notes: Vec::new(),
        subfolders: Vec::new(),
        missing: true,
        error: None,
    }
}

// One walk, two levels deep: depth 1 gives this folder's own notes and its
// subfolder names, depth 2 gives each subfolder's direct note count and whether
// it has children. Bounded by the entries of this folder plus the entries of
// each child, and gitignore is applied once for the whole walk.
fn read_one_dir(root: &Path, folder: &str) -> NotesDir {
    let dir = match resolve_rel(root, folder) {
        Some(d) => d,
        None => return missing_dir(folder),
    };
    if !dir.is_dir() {
        return missing_dir(folder);
    }

    let mut notes: Vec<NoteItem> = Vec::new();
    let mut subs: HashMap<String, (u32, bool)> = HashMap::new();
    let mut first_error: Option<String> = None;
    let mut yielded = 0usize;

    let walker = WalkBuilder::new(&dir)
        .hidden(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .ignore(true)
        .parents(true)
        .follow_links(false)
        .max_depth(Some(2))
        .filter_entry(|dent| {
            if dent.depth() == 0 {
                return true;
            }
            match dent.file_name().to_str() {
                Some(name) => !PRUNE_DIRS.contains(&name),
                None => true,
            }
        })
        .build();

    for res in walker {
        let dent = match res {
            Ok(d) => d,
            Err(e) => {
                if first_error.is_none() {
                    first_error = Some(e.to_string());
                }
                continue;
            }
        };
        yielded += 1;
        let depth = dent.depth();
        if depth == 0 {
            continue;
        }
        let is_dir = dent.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let name = match dent.file_name().to_str() {
            Some(n) => n.to_string(),
            None => continue,
        };
        if depth == 1 {
            if is_dir {
                subs.entry(name).or_insert((0, false));
            } else if is_note(dent.path()) {
                let rel = if folder.is_empty() {
                    name
                } else {
                    format!("{folder}/{name}")
                };
                notes.push(read_note(dent.path(), &rel));
            }
            continue;
        }
        let parent = match dent
            .path()
            .parent()
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
        {
            Some(p) => p.to_string(),
            None => continue,
        };
        let slot = subs.entry(parent).or_insert((0, false));
        if is_dir {
            slot.1 = true;
        } else if is_note(dent.path()) {
            slot.0 += 1;
        }
    }

    notes.sort_by_key(|n| n.rel_path.to_lowercase());
    let mut subfolders: Vec<SubfolderItem> = subs
        .into_iter()
        .map(|(name, (note_count, has_subfolders))| SubfolderItem {
            name,
            note_count,
            has_subfolders,
        })
        .collect();
    subfolders.sort_by_key(|s| s.name.to_lowercase());

    NotesDir {
        folder: folder.to_string(),
        notes,
        subfolders,
        missing: false,
        // Only a failure that stopped the walk from yielding anything beyond the
        // directory itself is this folder's problem; one unreadable grandchild is not.
        error: if yielded <= 1 { first_error } else { None },
    }
}

fn read_note(path: &Path, rel: &str) -> NoteItem {
    let meta = std::fs::metadata(path).ok();
    let mtime = meta.as_ref().and_then(ms_modified).unwrap_or(0);
    let btime = meta.as_ref().and_then(ms_created);
    let parsed = parse_head(&read_head(path));
    let stem = Path::new(rel)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| rel.to_string());
    NoteItem {
        rel_path: rel.to_string(),
        title: parsed.fm_title.or(parsed.h1).unwrap_or(stem),
        mtime,
        created: parsed.fm_created_ms.or(btime).unwrap_or(mtime),
        snippet: parsed.snippet,
    }
}
```

Add `use std::path::PathBuf;` to the imports if it is not already there.

`read_note` is almost the same function as the existing `read_note_item`, which still serves
`notes_list`. That duplication is deliberate and temporary: the two payloads differ (`NoteItem` has
no absolute `path` and no `folder`), and Task 7 deletes `notes_list` together with
`read_note_item`. Do not try to share one function between them, and do not delete the old one
here: the app has to keep building and running between these tasks.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd src-tauri && cargo test --locked notes::tests 2>&1 | tail -20`
Expected: PASS, including the pre-existing `notes_list` tests.

If `subfolder_counts_are_direct_and_detect_children` fails, the depth attribution is the suspect: print `dent.depth()` and `dent.path()` for the fixture and confirm that a grandchild arrives at depth 2 with its parent as the last component of `path().parent()`.

- [ ] **Step 6: Register the command**

In `src-tauri/src/lib.rs`, next to `fs::notes::notes_list` at line 808, add `fs::notes::notes_read_dirs,`. Keep both registered.

- [ ] **Step 7: Verify the crate**

Run: `cd src-tauri && cargo clippy 2>&1 | tail -20 && cargo test --locked 2>&1 | tail -10`
Expected: no warnings from clippy on the new code, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src-tauri
git commit -m "feat(notes): add notes_read_dirs to read one vault level at a time"
```

---

### Task 2: The `notes_read_heads` and `notes_paths_exist` commands

Additive, same as Task 1.

**Files:**
- Modify: `src-tauri/src/modules/fs/notes.rs`
- Modify: `src-tauri/src/lib.rs` (register both)

**Interfaces:**
- Consumes: `is_safe_rel` and `resolve_rel` from Task 1, plus the existing `read_head` and `parse_head`.
- Produces: `notes_read_heads(root, relPaths, workspace) -> Vec<NoteHead>` and `notes_paths_exist(root, relPaths, workspace) -> Vec<PathExists>`, with `heads_blocking` and `paths_exist_blocking` as the testable cores. Task 3 mirrors both in TypeScript.

- [ ] **Step 1: Write the failing tests**

Append to `mod tests` in `src-tauri/src/modules/fs/notes.rs`:

```rust
    #[test]
    fn heads_resolve_titles_and_mark_missing() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "docs/a.md", "---\ntitle: Pinned A\n---\nbody line\n");
        write(dir.path(), "b.md", "# Heading B\nbody\n");
        let heads = heads_blocking(
            dir.path(),
            &[
                "docs/a.md".to_string(),
                "b.md".to_string(),
                "gone.md".to_string(),
                "../escape.md".to_string(),
            ],
        );
        assert_eq!(heads.len(), 4);
        assert_eq!(heads[0].title, "Pinned A");
        assert_eq!(heads[0].snippet, "body line");
        assert!(!heads[0].missing);
        assert_eq!(heads[1].title, "Heading B");
        assert!(heads[2].missing);
        assert_eq!(heads[2].title, "gone", "a missing pin still shows its file stem");
        assert!(heads[3].missing, "unsafe paths are missing, never an error");
    }

    #[test]
    fn paths_exist_distinguishes_file_dir_and_absent() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "docs/a.md", "a\n");
        let got = paths_exist_blocking(
            dir.path(),
            &[
                "docs".to_string(),
                "docs/a.md".to_string(),
                "docs/gone.md".to_string(),
                "".to_string(),
                "../escape".to_string(),
            ],
        );
        let kind = |rel: &str| {
            got.iter()
                .find(|p| p.rel_path == rel)
                .map(|p| &p.kind)
                .unwrap_or_else(|| panic!("{rel} not in the answer"))
        };
        assert!(matches!(kind("docs"), PathKind::Dir));
        assert!(matches!(kind("docs/a.md"), PathKind::File));
        assert!(matches!(kind("docs/gone.md"), PathKind::Absent));
        assert!(matches!(kind(""), PathKind::Dir), "the vault root is a directory");
        assert!(matches!(kind("../escape"), PathKind::Absent));
    }
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd src-tauri && cargo test --locked notes::tests 2>&1 | tail -20`
Expected: compilation errors, `cannot find function heads_blocking`.

- [ ] **Step 3: Implement both commands**

Append to `src-tauri/src/modules/fs/notes.rs`:

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteHead {
    pub rel_path: String,
    pub title: String,
    pub snippet: String,
    pub missing: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PathKind {
    File,
    Dir,
    Absent,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathExists {
    pub rel_path: String,
    pub kind: PathKind,
}

#[tauri::command]
pub async fn notes_read_heads(
    root: String,
    rel_paths: Vec<String>,
    workspace: Option<WorkspaceEnv>,
) -> Result<Vec<NoteHead>, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    let root_path = resolve_path(&root, &workspace);
    tauri::async_runtime::spawn_blocking(move || heads_blocking(&root_path, &rel_paths))
        .await
        .map_err(|e| e.to_string())
}

pub fn heads_blocking(root: &Path, rel_paths: &[String]) -> Vec<NoteHead> {
    rel_paths
        .iter()
        .map(|rel| {
            let stem = Path::new(rel)
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| rel.to_string());
            let path = match resolve_rel(root, rel) {
                Some(p) if p.is_file() => p,
                _ => {
                    return NoteHead {
                        rel_path: rel.clone(),
                        title: stem,
                        snippet: String::new(),
                        missing: true,
                    }
                }
            };
            let parsed = parse_head(&read_head(&path));
            NoteHead {
                rel_path: rel.clone(),
                title: parsed.fm_title.or(parsed.h1).unwrap_or(stem),
                snippet: parsed.snippet,
                missing: false,
            }
        })
        .collect()
}

#[tauri::command]
pub async fn notes_paths_exist(
    root: String,
    rel_paths: Vec<String>,
    workspace: Option<WorkspaceEnv>,
) -> Result<Vec<PathExists>, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    let root_path = resolve_path(&root, &workspace);
    tauri::async_runtime::spawn_blocking(move || paths_exist_blocking(&root_path, &rel_paths))
        .await
        .map_err(|e| e.to_string())
}

pub fn paths_exist_blocking(root: &Path, rel_paths: &[String]) -> Vec<PathExists> {
    rel_paths
        .iter()
        .map(|rel| {
            let kind = match resolve_rel(root, rel).and_then(|p| std::fs::metadata(p).ok()) {
                Some(meta) if meta.is_dir() => PathKind::Dir,
                Some(_) => PathKind::File,
                None => PathKind::Absent,
            };
            PathExists {
                rel_path: rel.clone(),
                kind,
            }
        })
        .collect()
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd src-tauri && cargo test --locked notes::tests 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 5: Register both commands**

In `src-tauri/src/lib.rs`, add `fs::notes::notes_read_heads,` and `fs::notes::notes_paths_exist,` next to the other notes commands.

- [ ] **Step 6: Verify the crate**

Run: `cd src-tauri && cargo clippy 2>&1 | tail -20 && cargo test --locked 2>&1 | tail -10`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src-tauri
git commit -m "feat(notes): add notes_read_heads and notes_paths_exist"
```

---

### Task 3: The typed wrappers on the frontend

Additive: the new module has no consumer until Task 5.

**Files:**
- Create: `src/modules/notes/lib/notesDir.ts`

**Interfaces:**
- Consumes: the three commands from Tasks 1 and 2, plus `currentWorkspaceEnv` from `@/modules/workspace` exactly as `lib/notesList.ts` does today.
- Produces: the types `NoteItem`, `SubfolderItem`, `NotesDir`, `NoteHead`, `PathKind`, `PathExists`, and the functions `notesReadDirs`, `notesReadHeads`, `notesPathsExist`. Every later task imports from here.

- [ ] **Step 1: Write the file**

```ts
import { currentWorkspaceEnv } from "@/modules/workspace";
import { invoke } from "@tauri-apps/api/core";

export type NoteItem = {
  relPath: string;
  title: string;
  snippet: string;
  mtime: number;
  created: number;
};

export type SubfolderItem = {
  name: string;
  noteCount: number;
  hasSubfolders: boolean;
};

export type NotesDir = {
  folder: string;
  notes: NoteItem[];
  subfolders: SubfolderItem[];
  missing: boolean;
  error: string | null;
};

export type NoteHead = {
  relPath: string;
  title: string;
  snippet: string;
  missing: boolean;
};

export type PathKind = "file" | "dir" | "absent";

export type PathExists = { relPath: string; kind: PathKind };

export async function notesReadDirs(root: string, folders: string[]): Promise<NotesDir[]> {
  const res = await invoke<{ dirs: NotesDir[] }>("notes_read_dirs", {
    root,
    folders,
    workspace: currentWorkspaceEnv(),
  });
  return res.dirs;
}

export function notesReadHeads(root: string, relPaths: string[]): Promise<NoteHead[]> {
  return invoke<NoteHead[]>("notes_read_heads", {
    root,
    relPaths,
    workspace: currentWorkspaceEnv(),
  });
}

export function notesPathsExist(root: string, relPaths: string[]): Promise<PathExists[]> {
  return invoke<PathExists[]>("notes_paths_exist", {
    root,
    relPaths,
    workspace: currentWorkspaceEnv(),
  });
}
```

- [ ] **Step 2: Verify**

Run: `pnpm check-types && node_modules/.bin/biome lint src/modules/notes/lib/notesDir.ts`
Expected: types clean, 0 lint errors. There is nothing to test yet: this file is three `invoke` calls and a set of types.

- [ ] **Step 3: Commit**

```bash
git add src/modules/notes/lib/notesDir.ts
git commit -m "feat(notes): add typed wrappers for the per-level notes commands"
```

---

### Task 4: Which folders a change invalidates

**Files:**
- Create: `src/modules/notes/lib/invalidate.ts`
- Test: `src/modules/notes/lib/invalidate.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `foldersToReload(root: string, changedPath: string, loaded: Iterable<string>): string[]`. Task 7's hook calls it for every path in an `fs:changed` payload.

The rule, from the spec: a folder's note count and chevron live in its parent's payload, so a change invalidates the folder that contains it and that folder's parent. The changed path itself is also a candidate, because it may be a loaded folder that was just renamed or deleted. Only loaded folders come back.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { foldersToReload } from "./invalidate";

const ROOT = "/vault";

describe("foldersToReload", () => {
  it("invalidates the containing folder and its parent", () => {
    const loaded = ["", "docs", "docs/pending"];
    expect(foldersToReload(ROOT, "/vault/docs/pending/BUG-99.md", loaded)).toEqual([
      "docs/pending",
      "docs",
    ]);
  });

  it("invalidates only the root for a path directly in the root", () => {
    expect(foldersToReload(ROOT, "/vault/README.md", ["", "docs"])).toEqual([""]);
  });

  it("skips folders that are not loaded", () => {
    expect(foldersToReload(ROOT, "/vault/docs/pending/BUG-99.md", ["docs"])).toEqual(["docs"]);
    expect(foldersToReload(ROOT, "/vault/other/x.md", ["", "docs"])).toEqual([""]);
  });

  it("invalidates a loaded folder that is itself the changed path", () => {
    const loaded = ["", "docs", "docs/pending"];
    expect(foldersToReload(ROOT, "/vault/docs/pending", loaded)).toEqual([
      "docs/pending",
      "docs",
    ]);
  });

  it("ignores a path outside the vault", () => {
    expect(foldersToReload(ROOT, "/elsewhere/x.md", ["", "docs"])).toEqual([]);
    expect(foldersToReload(ROOT, "/vault-other/x.md", ["", "docs"])).toEqual([]);
  });

  it("accepts backslash separators and a trailing slash on the root", () => {
    expect(foldersToReload("/vault/", "\\vault\\docs\\a.md", ["docs"])).toEqual(["docs"]);
  });

  it("never repeats a folder", () => {
    expect(foldersToReload(ROOT, "/vault/docs", ["", "docs"])).toEqual(["docs", ""]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test src/modules/notes/lib/invalidate.test.ts`
Expected: FAIL, cannot resolve `./invalidate`.

- [ ] **Step 3: Implement it**

```ts
import { splitPath } from "@/lib/pathUtils";

function canon(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function foldersToReload(
  root: string,
  changedPath: string,
  loaded: Iterable<string>,
): string[] {
  const normRoot = canon(root);
  const normPath = canon(changedPath);
  if (normPath !== normRoot && !normPath.startsWith(`${normRoot}/`)) return [];
  const rel = normPath.slice(normRoot.length).replace(/^\//, "");
  const [container] = splitPath(rel);
  const [grandparent] = splitPath(container);
  const candidates = rel === "" ? [""] : [rel, container, grandparent];
  const live = new Set(loaded);
  const out: string[] = [];
  for (const c of candidates) {
    if (live.has(c) && !out.includes(c)) out.push(c);
  }
  return out;
}
```

Note on the candidate order: the changed path first, then its container, then the grandparent. The test `never repeats a folder` locks that a change on the loaded folder `docs` yields `["docs", ""]` and not the other way around, because `docs` is both the changed path and, for its own row, the child of the root.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm test src/modules/notes/lib/invalidate.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify**

Run: `pnpm check-types && node_modules/.bin/biome lint src/modules/notes/lib`
Expected: types clean, 0 lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/notes/lib/invalidate.ts src/modules/notes/lib/invalidate.test.ts
git commit -m "feat(notes): add the pure rule for which folders a change invalidates"
```

---

### Task 5: Prune `kex.json` by asking the filesystem

This moves pruning out of the index and into the hook that owns `kex.json`, which is where repairing that file belongs. It also fixes a false positive in the path validation, carried from an earlier review.

**Files:**
- Modify: `src/modules/notes/lib/notesConfig.ts` (`isSafeVaultPath`, `pruneNotesConfig`, plus a new `pathsToCheck`)
- Test: `src/modules/notes/lib/notesConfig.test.ts`
- Modify: `src/modules/notes/lib/useNotesState.ts` (`pruneAgainstIndex` becomes a self-driven effect)
- Modify: `src/modules/notes/NotesView.tsx:55-67` (delete the prune effect)

**Interfaces:**
- Consumes: `notesPathsExist` and `PathKind` from `./notesDir` (Task 3).
- Produces: `pathsToCheck(config: NotesConfig): string[]` and `pruneNotesConfig(config: NotesConfig, kinds: Map<string, PathKind>): NotesConfig`, both pure. `useNotesState` no longer exposes `pruneAgainstIndex`; nothing replaces it in its public surface, because the hook prunes itself.

- [ ] **Step 1: Write the failing tests**

In `src/modules/notes/lib/notesConfig.test.ts`, replace the whole `describe("pruneNotesConfig", ...)` block with the following, and add `pathsToCheck` to the import from `./notesConfig`:

```ts
describe("pathsToCheck", () => {
  it("lists every path the config records, once each", () => {
    const config = {
      ...DEFAULT_NOTES_CONFIG,
      quickAccess: ["docs/pinned.md"],
      folderOrder: { "": ["README.md"], docs: ["IPC.md", "TODO.md"] },
      expandedFolders: ["docs", "public"],
      selectedFolder: "docs",
    };
    expect(pathsToCheck(config).sort()).toEqual(
      ["", "README.md", "docs", "docs/IPC.md", "docs/TODO.md", "public"].sort(),
    );
  });

  it("does not include quickAccess, which is never pruned", () => {
    const config = { ...DEFAULT_NOTES_CONFIG, quickAccess: ["docs/pinned.md"] };
    expect(pathsToCheck(config)).not.toContain("docs/pinned.md");
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
  const kinds = new Map<string, PathKind>([
    ["", "dir"],
    ["docs", "dir"],
    ["docs/dead", "absent"],
    ["README.md", "file"],
    ["docs/IPC.md", "file"],
    ["docs/gone.md", "absent"],
    ["docs/dead/x.md", "absent"],
  ]);

  it("drops folders that are gone and keeps the ones that are there", () => {
    const next = pruneNotesConfig(config, kinds);
    expect(next.expandedFolders).toEqual(["docs"]);
    expect(next.folderOrder["docs/dead"]).toBeUndefined();
  });

  it("keeps the root entry and drops file names that are gone", () => {
    const next = pruneNotesConfig(config, kinds);
    expect(next.folderOrder[""]).toEqual(["README.md"]);
    expect(next.folderOrder.docs).toEqual(["IPC.md"]);
  });

  it("resets a selected folder that is gone", () => {
    expect(pruneNotesConfig(config, kinds).selectedFolder).toBe("");
  });

  it("leaves quickAccess untouched", () => {
    expect(pruneNotesConfig(config, kinds).quickAccess).toEqual(["docs/gone.md"]);
  });

  it("treats a folder path that is now a file as gone", () => {
    const c = { ...DEFAULT_NOTES_CONFIG, expandedFolders: ["docs"], folderOrder: {} };
    const k = new Map<string, PathKind>([["docs", "file"]]);
    expect(pruneNotesConfig(c, k).expandedFolders).toEqual([]);
  });

  it("keeps a path the answer does not mention, rather than guessing", () => {
    const c = { ...DEFAULT_NOTES_CONFIG, expandedFolders: ["docs"] };
    expect(pruneNotesConfig(c, new Map())).toBe(c);
  });

  it("returns the same reference when there is nothing to prune", () => {
    const clean = {
      ...DEFAULT_NOTES_CONFIG,
      folderOrder: { docs: ["IPC.md"] },
      expandedFolders: ["docs"],
      selectedFolder: "docs",
    };
    expect(pruneNotesConfig(clean, kinds)).toBe(clean);
  });
});
```

Add to the existing `describe("parseNotesConfig", ...)` block the case that the carried fix is about:

```ts
  it("accepts legitimate names that merely look suspicious", () => {
    const raw = JSON.stringify({
      notes: { quickAccess: ["a..b.md", "..config/x.md", "docs/a:b.md"] },
    });
    expect(parseNotesConfig(raw).quickAccess).toEqual([
      "a..b.md",
      "..config/x.md",
      "docs/a:b.md",
    ]);
  });

  it("still rejects paths that escape the vault", () => {
    const raw = JSON.stringify({
      notes: { quickAccess: ["../x.md", "/abs/x.md", "docs\\x.md", "C:/x.md"] },
    });
    expect(parseNotesConfig(raw).quickAccess).toEqual([]);
  });
```

Import `PathKind` from `./notesDir` at the top of the test file.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test src/modules/notes/lib/notesConfig.test.ts`
Expected: FAIL, `pathsToCheck is not a function`, plus failures on the new signature of `pruneNotesConfig` and on `docs/a:b.md` being dropped today.

- [ ] **Step 3: Rewrite the two pure functions**

In `src/modules/notes/lib/notesConfig.ts`, import the kind type with `import type { PathKind } from "./notesDir";`, then replace `isSafeVaultPath` and the whole `pruneNotesConfig` (with its `sameFolderOrder` helper if it is only used there) by:

```ts
function isSafeVaultPath(p: string): boolean {
  if (p.startsWith("/") || p.includes("\\")) return false;
  if (/^[A-Za-z]:/.test(p)) return false;
  return !p.split("/").some((seg) => seg === "..");
}

export function pathsToCheck(config: NotesConfig): string[] {
  const out = new Set<string>(config.expandedFolders);
  if (config.selectedFolder !== "") out.add(config.selectedFolder);
  for (const [folder, names] of Object.entries(config.folderOrder)) {
    out.add(folder);
    for (const name of names) out.add(folder === "" ? name : `${folder}/${name}`);
  }
  return [...out];
}

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
  kinds: Map<string, PathKind>,
): NotesConfig {
  // A path the answer does not mention was never asked about, so it stays.
  const isDir = (p: string): boolean => p === "" || (kinds.get(p) ?? "dir") === "dir";
  const isFile = (p: string): boolean => (kinds.get(p) ?? "file") === "file";

  const expandedFolders = config.expandedFolders.filter(isDir);
  const folderOrder: Record<string, string[]> = {};
  for (const [folder, names] of Object.entries(config.folderOrder)) {
    if (!isDir(folder)) continue;
    const next = names.filter((name) =>
      isFile(folder === "" ? name : `${folder}/${name}`),
    );
    if (next.length > 0) folderOrder[folder] = next;
  }
  const selectedFolder = isDir(config.selectedFolder) ? config.selectedFolder : "";

  const changed =
    expandedFolders.length !== config.expandedFolders.length ||
    selectedFolder !== config.selectedFolder ||
    !sameFolderOrder(folderOrder, config.folderOrder);
  return changed ? { ...config, expandedFolders, folderOrder, selectedFolder } : config;
}
```

Note that `pathsToCheck` deliberately omits `quickAccess`: pinning is explicit user intent, a pin whose file is gone renders greyed on purpose, and pruning it would erase that signal.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm test src/modules/notes/lib/notesConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Let `useNotesState` prune itself**

In `src/modules/notes/lib/useNotesState.ts`, delete the `pruneAgainstIndex` callback and its entry in the returned object, add `import { notesPathsExist } from "./notesDir";` and `pathsToCheck` to the import from `./notesConfig`, and add this effect after the load effect:

```ts
  // Repairing kex.json belongs to whoever owns the file. One call, only when the
  // view is active and the config has been read, and never a write when nothing
  // changed, because pruneNotesConfig returns the same object in that case.
  useEffect(() => {
    if (!root || !active || loadedRootRef.current !== root) return;
    let cancelled = false;
    void (async () => {
      const paths = pathsToCheck(configRef.current);
      try {
        const answer = await notesPathsExist(root, paths);
        if (cancelled) return;
        const kinds = new Map(answer.map((a) => [a.relPath, a.kind]));
        update((c) => pruneNotesConfig(c, kinds));
      } catch (e) {
        console.error("[notes] existence check failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, active, update]);
```

The effect reads the config through a ref so that a new config object does not by itself change what
the effect reads mid-flight. Add the ref next to the existing `rootRef`:

```ts
  const configRef = useRef(config);
  configRef.current = config;
```

The dependency array is `[root, active, update, config]`, exactly as written above. `config` is in it
for one reason: the effect must not run before the config has been read from disk, and the guard
that enforces that (`loadedRootRef.current !== root`) reads a ref, which cannot trigger a re-run on
its own. Listing `config` gives the effect a second chance on the render where the loaded config
lands. That converges rather than looping: the prune either changes nothing, in which case
`pruneNotesConfig` returns the same object, `update` skips the write and React bails out of the
re-render, or it changes the config once and the next pass finds nothing left to prune.

- [ ] **Step 6: Delete the prune effect from `NotesView`**

In `src/modules/notes/NotesView.tsx`, delete the effect at lines 55 to 67 (the one whose comment mentions a capped walk) in full. Nothing replaces it.

- [ ] **Step 7: Verify**

Run: `pnpm check-types && pnpm test && node_modules/.bin/biome lint src/modules/notes`
Expected: types clean, suite green, 0 lint errors. The `index.truncated` prop of `NoteListColumn` is still in place at this point; Task 7 removes it.

- [ ] **Step 8: Commit**

```bash
git add src/modules/notes
git commit -m "feat(notes): prune kex.json by asking the filesystem which paths exist"
```

---

### Task 6: Quick Access titles without the index

**Files:**
- Create: `src/modules/notes/lib/useQuickAccessHeads.ts`
- Modify: `src/modules/notes/NotesView.tsx` (replace `notesByRelPath` with the hook's map)
- Modify: `src/modules/notes/CollectionsColumn.tsx` (the `notesByRelPath` prop and `QuickAccessRow`)

**Interfaces:**
- Consumes: `notesReadHeads` and `NoteHead` from `./notesDir` (Task 3).
- Produces: `useQuickAccessHeads(root: string | null, quickAccess: string[], active: boolean): Map<string, NoteHead>`. Task 7 leaves it alone.

- [ ] **Step 1: Write the hook**

```ts
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useMemo, useRef, useState } from "react";
import { type NoteHead, notesReadHeads } from "./notesDir";

// Pinned notes can live anywhere in the vault, so their titles are read for
// those paths alone: on activation, when the pin list changes, and when the app
// writes one of them.
export function useQuickAccessHeads(
  root: string | null,
  quickAccess: string[],
  active: boolean,
): Map<string, NoteHead> {
  const [heads, setHeads] = useState<Map<string, NoteHead>>(new Map());
  const key = quickAccess.join("\n");
  const pinnedRef = useRef(quickAccess);
  pinnedRef.current = quickAccess;

  useEffect(() => {
    if (!root || !active || quickAccess.length === 0) {
      setHeads(new Map());
      return;
    }
    let cancelled = false;
    const load = () => {
      void notesReadHeads(root, pinnedRef.current)
        .then((list) => {
          if (!cancelled) setHeads(new Map(list.map((h) => [h.relPath, h])));
        })
        .catch((e) => console.error("[notes] reading pinned heads failed:", e));
    };
    load();
    const sub = getCurrentWebviewWindow().listen<{ path: string }>(
      "fs:file-written",
      (e) => {
        const norm = e.payload.path.replace(/\\/g, "/");
        if (pinnedRef.current.some((rel) => norm.endsWith(`/${rel}`))) load();
      },
    );
    return () => {
      cancelled = true;
      void sub.then((un) => un());
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the pin list by value; the list itself is read through a ref so a new array identity does not refetch
  }, [root, active, key]);

  return useMemo(() => heads, [heads]);
}
```

- [ ] **Step 2: Use it in `NotesView`**

In `src/modules/notes/NotesView.tsx`, delete the `notesByRelPath` memo, add `import { useQuickAccessHeads } from "./lib/useQuickAccessHeads";`, and add next to the other hooks:

```ts
  const quickAccessHeads = useQuickAccessHeads(
    canonRoot,
    state.config.quickAccess,
    props.active,
  );
```

Pass `heads={quickAccessHeads}` to `CollectionsColumn` instead of `notesByRelPath={notesByRelPath}`.

- [ ] **Step 3: Use it in `CollectionsColumn`**

In `src/modules/notes/CollectionsColumn.tsx`, replace the `notesByRelPath: Map<string, NoteListItem>` prop with `heads: Map<string, NoteHead>`, importing `NoteHead` from `./lib/notesDir`. In `QuickAccessRow`, replace the `note` prop with `head: NoteHead | undefined` and use it in both places it appears:

```tsx
      className={cn(
        "group flex h-6 cursor-pointer items-center gap-1.5 rounded px-1.5 text-[12px]",
        "text-foreground/90 hover:bg-accent",
        isDragging && "opacity-60",
        (!props.head || props.head.missing) && "text-muted-foreground",
      )}
```

```tsx
      <span className="min-w-0 flex-1 truncate">
        {props.head && !props.head.missing
          ? props.head.title
          : pathBasename(props.relPath)}
      </span>
```

and at the call site, `head={props.heads.get(relPath)}`.

- [ ] **Step 4: Verify**

Run: `pnpm check-types && pnpm test && node_modules/.bin/biome lint src/modules/notes`
Expected: types clean, suite green, 0 lint errors. If `NoteListItem` is no longer referenced in `CollectionsColumn.tsx`, remove its now-unused type import.

- [ ] **Step 5: Commit**

```bash
git add src/modules/notes
git commit -m "feat(notes): read pinned note titles on demand instead of from the index"
```

---

### Task 7: Switch the view to per-level reads

The linchpin. It replaces the hook, rewrites how the tree renders, and deletes everything the recursive index left behind. Do it in one commit so the tree never stops compiling.

**Files:**
- Create: `src/modules/notes/lib/useNotesDirs.ts`
- Delete: `src/modules/notes/lib/useNotesIndex.ts`, `src/modules/notes/lib/useNotesIndex.test.ts`, `src/modules/notes/lib/notesList.ts`, `src/modules/notes/lib/folderTree.ts`, `src/modules/notes/lib/folderTree.test.ts`
- Modify: `src/modules/notes/lib/noteSort.ts` (delete `filterByFolder`, adopt `nextFolderName`)
- Modify: `src/modules/notes/lib/noteSort.test.ts` (delete the `filterByFolder` block, adopt the `nextFolderName` test)
- Modify: `src/modules/notes/NotesView.tsx`, `src/modules/notes/CollectionsColumn.tsx`, `src/modules/notes/NoteListColumn.tsx`, `src/modules/notes/NoteRow.tsx`, `src/modules/notes/index.ts`
- Modify: `src-tauri/src/modules/fs/notes.rs` (delete `notes_list`, `list_blocking`, `NoteListItem`, `NotesListResult`, `MAX_SCANNED` and their tests), `src-tauri/src/lib.rs` (unregister)

**Interfaces:**
- Consumes: `notesReadDirs`, `NotesDir`, `NoteItem` from `./notesDir` (Task 3), `foldersToReload` from `./invalidate` (Task 4), `watchAdd`, `watchRemove`, `listenFsChanged` from `@/modules/explorer/lib/watch`.
- Produces: `useNotesDirs(root: string | null, active: boolean, expandedFolders: string[], selectedFolder: string)` returning `{ dirs: Map<string, NotesDir>, loading: boolean, error: string | null, reload: () => void }`.

- [ ] **Step 1: Write the new hook**

Create `src/modules/notes/lib/useNotesDirs.ts`:

```ts
import { listenFsChanged, watchAdd, watchRemove } from "@/modules/explorer/lib/watch";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { foldersToReload } from "./invalidate";
import { type NotesDir, notesReadDirs } from "./notesDir";

const REFRESH_DEBOUNCE_MS = 300;

export function useNotesDirs(
  root: string | null,
  active: boolean,
  expandedFolders: string[],
  selectedFolder: string,
) {
  const [dirs, setDirs] = useState<Map<string, NotesDir>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef(root);
  rootRef.current = root;
  const loadedRef = useRef<Set<string>>(new Set());
  const watchedRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);

  const wanted = useMemo(() => {
    const set = new Set<string>([""]);
    for (const f of expandedFolders) set.add(f);
    set.add(selectedFolder);
    return [...set];
  }, [expandedFolders, selectedFolder]);
  const wantedKey = wanted.join("\n");

  const read = useCallback((folders: string[]) => {
    const r = rootRef.current;
    if (!r || folders.length === 0) return;
    const generation = ++generationRef.current;
    setLoading(true);
    void notesReadDirs(r, folders)
      .then((list) => {
        if (generationRef.current !== generation) return;
        setError(null);
        setDirs((prev) => {
          const next = new Map(prev);
          for (const d of list) {
            if (d.missing) next.delete(d.folder);
            else next.set(d.folder, d);
          }
          return next;
        });
      })
      .catch((e) => {
        if (generationRef.current === generation) setError(String(e));
      })
      .finally(() => {
        if (generationRef.current === generation) setLoading(false);
      });
  }, []);

  // Root change and deactivation both drop everything: nothing is read or
  // watched while the view is hidden.
  useEffect(() => {
    if (!root || !active) {
      if (watchedRef.current.size > 0) {
        watchRemove([...watchedRef.current]);
        watchedRef.current = new Set();
      }
      loadedRef.current = new Set();
      setDirs(new Map());
      return;
    }
    loadedRef.current = new Set(wanted);
    const abs = wanted.map((f) => (f === "" ? root : `${root}/${f}`));
    watchAdd(abs);
    watchedRef.current = new Set(abs);
    read(wanted);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: wantedKey stands for the wanted set by value
  }, [root, active, wantedKey, read]);

  useEffect(() => {
    if (!root || !active) return;
    const sub = listenFsChanged((paths) => {
      const r = rootRef.current;
      if (!r) return;
      for (const p of paths) {
        for (const f of foldersToReload(r, p, loadedRef.current)) {
          pendingRef.current.add(f);
        }
      }
      if (pendingRef.current.size === 0) return;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const folders = [...pendingRef.current];
        pendingRef.current = new Set();
        read(folders);
      }, REFRESH_DEBOUNCE_MS);
    });
    const written = getCurrentWebviewWindow().listen<{ path: string }>(
      "fs:file-written",
      (e) => {
        const r = rootRef.current;
        if (!r) return;
        const folders = foldersToReload(r, e.payload.path, loadedRef.current);
        if (folders.length > 0) read(folders);
      },
    );
    return () => {
      void sub.then((un) => un());
      void written.then((un) => un());
    };
  }, [root, active, read]);

  const reload = useCallback(() => read([...loadedRef.current]), [read]);

  return { dirs, loading, error, reload };
}
```

- [ ] **Step 2: Move `nextFolderName` and delete `filterByFolder`**

Append `nextFolderName` to `src/modules/notes/lib/noteSort.ts`, copied verbatim from `folderTree.ts`:

```ts
export function nextFolderName(existingNames: string[]): string {
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  if (!taken.has("new folder")) return "New Folder";
  for (let i = 2; ; i++) {
    const candidate = `New Folder ${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
```

Delete `filterByFolder` from that file. In `src/modules/notes/lib/noteSort.test.ts`, delete the whole `describe("filterByFolder", ...)` block and its name from the import, then append the `nextFolderName` test copied from `folderTree.test.ts`:

```ts
describe("nextFolderName", () => {
  it("starts at New Folder and increments, case-insensitive", () => {
    expect(nextFolderName([])).toBe("New Folder");
    expect(nextFolderName(["new folder"])).toBe("New Folder 2");
    expect(nextFolderName(["New Folder", "New Folder 2"])).toBe("New Folder 3");
  });
});
```

Then delete `src/modules/notes/lib/folderTree.ts` and `src/modules/notes/lib/folderTree.test.ts`.

- [ ] **Step 3: Render the tree from the cache**

`CollectionsColumn` currently takes `folders: string[]` and `counts: Map<string, number>` and builds a tree with `buildFolderTree`. Replace both props with `dirs: Map<string, NotesDir>` and derive each level from it. `FolderRow` takes the same props it takes today except that its `node` becomes a `{ name, relPath, noteCount, hasSubfolders }` and its children come from the cache:

```tsx
type FolderEntry = {
  name: string;
  relPath: string;
  noteCount: number;
  hasSubfolders: boolean;
};

function childrenOf(dirs: Map<string, NotesDir>, folder: string): FolderEntry[] {
  const dir = dirs.get(folder);
  if (!dir) return [];
  return dir.subfolders.map((s) => ({
    name: s.name,
    relPath: folder === "" ? s.name : `${folder}/${s.name}`,
    noteCount: s.noteCount,
    hasSubfolders: s.hasSubfolders,
  }));
}
```

`FolderRow`'s props change in exactly three places, everything else about that component stays as it
is (the inline rename, the context menu, the indentation by depth, the selected highlight):

```tsx
type FolderRowProps = {
  entry: FolderEntry;          // was: node: FolderNode
  dirs: Map<string, NotesDir>; // new: where the children come from
  depth: number;
  expanded: Set<string>;
  selectedFolder: string;
  editingFolder: string | null;
  onToggleFolderExpanded: (relPath: string) => void;
  onSelectFolder: (relPath: string) => void;
  onNewNoteIn: (folderRelPath: string) => void;
  onNewFolder: (parentRelPath: string) => void;
  onStartRenameFolder: (relPath: string) => void;
  onRenameFolder: (relPath: string, newName: string) => void;
  onRenameFolderDone: () => void;
  onDeleteFolder: (relPath: string) => void;
};
```

The `counts` prop is gone from that type, since the count now travels inside the entry. Inside the
component, `hasChildren` becomes `props.entry.hasSubfolders`, every `node.relPath` becomes
`entry.relPath`, every `node.name` becomes `entry.name`, the count span reads
`props.entry.noteCount`, and the recursive branch becomes:

```tsx
      {isExpanded &&
        childrenOf(props.dirs, entry.relPath).map((child) => (
          <FolderRow key={child.relPath} {...props} entry={child} depth={depth + 1} />
        ))}
```

The root row's count reads `props.dirs.get("")?.notes.length ?? 0`, and the top-level rows are `childrenOf(props.dirs, "")`.

- [ ] **Step 4: Drop the truncation footer**

In `src/modules/notes/NoteListColumn.tsx`, delete the `truncated: boolean;` prop and the block that renders "The vault scan hit its limit, so some notes may be missing". Change the `notes` prop type from `NoteListItem[]` to `NoteItem[]`, importing from `./lib/notesDir`. Do the same in `NoteRow.tsx` for its `note` prop.

- [ ] **Step 5: Wire `NotesView`**

Replace the `useNotesIndex` call with a destructured one, so no line ever reads `dirs.dirs`:

```tsx
  const { dirs, loading, error, reload } = useNotesDirs(
    canonRoot,
    props.active,
    state.config.expandedFolders,
    state.config.selectedFolder,
  );
  const selected = dirs.get(state.config.selectedFolder);
  const visibleNotes = selected?.notes ?? [];
```

Pass `notes={visibleNotes}`, `loading={loading}`, `error={error ?? selected?.error ?? null}` and `onRetry={reload}` to `NoteListColumn`, and `dirs={dirs}` to `CollectionsColumn`. Replace every remaining `index.refresh()` with `reload()`, and delete the `counts` memo along with every other use of the old index. `rootLabel` stays exactly as it is.

`handleNewNoteIn` needs the target folder's note names before creating, and that folder may not be loaded. Make it load first:

```tsx
  const handleNewNoteIn = useCallback(
    async (folder: string) => {
      let dir = dirs.get(folder);
      if (!dir) {
        const [fresh] = await notesReadDirs(canonRoot, [folder]);
        dir = fresh;
      }
      const siblings = (dir?.notes ?? []).map((n) => pathBasename(n.relPath));
      const name = nextUntitledName(siblings);
      const relPath = folder === "" ? name : `${folder}/${name}`;
      try {
        await native.createFile(abs(relPath));
        state.setSelectedFolder(folder);
        setPrimedRenamePath(relPath);
        props.onOpenFile(abs(relPath), true);
        reload();
      } catch (e) {
        console.error("Failed to create note:", e);
        toast.error("Failed to create note", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [dirs, reload, canonRoot, abs, state, props.onOpenFile],
  );
```

`handleNewFolder` computes sibling folder names, which now come from the cache: use `dirs.get(parent)?.subfolders.map((s) => s.name) ?? []` in place of the current `index.folders` filter. Keep the `state.expandFolder(parent)` call that already exists for a non-root parent, and swap its `index.refresh()` for `reload()`.

- [ ] **Step 6: Delete the old index and payload modules**

Delete `src/modules/notes/lib/useNotesIndex.ts`, `src/modules/notes/lib/useNotesIndex.test.ts` and `src/modules/notes/lib/notesList.ts`. Update `src/modules/notes/index.ts` if it re-exports any deleted name. The `isNoteRelevantPath` helper that `useNotesIndex.test.ts` covered goes with it: `foldersToReload` replaced its job and has its own tests.

- [ ] **Step 7: Delete the recursive command**

In `src-tauri/src/modules/fs/notes.rs`, delete `notes_list`, `list_blocking`, `read_note_item`, `NoteListItem`, `NotesListResult`, `MAX_SCANNED` and the tests that exercise them (`title_prefers_frontmatter_then_h1_then_stem`, `snippet_skips_headings_and_blank_lines_and_truncates`, `frontmatter_created_wins_over_fs_times`, `filters_extensions_and_prunes_heavy_dirs`, `folders_include_empty_dirs_and_folder_field_is_set`, `robust_against_empty_frontmatter_only_and_binary_files`, `scan_cap_sets_truncated`). Keep `parse_created_ms_accepts_date_and_datetime`.

Two of those tests cover behaviour that still exists through `read_note`, so port them rather than dropping the coverage: title precedence and the snippet rules. Rewrite each to call `read_dirs_blocking` and assert on `one(&res, "").notes`.

In `src-tauri/src/lib.rs`, remove the `fs::notes::notes_list,` line.

- [ ] **Step 8: Verify everything**

Run: `pnpm check-types && pnpm test && node_modules/.bin/biome lint src/modules/notes`
Run: `cd src-tauri && cargo clippy 2>&1 | tail -20 && cargo test --locked 2>&1 | tail -10`
Expected: all clean. Clippy will flag any helper left unused by the deletions in step 7; delete those too rather than silencing the warning.

- [ ] **Step 9: Commit**

```bash
git add src src-tauri
git commit -m "feat(notes): read the vault one level at a time instead of indexing it whole"
```

---

### Task 8: Documentation and pending work

**Files:**
- Modify: `docs/IPC.md:51`
- Modify: `docs/ARCHITECTURE.md:533-536`
- Modify: `docs/FORK.md` (the notes bullets)
- Modify: `docs/pending/bugs/BUG-52-notes-hygiene-varios.md`
- Modify: `docs/pending/improvements/IMP-NOTES-08-minors-del-scoping-por-carpeta.md`
- Modify: `docs/pending/improvements/IMP-NOTES-07-verificacion-manual-pendiente.md`
- Modify: `docs/PENDING.md` (only if a one-line summary becomes wrong)

**Interfaces:**
- Consumes: everything above. Produces: nothing.

- [ ] **Step 1: Replace the `notes_list` row in `docs/IPC.md`**

Delete line 51 and add three rows in its place, in the same table and the same style:

```
| `notes_read_dirs(root, folders, workspace)` | Read one vault level per requested folder, in a single call. Per folder returns `notes` (direct markdown children: `relPath`, `title` (frontmatter `title:` > first H1 > file stem), `snippet` (120 chars), `mtime`, `created` (frontmatter `created:` > btime > mtime)), `subfolders` (`name`, `noteCount` of direct markdown children, `hasSubfolders`), `missing` when the folder is gone or the path is unsafe, and `error` when the folder exists but could not be read. One `ignore` walk of depth 2 per folder: gitignore-aware, skips dot entries and the same pruned dir set as `fs_search`. Reads only the first 2 KB of each note of the folder itself, and never opens a file inside a subfolder. Backs the Notes sidebar view |
| `notes_read_heads(root, relPaths, workspace)` | Title and snippet for the given vault-relative notes, for Quick Access. `missing: true` (with the file stem as title) when a path is absent or unsafe |
| `notes_paths_exist(root, relPaths, workspace)` | Per path, `file`, `dir` or `absent`. Drives the automatic repair of the `notes` namespace in `kex.json`. An unsafe path answers `absent`, so a hand-edited file gets cleaned rather than resolved |
```

- [ ] **Step 2: Update the module map in `docs/ARCHITECTURE.md`**

Lines 533 to 536 describe the notes module as fed by "one `notes_list` IPC walk". Rewrite that sentence to say the view reads one directory level at a time through `notes_read_dirs`, keeps a per-folder cache, registers exactly the loaded folders with the non-recursive filesystem watcher, and resolves pinned titles through `notes_read_heads`.

- [ ] **Step 3: Update `docs/FORK.md`**

The notes bullets describe a vault-wide index. The "Note metadata" bullet is still true. Rewrite the parts that are not: there is no scan cap and no truncation, the data comes per level on demand, and the view registers its own directories with the watcher, which it did not do before. Keep the existing `**Field** — text` bullet prefixes and add no new em-dash.

- [ ] **Step 4: Close what this work resolved in `BUG-52`**

Item 1 (the dead `path` field) is gone with `NoteListItem`: delete the item. Item 2 (the short read and the multibyte cut in `read_head`) still stands, because `read_head` survives, so leave it but check that its line numbers still point at real code and fix them if not. Renumber the remaining items and update the `## Descripcion` count, which says five.

- [ ] **Step 5: Retire the items of `IMP-NOTES-08` that stopped existing**

Item 2 (a drag losing clipped order entries when the vault was truncated) and item 3 (the first prune racing the walk) describe machinery this work deleted: there is no truncation and pruning no longer depends on a walk. Item 4 (a gitignored folder read as deleted) is fixed, because pruning now asks the filesystem. Item 7 (the path predicate dropping `a:b.md`) was fixed in Task 5. Delete those four, renumber the rest, and update the count in the title line of `docs/PENDING.md` if it names a number.

- [ ] **Step 6: Add the walkthrough to `IMP-NOTES-07`**

Add a fifth group of manual scenarios, in the same unaccented Spanish as the rest of that file:

1. Abrir la vista en un repo normal: el arbol sale colapsado, con la raiz y sus carpetas de primer nivel, cada una con su cuenta de notas directas y con flecha solo si tiene subcarpetas.
2. Expandir una carpeta: aparecen sus hijas con sus cuentas, y la lista sigue mostrando la carpeta seleccionada.
3. Poner la raiz del workspace en el home del usuario: el arbol carga sin tope, sin el aviso de limite de escaneo, y las carpetas protegidas por privacidad de macOS salen en el arbol (con error al abrirlas) en vez de desaparecer sin explicacion.
4. Crear una nota desde el menu contextual de una carpeta colapsada y no seleccionada: salta a esa carpeta y abre el rename en linea.
5. Con la vista de notas abierta y el explorer en otra pestaña, crear un fichero markdown desde el terminal dentro de la carpeta seleccionada: aparece sin pulsar refresco. Antes de este trabajo esto solo funcionaba si el explorer tenia ese mismo directorio abierto.
6. Crear un fichero dentro de una subcarpeta cargada pero colapsada: su contador en el arbol sube.
7. Fijar una nota en Quick Access, cerrar la vista, borrar el fichero desde fuera y volver: la fila sale en gris con el nombre del fichero, y sigue en `kex.json`.

- [ ] **Step 7: Verify**

Run: `pnpm test`
Expected: green, since this task changes only documentation.

Read each edited file top to bottom and confirm no dangling reference to `notes_list`, to the scan cap, or to a renumbered item.

- [ ] **Step 8: Commit**

```bash
git add docs
git commit -m "docs: describe the per-level notes reads and retire the items they resolve"
```
