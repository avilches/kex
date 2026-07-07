use std::io::Read;
use std::path::Path;
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
}
