use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use ignore::WalkBuilder;
use nucleo_matcher::pattern::{CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};
use serde::Serialize;

use super::to_canon;
use crate::modules::workspace::{resolve_path, WorkspaceEnv};

#[derive(Serialize, Clone)]
pub struct SearchHit {
    /// Absolute path of the matched file.
    pub path: String,
    /// Path relative to the search root, for display.
    pub rel: String,
    /// File name only.
    pub name: String,
    pub is_dir: bool,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub hits: Vec<SearchHit>,
    /// True if the scan stopped early (entry budget, hit cap, or superseded query).
    pub truncated: bool,
}

/// Hard cap on entries the walker is allowed to visit before bailing. Protects
/// against pathological roots like $HOME where there's no .gitignore and the
/// tree is effectively unbounded.
const MAX_SCANNED: usize = 50_000;

const DEFAULT_DEPTH: usize = 8;
const HARD_DEPTH: usize = 16;

/// Directory names pruned unconditionally — they're rarely useful in a
/// file-explorer search and they dominate scan time when present.
const PRUNE_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".cache",
    ".venv",
    "__pycache__",
];

/// Supersession counter for interactive file search. Each new query bumps the
/// generation; in-flight scans observe the change and quit early.
#[derive(Default)]
pub struct FileSearchState {
    // Arc needed to move the counter into spawn_blocking's closure.
    generation: Arc<AtomicU64>,
}

#[tauri::command]
pub async fn fs_search(
    state: tauri::State<'_, FileSearchState>,
    root: String,
    query: String,
    limit: Option<usize>,
    max_depth: Option<usize>,
    workspace: Option<WorkspaceEnv>,
    show_hidden: Option<bool>,
) -> Result<SearchResult, String> {
    let q = query.trim().to_string();
    if q.is_empty() {
        return Ok(SearchResult {
            hits: Vec::new(),
            truncated: false,
        });
    }

    let my_gen = state.generation.fetch_add(1, Ordering::SeqCst) + 1;
    let gen = Arc::clone(&state.generation);

    let cap = limit.unwrap_or(200).min(1000);
    let depth = max_depth.unwrap_or(DEFAULT_DEPTH).clamp(1, HARD_DEPTH);
    let show_hidden = show_hidden.unwrap_or(false);
    let workspace = WorkspaceEnv::from_option(workspace);
    let root_path = resolve_path(&root, &workspace);

    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }

    tauri::async_runtime::spawn_blocking(move || {
        search_blocking(&root_path, &root, &q, cap, depth, &workspace, show_hidden, gen, my_gen)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Blocking search core, separated so integration tests can call it without
/// Tauri's DI container. Pass a detached generation counter with `my_gen == 0`
/// and an `Arc` that will never be bumped to disable cancellation.
#[allow(clippy::too_many_arguments)]
pub fn search_blocking(
    root_path: &std::path::Path,
    root_display: &str,
    query: &str,
    cap: usize,
    depth: usize,
    workspace: &WorkspaceEnv,
    show_hidden: bool,
    gen: Arc<AtomicU64>,
    my_gen: u64,
) -> Result<SearchResult, String> {
    let mut cands: Vec<SearchHit> = Vec::new();
    let mut scanned: usize = 0;
    let mut truncated = false;

    let walker = WalkBuilder::new(root_path)
        .hidden(!show_hidden)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .ignore(true)
        .parents(true)
        .follow_links(false)
        .max_depth(Some(depth))
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
        if gen.load(Ordering::SeqCst) != my_gen {
            truncated = true;
            break;
        }
        scanned += 1;
        if scanned > MAX_SCANNED {
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
        let name = path
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let is_dir = dent.file_type().map(|t| t.is_dir()).unwrap_or(false);
        cands.push(SearchHit {
            path: display_path(path, root_path, root_display, workspace),
            rel,
            name,
            is_dir,
        });
    }

    let hits = rank_fuzzy(cands, query, cap);
    Ok(SearchResult { hits, truncated })
}

/// Fuzzy-rank candidates against the query (path-aware, smart-case), keeping
/// the top `cap`. Ties break toward shorter relative paths.
fn rank_fuzzy(cands: Vec<SearchHit>, query: &str, cap: usize) -> Vec<SearchHit> {
    // Strip glob wildcards so "*.pdf" degrades gracefully to ".pdf" fuzzy matching.
    let stripped: String = query.chars().filter(|&c| c != '*' && c != '?').collect();
    let effective = if stripped.is_empty() {
        // Pure wildcard query — return all candidates up to cap sorted by path length.
        let mut out = cands;
        out.sort_by_key(|h| h.rel.len());
        out.truncate(cap);
        return out;
    } else {
        stripped.as_str()
    };

    let mut matcher = Matcher::new(Config::DEFAULT.match_paths());
    let pattern = Pattern::parse(effective, CaseMatching::Smart, Normalization::Smart);
    let mut buf = Vec::new();

    let mut scored = Vec::with_capacity(cands.len());
    for (i, c) in cands.iter().enumerate() {
        if let Some(s) = pattern.score(Utf32Str::new(&c.rel, &mut buf), &mut matcher) {
            scored.push((s, i));
        }
    }
    scored.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| cands[a.1].rel.len().cmp(&cands[b.1].rel.len()))
    });
    scored
        .into_iter()
        .take(cap)
        .map(|(_, i)| cands[i].clone())
        .collect()
}

#[derive(Serialize)]
pub struct ListFilesResult {
    pub files: Vec<String>,
    pub truncated: bool,
}

#[tauri::command]
pub fn fs_list_files(
    root: String,
    limit: Option<usize>,
    max_depth: Option<usize>,
    workspace: Option<WorkspaceEnv>,
    show_hidden: Option<bool>,
) -> Result<ListFilesResult, String> {
    const DEFAULT_LIMIT: usize = 2_000;
    const HARD_LIMIT: usize = 10_000;

    let cap = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, HARD_LIMIT);
    let depth = max_depth.unwrap_or(DEFAULT_DEPTH).clamp(1, HARD_DEPTH);
    let show_hidden = show_hidden.unwrap_or(false);
    let workspace = WorkspaceEnv::from_option(workspace);
    let root_path = resolve_path(&root, &workspace);
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }

    let walker = WalkBuilder::new(&root_path)
        .hidden(!show_hidden)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .ignore(true)
        .parents(true)
        .follow_links(false)
        .max_depth(Some(depth))
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

    let mut files: Vec<String> = Vec::with_capacity(cap.min(256));
    let mut scanned: usize = 0;
    let mut truncated = false;

    for dent in walker.flatten() {
        scanned += 1;
        if scanned > MAX_SCANNED {
            truncated = true;
            break;
        }
        let is_file = dent.file_type().map(|t| t.is_file()).unwrap_or(false);
        if !is_file {
            continue;
        }
        let path = dent.path();
        let rel = match path.strip_prefix(&root_path) {
            Ok(r) => to_canon(r),
            Err(_) => continue,
        };
        if rel.is_empty() {
            continue;
        }
        files.push(rel);
        if files.len() >= cap {
            truncated = true;
            break;
        }
    }

    files.sort_by_key(|a| a.to_lowercase());
    Ok(ListFilesResult { files, truncated })
}

fn display_path(
    path: &std::path::Path,
    root_path: &std::path::Path,
    root_display: &str,
    workspace: &WorkspaceEnv,
) -> String {
    if workspace.is_wsl() {
        if let Ok(rel) = path.strip_prefix(root_path) {
            let rel = to_canon(rel);
            return if rel.is_empty() {
                root_display.to_string()
            } else if root_display.ends_with('/') {
                format!("{root_display}{rel}")
            } else {
                format!("{root_display}/{rel}")
            };
        }
    }
    to_canon(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hit(rel: &str) -> SearchHit {
        SearchHit {
            path: rel.to_string(),
            rel: rel.to_string(),
            name: rel.rsplit('/').next().unwrap_or(rel).to_string(),
            is_dir: false,
        }
    }

    #[test]
    fn rank_fuzzy_prefers_name_and_shorter_path() {
        let cands = vec![
            hit("src/deeply/nested/config.rs"),
            hit("config.rs"),
            hit("src/main.rs"),
        ];
        let out = rank_fuzzy(cands, "config", 10);
        assert_eq!(out[0].rel, "config.rs");
        assert!(!out.iter().any(|h| h.rel == "src/main.rs"));
    }

    #[test]
    fn rank_fuzzy_matches_subsequence() {
        let cands = vec![hit("CommandPalette.tsx"), hit("readme.md")];
        let out = rank_fuzzy(cands, "cmdp", 10);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].rel, "CommandPalette.tsx");
    }

    #[test]
    fn depth_defaults_are_sane() {
        assert_eq!(DEFAULT_DEPTH, 8);
        assert_eq!(HARD_DEPTH, 16);
        assert!(DEFAULT_DEPTH <= HARD_DEPTH);
    }
}
