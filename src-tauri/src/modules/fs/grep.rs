use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use globset::{Glob, GlobSet, GlobSetBuilder};
use grep_regex::{RegexMatcher, RegexMatcherBuilder};
use grep_searcher::sinks::UTF8;
use grep_searcher::{BinaryDetection, SearcherBuilder};
use ignore::{WalkBuilder, WalkState};
use serde::Serialize;

use super::{display_path, to_canon};
use crate::modules::workspace::{resolve_path, WorkspaceEnv};

const FILE_SIZE_CAP: u64 = 5 * 1024 * 1024;
const DEFAULT_MAX_RESULTS: usize = 200;
const HARD_MAX_RESULTS: usize = 2000;

/// Supersession counter for interactive content search. Each new interactive
/// query bumps the generation; in-flight walks observe the change and quit,
/// so fast typing stops superseded searches server-side instead of letting
/// them run to completion. `current_request` and `cancelled_through` let an
/// explicit cancel target one request without stopping a newer one, including
/// when the cancel arrives before the search itself.
#[derive(Default)]
pub struct ContentSearchState {
    generation: AtomicU64,
    current_request: AtomicU64,
    cancelled_through: AtomicU64,
}

impl ContentSearchState {
    fn begin(&self, request_id: u64) -> (u64, bool) {
        let my_gen = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        self.current_request.store(request_id, Ordering::SeqCst);
        let cancelled = request_id != 0 && self.cancelled_through.load(Ordering::SeqCst) >= request_id;
        (my_gen, cancelled)
    }

    fn cancel(&self, request_id: u64) {
        if request_id == 0 {
            return;
        }
        self.cancelled_through.fetch_max(request_id, Ordering::SeqCst);
        if self.current_request.load(Ordering::SeqCst) == request_id {
            self.generation.fetch_add(1, Ordering::SeqCst);
        }
    }

    fn is_cancelled(&self, my_gen: u64) -> bool {
        self.generation.load(Ordering::SeqCst) != my_gen
    }
}

#[derive(Serialize)]
pub struct GrepHit {
    pub path: String,
    pub rel: String,
    pub line: u64,
    pub text: String,
}

#[derive(Serialize)]
pub struct GrepResponse {
    pub hits: Vec<GrepHit>,
    pub truncated: bool,
    pub files_scanned: usize,
}

fn build_globset(patterns: &[String]) -> Result<Option<GlobSet>, String> {
    if patterns.is_empty() {
        return Ok(None);
    }
    let mut b = GlobSetBuilder::new();
    for p in patterns {
        let g = Glob::new(p).map_err(|e| format!("bad glob {p:?}: {e}"))?;
        b.add(g);
    }
    let set = b.build().map_err(|e| format!("globset build: {e}"))?;
    Ok(Some(set))
}

fn escape_literal(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for c in s.chars() {
        if "\\.+*?()|[]{}^$".contains(c) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

#[allow(clippy::too_many_arguments)]
fn search_tree(
    root_path: &Path,
    root_display: &str,
    workspace: &WorkspaceEnv,
    matcher: &RegexMatcher,
    globs: &Option<GlobSet>,
    cap: usize,
    cancel: &(dyn Fn() -> bool + Sync),
) -> GrepResponse {
    let walker = WalkBuilder::new(root_path)
        .hidden(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .ignore(true)
        .parents(true)
        .follow_links(false)
        .build_parallel();

    let hits: Arc<Mutex<Vec<GrepHit>>> = Arc::new(Mutex::new(Vec::new()));
    let scanned = Arc::new(AtomicUsize::new(0));
    let truncated = Arc::new(AtomicBool::new(false));

    walker.run(|| {
        let matcher = matcher.clone();
        let globs = globs.clone();
        let hits = hits.clone();
        let scanned = scanned.clone();
        let truncated = truncated.clone();
        let root_path = root_path.to_path_buf();
        let root_display = root_display.to_string();
        let workspace = workspace.clone();

        Box::new(move |dent_res| {
            if truncated.load(Ordering::Relaxed) || cancel() {
                return WalkState::Quit;
            }
            let dent = match dent_res {
                Ok(d) => d,
                Err(_) => return WalkState::Continue,
            };
            if !dent.file_type().map(|t| t.is_file()).unwrap_or(false) {
                return WalkState::Continue;
            }
            let path = dent.path();
            let rel = match path.strip_prefix(&root_path) {
                Ok(r) => to_canon(r),
                Err(_) => return WalkState::Continue,
            };
            if let Some(set) = globs.as_ref() {
                if !set.is_match(&rel) {
                    return WalkState::Continue;
                }
            }
            if let Ok(meta) = std::fs::metadata(path) {
                if meta.len() > FILE_SIZE_CAP {
                    return WalkState::Continue;
                }
            }

            scanned.fetch_add(1, Ordering::Relaxed);

            let abs = display_path(path, &root_path, &root_display, &workspace);
            let rel_clone = rel.clone();
            let mut searcher = SearcherBuilder::new()
                .binary_detection(BinaryDetection::quit(b'\x00'))
                .line_number(true)
                .build();

            let mut sink_ticks = 0usize;
            let _ = searcher.search_path(
                &matcher,
                path,
                UTF8(|line_num, text| {
                    sink_ticks += 1;
                    if sink_ticks.is_multiple_of(128) && cancel() {
                        return Ok(false);
                    }
                    let line_text = text.trim_end_matches('\n').to_string();
                    let mut guard = hits.lock().unwrap();
                    if guard.len() >= cap {
                        truncated.store(true, Ordering::Relaxed);
                        return Ok(false);
                    }
                    guard.push(GrepHit {
                        path: abs.clone(),
                        rel: rel_clone.clone(),
                        line: line_num,
                        text: line_text,
                    });
                    Ok(true)
                }),
            );

            WalkState::Continue
        })
    });

    let final_hits = Arc::try_unwrap(hits)
        .map(|m| m.into_inner().unwrap())
        .unwrap_or_default();

    GrepResponse {
        hits: final_hits,
        truncated: truncated.load(Ordering::Relaxed),
        files_scanned: scanned.load(Ordering::Relaxed),
    }
}

#[tauri::command]
pub fn fs_grep(
    pattern: String,
    root: String,
    glob: Option<Vec<String>>,
    case_insensitive: Option<bool>,
    max_results: Option<usize>,
    workspace: Option<WorkspaceEnv>,
) -> Result<GrepResponse, String> {
    if pattern.is_empty() {
        return Err("empty pattern".into());
    }
    let workspace = WorkspaceEnv::from_option(workspace);
    let root_path = resolve_path(&root, &workspace);
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    let cap = max_results
        .unwrap_or(DEFAULT_MAX_RESULTS)
        .clamp(1, HARD_MAX_RESULTS);

    let matcher = RegexMatcherBuilder::new()
        .case_insensitive(case_insensitive.unwrap_or(false))
        .line_terminator(Some(b'\n'))
        .build(&pattern)
        .map_err(|e| format!("bad regex: {e}"))?;

    let globs = build_globset(glob.as_deref().unwrap_or(&[]))?;

    Ok(search_tree(
        &root_path,
        &root,
        &workspace,
        &matcher,
        &globs,
        cap,
        &|| false,
    ))
}

/// Interactive content search for the command palette. Treats the query as a
/// literal (smart-case), and self-cancels when a newer query arrives.
#[tauri::command]
pub fn fs_grep_interactive(
    state: tauri::State<'_, ContentSearchState>,
    pattern: String,
    root: String,
    request_id: u64,
    max_results: Option<usize>,
    workspace: Option<WorkspaceEnv>,
) -> Result<GrepResponse, String> {
    if pattern.trim().is_empty() {
        return Err("empty pattern".into());
    }
    let (my_gen, cancelled) = state.begin(request_id);
    if cancelled {
        return Ok(GrepResponse {
            hits: Vec::new(),
            truncated: true,
            files_scanned: 0,
        });
    }

    let workspace = WorkspaceEnv::from_option(workspace);
    let root_path = resolve_path(&root, &workspace);
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    let cap = max_results
        .unwrap_or(DEFAULT_MAX_RESULTS)
        .clamp(1, HARD_MAX_RESULTS);

    let matcher = RegexMatcherBuilder::new()
        .case_smart(true)
        .line_terminator(Some(b'\n'))
        .build(&escape_literal(&pattern))
        .map_err(|e| format!("bad pattern: {e}"))?;

    let cancel = || state.is_cancelled(my_gen);
    Ok(search_tree(
        &root_path, &root, &workspace, &matcher, &None, cap, &cancel,
    ))
}

/// Cancels one interactive content search by its client request id. A cancel
/// that arrives before the search starts is remembered, and a stale cancel
/// never stops a newer query.
#[tauri::command]
pub fn fs_grep_cancel(state: tauri::State<'_, ContentSearchState>, request_id: u64) {
    state.cancel(request_id);
}

#[derive(Serialize)]
pub struct GlobHit {
    pub path: String,
    pub rel: String,
}

#[derive(Serialize)]
pub struct GlobResponse {
    pub hits: Vec<GlobHit>,
    pub truncated: bool,
}

#[tauri::command]
pub fn fs_glob(
    pattern: String,
    root: String,
    max_results: Option<usize>,
    workspace: Option<WorkspaceEnv>,
) -> Result<GlobResponse, String> {
    if pattern.is_empty() {
        return Err("empty pattern".into());
    }
    let workspace = WorkspaceEnv::from_option(workspace);
    let root_path = resolve_path(&root, &workspace);
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    let cap = max_results.unwrap_or(500).clamp(1, HARD_MAX_RESULTS);

    let glob = Glob::new(&pattern).map_err(|e| format!("bad glob: {e}"))?;
    let mut gb = GlobSetBuilder::new();
    gb.add(glob);
    let set = gb.build().map_err(|e| format!("globset build: {e}"))?;

    let walker = WalkBuilder::new(&root_path)
        .hidden(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .ignore(true)
        .parents(true)
        .follow_links(false)
        .build();

    let mut hits: Vec<GlobHit> = Vec::new();
    let mut truncated = false;
    for dent in walker.flatten() {
        if hits.len() >= cap {
            truncated = true;
            break;
        }
        if !dent.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }
        let path = dent.path();
        let rel = match path.strip_prefix(&root_path) {
            Ok(r) => to_canon(r),
            Err(_) => continue,
        };
        if !set.is_match(&rel) {
            continue;
        }
        hits.push(GlobHit {
            path: display_path(path, &root_path, &root, &workspace),
            rel,
        });
    }

    Ok(GlobResponse { hits, truncated })
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::AtomicBool;
    use std::sync::{Condvar, Mutex};
    use std::time::{Duration, Instant};

    use super::*;

    #[test]
    fn escape_literal_escapes_regex_meta() {
        assert_eq!(escape_literal("a.b(c)"), "a\\.b\\(c\\)");
        assert_eq!(escape_literal("plain text"), "plain text");
    }

    #[test]
    fn search_tree_respects_cancellation() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "hello\nfind me here\n").unwrap();
        let matcher = RegexMatcherBuilder::new().build("find").unwrap();
        let ws = WorkspaceEnv::from_option(None);
        let root_display = dir.path().to_string_lossy().to_string();

        let live = search_tree(
            dir.path(),
            &root_display,
            &ws,
            &matcher,
            &None,
            100,
            &|| false,
        );
        assert_eq!(live.hits.len(), 1, "uncancelled search finds the match");

        let stopped = search_tree(
            dir.path(),
            &root_display,
            &ws,
            &matcher,
            &None,
            100,
            &|| true,
        );
        assert!(stopped.hits.is_empty(), "cancelled search yields nothing");
    }

    #[test]
    fn cancellation_targets_only_the_current_request() {
        let state = ContentSearchState::default();
        let (gen_a, cancelled_a) = state.begin(1);
        assert!(!cancelled_a);
        let (gen_b, cancelled_b) = state.begin(2);
        assert!(!cancelled_b);
        assert!(state.is_cancelled(gen_a), "a newer request supersedes the old one");

        state.cancel(1);
        assert!(!state.is_cancelled(gen_b), "a stale cancel does not stop the current request");

        state.cancel(2);
        assert!(state.is_cancelled(gen_b));
    }

    #[test]
    fn cancellation_before_start_is_remembered() {
        let state = ContentSearchState::default();
        state.cancel(7);
        let (_gen, cancelled) = state.begin(7);
        assert!(cancelled, "the search never starts after an early cancel");
        let (_gen, next_cancelled) = state.begin(8);
        assert!(!next_cancelled, "a later request is not affected");
    }

    #[test]
    fn overlapping_searches_stop_the_superseded_one() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..20 {
            std::fs::write(dir.path().join(format!("f{i}.txt")), "needle here\n").unwrap();
        }
        let matcher = RegexMatcherBuilder::new().build("needle").unwrap();
        let ws = WorkspaceEnv::from_option(None);
        let root = dir.path().to_path_buf();
        let root_display = dir.path().to_string_lossy().to_string();

        let gate = Arc::new((Mutex::new(false), Condvar::new()));
        let cancelled = Arc::new(AtomicBool::new(false));
        let waiting = Arc::new(AtomicUsize::new(0));

        let first = {
            let gate = Arc::clone(&gate);
            let cancelled = Arc::clone(&cancelled);
            let waiting = Arc::clone(&waiting);
            let matcher = matcher.clone();
            let ws = ws.clone();
            let root = root.clone();
            let root_display = root_display.clone();
            std::thread::spawn(move || {
                search_tree(&root, &root_display, &ws, &matcher, &None, 100, &|| {
                    waiting.fetch_add(1, Ordering::SeqCst);
                    let (lock, cv) = &*gate;
                    let mut released = lock.lock().unwrap();
                    while !*released {
                        released = cv.wait(released).unwrap();
                    }
                    cancelled.load(Ordering::SeqCst)
                })
            })
        };

        let deadline = Instant::now() + Duration::from_secs(5);
        while waiting.load(Ordering::SeqCst) == 0 {
            assert!(Instant::now() < deadline, "the first search never started");
            std::thread::yield_now();
        }

        let second = search_tree(&root, &root_display, &ws, &matcher, &None, 100, &|| false);
        assert_eq!(second.hits.len(), 20, "the latest search sees every file");

        cancelled.store(true, Ordering::SeqCst);
        {
            let (lock, cv) = &*gate;
            *lock.lock().unwrap() = true;
            cv.notify_all();
        }

        let first = first.join().unwrap();
        assert!(first.hits.is_empty(), "the superseded search stopped without hits");
    }
}
