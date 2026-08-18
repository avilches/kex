use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use ignore::WalkBuilder;
use serde::Serialize;

use super::search::PRUNE_DIRS;
use super::to_canon;
use crate::modules::workspace::{resolve_path, WorkspaceEnv};

const MAX_SCANNED: usize = 50_000;
const HEAD_BYTES: usize = 2048;
const SNIPPET_MAX_CHARS: usize = 120;
const NOTE_EXTS: &[&str] = &["md", "markdown", "mdx"];

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteListItem {
    pub path: String,
    pub rel_path: String,
    pub title: String,
    pub mtime: u64,
    pub created: u64,
    pub snippet: String,
    pub folder: String,
}

#[derive(Serialize)]
pub struct NotesListResult {
    pub notes: Vec<NoteListItem>,
    pub folders: Vec<String>,
    pub truncated: bool,
}

#[tauri::command]
pub async fn notes_list(
    root: String,
    workspace: Option<WorkspaceEnv>,
) -> Result<NotesListResult, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    let root_path = resolve_path(&root, &workspace);
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    tauri::async_runtime::spawn_blocking(move || list_blocking(&root_path, MAX_SCANNED))
        .await
        .map_err(|e| e.to_string())?
}

/// Blocking core, separated so tests can call it without Tauri's DI container.
pub fn list_blocking(root_path: &Path, max_scanned: usize) -> Result<NotesListResult, String> {
    let mut notes: Vec<NoteListItem> = Vec::new();
    let mut folders: Vec<String> = Vec::new();
    let mut scanned = 0usize;
    let mut truncated = false;

    let walker = WalkBuilder::new(root_path)
        .hidden(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .ignore(true)
        .parents(true)
        .follow_links(false)
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

    for dent in walker.flatten() {
        scanned += 1;
        if scanned > max_scanned {
            truncated = true;
            break;
        }
        let path = dent.path();
        if path == root_path {
            continue;
        }
        let rel = match path.strip_prefix(root_path) {
            Ok(r) => to_canon(r),
            Err(_) => continue,
        };
        if dent.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            folders.push(rel);
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        if !NOTE_EXTS.contains(&ext.as_str()) {
            continue;
        }
        notes.push(read_note_item(path, &rel));
    }

    folders.sort_by_key(|a| a.to_lowercase());
    notes.sort_by_key(|a| a.rel_path.to_lowercase());
    Ok(NotesListResult {
        notes,
        folders,
        truncated,
    })
}

fn read_note_item(path: &Path, rel: &str) -> NoteListItem {
    let meta = std::fs::metadata(path).ok();
    let mtime = meta.as_ref().and_then(ms_modified).unwrap_or(0);
    let btime = meta.as_ref().and_then(ms_created);

    let parsed = parse_head(&read_head(path));

    let stem = Path::new(rel)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| rel.to_string());
    let folder = match rel.rsplit_once('/') {
        Some((dir, _)) => dir.to_string(),
        None => String::new(),
    };

    NoteListItem {
        path: to_canon(path),
        rel_path: rel.to_string(),
        title: parsed.fm_title.or(parsed.h1).unwrap_or(stem),
        mtime,
        created: parsed.fm_created_ms.or(btime).unwrap_or(mtime),
        snippet: parsed.snippet,
        folder,
    }
}

fn ms_modified(meta: &std::fs::Metadata) -> Option<u64> {
    meta.modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as u64)
}

fn ms_created(meta: &std::fs::Metadata) -> Option<u64> {
    meta.created()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as u64)
}

fn read_head(path: &Path) -> String {
    let mut buf = vec![0u8; HEAD_BYTES];
    let n = std::fs::File::open(path)
        .and_then(|mut f| f.read(&mut buf))
        .unwrap_or(0);
    buf.truncate(n);
    String::from_utf8_lossy(&buf).into_owned()
}

struct HeadMeta {
    fm_title: Option<String>,
    fm_created_ms: Option<u64>,
    h1: Option<String>,
    snippet: String,
}

fn parse_head(head: &str) -> HeadMeta {
    let mut fm_title = None;
    let mut fm_created_ms = None;
    let mut h1: Option<String> = None;
    let mut snippet = String::new();

    let mut lines = head.lines().peekable();
    if lines.peek().map(|l| l.trim_end()) == Some("---") {
        lines.next();
        for line in lines.by_ref() {
            let trimmed = line.trim_end();
            if trimmed == "---" || trimmed == "..." {
                break;
            }
            if let Some(v) = trimmed.strip_prefix("title:") {
                let v = unquote(v.trim());
                if !v.is_empty() {
                    fm_title = Some(v.to_string());
                }
            } else if let Some(v) = trimmed.strip_prefix("created:") {
                fm_created_ms = parse_created_ms(unquote(v.trim()));
            }
        }
    }

    for line in lines {
        if h1.is_some() && !snippet.is_empty() {
            break;
        }
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        if t.starts_with('#') {
            if h1.is_none() {
                if let Some(rest) = t.strip_prefix("# ") {
                    let v = rest.trim();
                    if !v.is_empty() {
                        h1 = Some(v.to_string());
                    }
                }
            }
            continue;
        }
        if snippet.is_empty() {
            snippet = t.chars().take(SNIPPET_MAX_CHARS).collect();
        }
    }

    HeadMeta {
        fm_title,
        fm_created_ms,
        h1,
        snippet,
    }
}

fn unquote(s: &str) -> &str {
    let s = s.trim();
    s.strip_prefix('"')
        .and_then(|r| r.strip_suffix('"'))
        .or_else(|| s.strip_prefix('\'').and_then(|r| r.strip_suffix('\'')))
        .unwrap_or(s)
}

/// Minimal `YYYY-MM-DD[THH:MM[:SS]]` parser to ms epoch (UTC). No new crate:
/// two scalar frontmatter keys do not justify a chrono dependency.
fn parse_created_ms(s: &str) -> Option<u64> {
    let s = s.trim();
    let (date, time) = match s.split_once(['T', ' ']) {
        Some((d, t)) => (d, Some(t)),
        None => (s, None),
    };
    let mut parts = date.splitn(3, '-');
    let y: i64 = parts.next()?.parse().ok()?;
    let m: u32 = parts.next()?.parse().ok()?;
    let d: u32 = parts.next()?.parse().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    let days = days_from_civil(y, m, d);
    if days < 0 {
        return None;
    }
    let mut secs: i64 = days * 86_400;
    if let Some(t) = time {
        let t = t.trim_end_matches('Z');
        let mut tp = t.splitn(3, ':');
        let h: i64 = tp.next().and_then(|v| v.parse().ok()).unwrap_or(0);
        let mi: i64 = tp.next().and_then(|v| v.parse().ok()).unwrap_or(0);
        let se: i64 = tp
            .next()
            .and_then(|v| v.split('.').next())
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        if !(0..24).contains(&h) || !(0..60).contains(&mi) || !(0..60).contains(&se) {
            return None;
        }
        secs += h * 3600 + mi * 60 + se;
    }
    u64::try_from(secs.checked_mul(1000)?).ok()
}

/// Howard Hinnant's days-from-civil algorithm (proleptic Gregorian).
fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = ((m as i64) + 9) % 12;
    let doy = (153 * mp + 2) / 5 + (d as i64) - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

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
            let kind = match resolve_rel(root, rel).and_then(|p| std::fs::metadata(&p).ok()) {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &Path, rel: &str, content: &str) {
        let p = dir.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, content).unwrap();
    }

    fn list(dir: &Path) -> NotesListResult {
        list_blocking(dir, MAX_SCANNED).unwrap()
    }

    fn note<'a>(res: &'a NotesListResult, rel: &str) -> &'a NoteListItem {
        res.notes
            .iter()
            .find(|n| n.rel_path == rel)
            .unwrap_or_else(|| panic!("note {rel} not found"))
    }

    #[test]
    fn title_prefers_frontmatter_then_h1_then_stem() {
        let dir = tempfile::tempdir().unwrap();
        write(
            dir.path(),
            "fm.md",
            "---\ntitle: From Frontmatter\n---\n# Ignored H1\nbody\n",
        );
        write(dir.path(), "h1.md", "# From H1\nbody\n");
        write(dir.path(), "plain.md", "just a body line\n");
        let res = list(dir.path());
        assert_eq!(note(&res, "fm.md").title, "From Frontmatter");
        assert_eq!(note(&res, "h1.md").title, "From H1");
        assert_eq!(note(&res, "plain.md").title, "plain");
    }

    #[test]
    fn snippet_skips_headings_and_blank_lines_and_truncates() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "a.md", "# Title\n\n## Sub\n\nFirst body line here.\nsecond\n");
        let long = "x".repeat(500);
        write(dir.path(), "b.md", &format!("{long}\n"));
        let res = list(dir.path());
        assert_eq!(note(&res, "a.md").snippet, "First body line here.");
        assert_eq!(note(&res, "b.md").snippet.chars().count(), 120);
    }

    #[test]
    fn frontmatter_created_wins_over_fs_times() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "c.md", "---\ncreated: 2020-01-02\n---\nbody\n");
        write(dir.path(), "d.md", "body\n");
        let res = list(dir.path());
        // 2020-01-02T00:00:00Z in ms
        assert_eq!(note(&res, "c.md").created, 1_577_923_200_000);
        // fs fallback: some positive timestamp, and mtime is populated too
        assert!(note(&res, "d.md").created > 0);
        assert!(note(&res, "d.md").mtime > 0);
    }

    #[test]
    fn filters_extensions_and_prunes_heavy_dirs() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "keep.md", "a\n");
        write(dir.path(), "keep2.markdown", "a\n");
        write(dir.path(), "keep3.mdx", "a\n");
        write(dir.path(), "skip.txt", "a\n");
        write(dir.path(), "node_modules/dep/readme.md", "a\n");
        let res = list(dir.path());
        let rels: Vec<&str> = res.notes.iter().map(|n| n.rel_path.as_str()).collect();
        assert_eq!(rels, vec!["keep.md", "keep2.markdown", "keep3.mdx"]);
        assert!(!res.folders.iter().any(|f| f.starts_with("node_modules")));
    }

    #[test]
    fn folders_include_empty_dirs_and_folder_field_is_set() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("empty")).unwrap();
        write(dir.path(), "docs/sub/n.md", "a\n");
        let res = list(dir.path());
        assert!(res.folders.contains(&"empty".to_string()));
        assert!(res.folders.contains(&"docs".to_string()));
        assert!(res.folders.contains(&"docs/sub".to_string()));
        assert_eq!(note(&res, "docs/sub/n.md").folder, "docs/sub");
        assert_eq!(note(&res, "docs/sub/n.md").rel_path, "docs/sub/n.md");
    }

    #[test]
    fn robust_against_empty_frontmatter_only_and_binary_files() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "empty.md", "");
        write(dir.path(), "fmonly.md", "---\ntitle: Only FM\n");
        std::fs::write(dir.path().join("bin.md"), [0xff, 0xfe, 0x00, 0x01]).unwrap();
        let res = list(dir.path());
        assert_eq!(note(&res, "empty.md").title, "empty");
        assert_eq!(note(&res, "empty.md").snippet, "");
        assert_eq!(note(&res, "fmonly.md").title, "Only FM");
        assert_eq!(note(&res, "bin.md").title, "bin");
    }

    #[test]
    fn scan_cap_sets_truncated() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..10 {
            write(dir.path(), &format!("n{i}.md"), "a\n");
        }
        let res = list_blocking(dir.path(), 3).unwrap();
        assert!(res.truncated);
        let full = list_blocking(dir.path(), MAX_SCANNED).unwrap();
        assert!(!full.truncated);
        assert_eq!(full.notes.len(), 10);
    }

    #[test]
    fn parse_created_ms_accepts_date_and_datetime() {
        assert_eq!(parse_created_ms("2020-01-02"), Some(1_577_923_200_000));
        assert_eq!(
            parse_created_ms("2020-01-02T03:04:05"),
            Some(1_577_923_200_000 + ((3 * 3600 + 4 * 60 + 5) * 1000)),
        );
        assert_eq!(parse_created_ms("not a date"), None);
        assert_eq!(parse_created_ms("2020-13-01"), None);
    }

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
}
