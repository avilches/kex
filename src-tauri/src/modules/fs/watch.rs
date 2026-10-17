use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::modules::fs::to_canon;
use crate::modules::workspace::{resolve_path, WorkspaceEnv};

// Quiet-gap before a batch flushes; MAX_WINDOW caps latency under a long stream.
const DEBOUNCE: Duration = Duration::from_millis(150);
const MAX_WINDOW: Duration = Duration::from_millis(1000);

// Upper bound on distinct watched directories: each one costs an OS watch handle
// (inotify and kqueue both have per-user limits), and the explorer adds one per
// expanded folder, so an unbounded caller could exhaust them for the whole machine.
const MAX_WATCHES: usize = 2048;

// Matched on the final path component. Never watched even when expanded: large
// or generated trees where live updates cost more than they're worth.
const SKIP_DIRS: &[&str] = &[
    // VCS
    ".git",
    ".hg",
    ".svn",
    ".jj",
    // JS / web
    "node_modules",
    "bower_components",
    ".pnpm-store",
    ".yarn",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".astro",
    ".vite",
    ".turbo",
    ".parcel-cache",
    ".angular",
    ".vercel",
    ".netlify",
    ".output",
    ".cache",
    // Rust
    "target",
    // Python
    "__pycache__",
    ".venv",
    "venv",
    ".tox",
    ".nox",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".ipynb_checkpoints",
    ".eggs",
    // JVM / Gradle
    ".gradle",
    // .NET
    "obj",
    // Go / PHP
    "vendor",
    // Elixir
    "_build",
    "deps",
    // Dart / Flutter
    ".dart_tool",
    // Haskell
    "dist-newstyle",
    ".stack-work",
    // Swift / Zig
    ".build",
    "zig-cache",
    "zig-out",
    // CMake (CLion)
    "cmake-build-debug",
    "cmake-build-release",
    // IDE / coverage / infra
    ".idea",
    "coverage",
    ".nyc_output",
    ".terraform",
];

fn is_skipped(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| SKIP_DIRS.contains(&n))
}

#[derive(Default)]
pub struct FsWatchState {
    inner: Mutex<Option<WatchInner>>,
}

// Canonical dir -> how many requesters asked for it under each spelling. Events
// carry canonical paths (the symlink target), but tabs and the explorer hold the
// path as the user opened it, so each event is also emitted under that spelling.
type Aliases = HashMap<PathBuf, HashMap<String, usize>>;

struct WatchInner {
    watcher: RecommendedWatcher,
    aliases: Aliases,
    // Explorer (expanded dirs) and editor (dirs of open files) can request the
    // same dir; unwatch only when the last requester releases it.
    refcounts: HashMap<PathBuf, usize>,
}

#[derive(Clone, serde::Serialize)]
struct ChangedPayload {
    paths: Vec<String>,
}

fn ensure_started(state: &FsWatchState, app: &AppHandle) -> Result<(), String> {
    let mut guard = state.inner.lock().expect("fs watch state poisoned");
    if guard.is_some() {
        return Ok(());
    }

    let (tx, rx) = mpsc::channel::<notify::Result<Event>>();
    let watcher = RecommendedWatcher::new(
        move |res| {
            let _ = tx.send(res);
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    let app = app.clone();
    std::thread::Builder::new()
        .name("kex-fs-watch".into())
        .spawn(move || drain_loop(rx, app))
        .map_err(|e| e.to_string())?;

    *guard = Some(WatchInner {
        watcher,
        aliases: Aliases::new(),
        refcounts: HashMap::new(),
    });
    Ok(())
}

fn drain_loop(rx: mpsc::Receiver<notify::Result<Event>>, app: AppHandle) {
    loop {
        let first = match rx.recv() {
            Ok(ev) => ev,
            Err(_) => return,
        };

        let mut paths: HashSet<String> = HashSet::new();
        collect(&mut paths, first);

        let deadline = Instant::now() + MAX_WINDOW;
        loop {
            let timeout = DEBOUNCE.min(deadline.saturating_duration_since(Instant::now()));
            match rx.recv_timeout(timeout) {
                Ok(ev) => collect(&mut paths, ev),
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => return,
            }
            if Instant::now() >= deadline {
                break;
            }
        }

        if paths.is_empty() {
            continue;
        }
        if let Some(inner) = app
            .state::<FsWatchState>()
            .inner
            .lock()
            .expect("fs watch state poisoned")
            .as_ref()
        {
            expand_aliases(&mut paths, &inner.aliases);
        }
        let _ = app.emit(
            "fs:changed",
            ChangedPayload {
                paths: paths.into_iter().collect(),
            },
        );
    }
}

fn collect(set: &mut HashSet<String>, ev: notify::Result<Event>) {
    let Ok(ev) = ev else { return };
    if matches!(ev.kind, EventKind::Access(_)) {
        return;
    }
    for p in ev.paths {
        set.insert(to_canon(&p));
    }
}

fn register_alias(aliases: &mut Aliases, canonical: &Path, spelled: &str) {
    if canonical.as_os_str() == spelled {
        return;
    }
    *aliases
        .entry(canonical.to_path_buf())
        .or_default()
        .entry(spelled.to_string())
        .or_insert(0) += 1;
}

fn release_alias(aliases: &mut Aliases, canonical: &Path, spelled: &str) {
    let Some(spellings) = aliases.get_mut(canonical) else {
        return;
    };
    match spellings.get_mut(spelled) {
        Some(n) if *n > 1 => *n -= 1,
        Some(_) => {
            spellings.remove(spelled);
        }
        None => {}
    }
    if spellings.is_empty() {
        aliases.remove(canonical);
    }
}

fn expand_aliases(paths: &mut HashSet<String>, aliases: &Aliases) {
    if aliases.is_empty() {
        return;
    }
    let mut extra = Vec::new();
    for path in paths.iter() {
        let path = Path::new(path);
        for (canonical, spellings) in aliases {
            let Ok(rel) = path.strip_prefix(canonical) else {
                continue;
            };
            for spelled in spellings.keys() {
                // join("") appends a trailing slash, which would not equal the watched dir itself.
                let aliased = if rel.as_os_str().is_empty() {
                    Path::new(spelled).to_path_buf()
                } else {
                    Path::new(spelled).join(rel)
                };
                extra.push(to_canon(aliased));
            }
        }
    }
    paths.extend(extra);
}

fn add_paths(inner: &mut WatchInner, paths: Vec<(PathBuf, String)>) {
    for (canonical, spelled) in paths {
        register_alias(&mut inner.aliases, &canonical, &spelled);
        let current = inner.refcounts.get(&canonical).copied().unwrap_or(0);
        if current == 0 {
            match inner.watcher.watch(&canonical, RecursiveMode::NonRecursive) {
                Ok(()) => {
                    inner.refcounts.insert(canonical, 1);
                }
                Err(e) => log::debug!("fs_watch add {} failed: {e}", canonical.display()),
            }
        } else {
            inner.refcounts.insert(canonical, current + 1);
        }
    }
}

fn remove_paths(inner: &mut WatchInner, paths: Vec<(PathBuf, String)>) {
    for (key, spelled) in paths {
        release_alias(&mut inner.aliases, &key, &spelled);
        let current = inner.refcounts.get(&key).copied().unwrap_or(0);
        if current <= 1 {
            inner.refcounts.remove(&key);
            let _ = inner.watcher.unwatch(&key);
        } else {
            inner.refcounts.insert(key, current - 1);
        }
    }
}

// Canonical keys keep add/remove symmetric regardless of how the path was spelled.
// No authorization check: the explorer reads any directory it navigates to
// (fs_read_dir is unguarded), so refusing to watch one the shell reached with
// `cd` only left its listing frozen.
fn prepare_add(workspace: &WorkspaceEnv, paths: Vec<String>) -> Vec<(PathBuf, String)> {
    paths
        .into_iter()
        .filter_map(|raw| {
            let resolved = resolve_path(&raw, workspace);
            let canonical = std::fs::canonicalize(&resolved).ok()?;
            if !canonical.is_dir() || is_skipped(&canonical) {
                return None;
            }
            Some((canonical, to_canon(&resolved)))
        })
        .collect()
}

// Directories already watched only gain a refcount, so only new ones count.
fn check_capacity(watched: usize, new_dirs: usize) -> Result<(), String> {
    if watched + new_dirs > MAX_WATCHES {
        return Err(format!(
            "too many watched directories (limit {MAX_WATCHES})"
        ));
    }
    Ok(())
}

fn count_new_dirs(inner: &WatchInner, prepared: &[(PathBuf, String)]) -> usize {
    prepared
        .iter()
        .map(|(canonical, _)| canonical)
        .filter(|c| !inner.refcounts.contains_key(*c))
        .collect::<HashSet<_>>()
        .len()
}

#[tauri::command]
pub fn fs_watch_add(
    paths: Vec<String>,
    workspace: Option<WorkspaceEnv>,
    app: AppHandle,
    state: State<'_, FsWatchState>,
) -> Result<(), String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    let prepared = prepare_add(&workspace, paths);
    if prepared.is_empty() {
        return Ok(());
    }
    ensure_started(&state, &app)?;
    let mut guard = state.inner.lock().expect("fs watch state poisoned");
    if let Some(inner) = guard.as_mut() {
        check_capacity(inner.refcounts.len(), count_new_dirs(inner, &prepared))?;
        add_paths(inner, prepared);
    }
    Ok(())
}

#[tauri::command]
pub fn fs_watch_remove(
    paths: Vec<String>,
    workspace: Option<WorkspaceEnv>,
    state: State<'_, FsWatchState>,
) -> Result<(), String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    // A removed/renamed dir no longer canonicalizes; fall back so the refcount
    // entry is still released.
    let prepared: Vec<(PathBuf, String)> = paths
        .into_iter()
        .map(|raw| {
            let resolved = resolve_path(&raw, &workspace);
            let spelled = to_canon(&resolved);
            (
                std::fs::canonicalize(&resolved).unwrap_or(resolved),
                spelled,
            )
        })
        .collect();
    let mut guard = state.inner.lock().expect("fs watch state poisoned");
    if let Some(inner) = guard.as_mut() {
        remove_paths(inner, prepared);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prepare_add_accepts_a_dir_outside_every_authorized_root() {
        let dir = std::env::temp_dir().join(format!("kex-watch-unauth-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let prepared = prepare_add(
            &WorkspaceEnv::Local,
            vec![dir.to_string_lossy().into_owned()],
        );
        std::fs::remove_dir_all(&dir).ok();
        assert_eq!(prepared.len(), 1);
    }

    #[test]
    fn capacity_rejects_going_over_the_limit() {
        assert!(check_capacity(0, MAX_WATCHES).is_ok());
        assert!(check_capacity(MAX_WATCHES, 0).is_ok());
        assert!(check_capacity(MAX_WATCHES, 1).is_err());
        assert!(check_capacity(MAX_WATCHES - 1, 2).is_err());
    }

    #[test]
    fn expand_keeps_the_watched_directory_itself_without_a_trailing_slash() {
        let aliases = aliases_of("/real/dir", "/link/dir");
        let mut paths = HashSet::from(["/real/dir".to_string()]);
        expand_aliases(&mut paths, &aliases);
        assert!(paths.contains("/link/dir"));
        assert!(!paths.contains("/link/dir/"));
    }

    #[test]
    fn skip_filter_matches_basename() {
        assert!(is_skipped(Path::new("/a/b/node_modules")));
        assert!(is_skipped(Path::new("/x/target")));
        assert!(is_skipped(Path::new("/p/obj")));
        assert!(!is_skipped(Path::new("/a/src")));
        assert!(!is_skipped(Path::new("/a/node_modules/pkg")));
    }

    #[test]
    fn collect_ignores_access_and_dedups() {
        let mut set = HashSet::new();
        collect(
            &mut set,
            Ok(Event {
                kind: EventKind::Access(notify::event::AccessKind::Read),
                paths: vec![PathBuf::from("/a/x")],
                attrs: Default::default(),
            }),
        );
        assert!(set.is_empty());

        let modify = || {
            Ok(Event {
                kind: EventKind::Modify(notify::event::ModifyKind::Any),
                paths: vec![PathBuf::from("/a/x")],
                attrs: Default::default(),
            })
        };
        collect(&mut set, modify());
        collect(&mut set, modify());
        assert_eq!(set.len(), 1);
    }

    fn aliases_of(canon: &str, spelled: &str) -> Aliases {
        let mut aliases = Aliases::new();
        register_alias(&mut aliases, Path::new(canon), spelled);
        aliases
    }

    #[test]
    fn expand_adds_the_path_as_the_directory_was_requested() {
        let aliases = aliases_of("/vol/mnt/Hub/Finance", "/home/u/Hub/Data/Finance");
        let mut paths = HashSet::from(["/vol/mnt/Hub/Finance/FBAR.md".to_string()]);
        expand_aliases(&mut paths, &aliases);
        assert!(paths.contains("/vol/mnt/Hub/Finance/FBAR.md"));
        assert!(paths.contains("/home/u/Hub/Data/Finance/FBAR.md"));
        assert_eq!(paths.len(), 2);
    }

    #[test]
    fn expand_leaves_unrelated_and_identical_spellings_alone() {
        let aliases = aliases_of("/a/real", "/a/real");
        let mut paths = HashSet::from(["/a/real/x".to_string(), "/b/other/y".to_string()]);
        expand_aliases(&mut paths, &aliases);
        assert_eq!(paths.len(), 2);

        let aliases = aliases_of("/a/real", "/a/link");
        let mut paths = HashSet::from(["/a/realistic/x".to_string()]);
        expand_aliases(&mut paths, &aliases);
        assert_eq!(
            paths.len(),
            1,
            "a sibling that merely shares a prefix is not under the dir"
        );
    }

    #[test]
    fn two_spellings_of_one_directory_are_both_expanded_until_released() {
        let mut aliases = aliases_of("/real", "/link1");
        register_alias(&mut aliases, Path::new("/real"), "/link2");
        register_alias(&mut aliases, Path::new("/real"), "/link2");

        let mut paths = HashSet::from(["/real/f".to_string()]);
        expand_aliases(&mut paths, &aliases);
        assert!(paths.contains("/link1/f") && paths.contains("/link2/f"));

        release_alias(&mut aliases, Path::new("/real"), "/link1");
        release_alias(&mut aliases, Path::new("/real"), "/link2");
        let mut paths = HashSet::from(["/real/f".to_string()]);
        expand_aliases(&mut paths, &aliases);
        assert!(!paths.contains("/link1/f"));
        assert!(
            paths.contains("/link2/f"),
            "one requester of /link2 is still left"
        );

        release_alias(&mut aliases, Path::new("/real"), "/link2");
        assert!(
            aliases.is_empty(),
            "the directory entry goes with its last alias"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_real_symlink_resolves_back_to_the_spelling_the_tab_uses() {
        let tmp = tempfile::tempdir().unwrap();
        let real = tmp.path().join("real");
        std::fs::create_dir(&real).unwrap();
        let link = tmp.path().join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();

        let canonical = std::fs::canonicalize(&link).unwrap();
        let mut aliases = Aliases::new();
        register_alias(&mut aliases, &canonical, &to_canon(&link));

        let mut paths = HashSet::from([to_canon(canonical.join("note.md"))]);
        expand_aliases(&mut paths, &aliases);
        assert!(paths.contains(&to_canon(link.join("note.md"))));
    }
}
