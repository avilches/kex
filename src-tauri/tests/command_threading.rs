//! A `#[tauri::command]` without `async` runs on the main thread, the one that paints and
//! handles input. A command that reads files, walks a tree, spawns a process or waits on a lock
//! must be `#[tauri::command(async)]` or an `async fn`. The commands below are the ones that
//! may stay on the main thread, each with the reason; a new synchronous command fails here
//! until someone decides it belongs in this list.

use std::fs;
use std::path::{Path, PathBuf};

const MAIN_THREAD: &[(&str, &str)] = &[
    // Window and webview APIs only work from the main thread.
    ("float_browser_close", "webview API"),
    ("float_browser_dock", "webview API"),
    ("float_browser_focus", "webview API"),
    ("float_browser_navigate", "webview API"),
    ("float_browser_open", "webview API"),
    ("sync_menu", "menu API"),
    ("restore_window_geometry", "window API"),
    ("enter_windowless_mode", "flips an atomic"),
    (
        "confirm_quit",
        "counts the windows that flushed; the exit has to be requested from here",
    ),
    ("cancel_quit", "flips an atomic and emits an event"),
    // Known debt: these write the state to disk on the main thread. They stay here only because
    // a second save must not overtake the first; a single-writer queue would let them leave.
    ("window_get_state", "reads the in-memory state"),
    ("window_save_workspace_state", "ordered write, see above"),
    ("window_save_sidebar", "ordered write, see above"),
    ("window_save_workspace_bar", "ordered write, see above"),
    ("window_save_collapsed_groups", "ordered write, see above"),
    ("window_save_groups", "ordered write, see above"),
    // Per keystroke, and the order of the writes is the order of the input.
    // Known risk: write_all blocks if the child stops reading and the kernel buffer fills, which
    // would freeze the UI. Order is the reason it stays; a writer thread per session would fix both.
    ("pty_write", "ordered input to the shell"),
    ("pty_resize", "ordered with the output it reflows"),
    (
        "pty_close",
        "kills the shell and hands the drop to its own thread",
    ),
    (
        "pty_close_all",
        "kills the shells and hands each drop to its own thread",
    ),
    // The watch table counts references, so an add must not be overtaken by its remove.
    // fs_watch_add also canonicalizes and stats every path it is given, so it is cheap only on a
    // healthy disk.
    ("fs_watch_add", "ordered reference counting"),
    ("fs_watch_remove", "ordered reference counting"),
    // One filesystem call.
    // A single call, but one that blocks on a hung mount (a network share, the vault while it is
    // being unlocked).
    ("fs_stat", "one metadata call"),
    ("fs_canonicalize", "one filesystem call"),
    ("fs_create_dir", "one filesystem call"),
    ("fs_create_file", "one filesystem call"),
    ("fs_rename", "one filesystem call"),
    // Flags and counters only.
    ("fs_grep_cancel", "flips an atomic"),
    ("fs_duplicate_cancel", "flips an atomic"),
    ("claim_startup_scan", "process-wide flag"),
    ("claim_seed_lease", "process-wide lease, one mutex"),
    ("release_seed_lease", "process-wide lease, one mutex"),
    ("claim_onboarding_startup", "process-wide flag"),
    (
        "set_onboarding_open",
        "a value in memory, and the menu and window APIs when the block changes",
    ),
    ("request_onboarding_restart", "emits an event"),
    ("claim_update_check", "process-wide flag"),
    ("claim_update_install", "process-wide flag"),
    ("release_update_install", "process-wide flag"),
    ("get_build_info", "compile-time constants"),
    ("get_launch_dir", "takes a value out of a mutex"),
    ("take_pending_open_folders", "takes a value out of a mutex"),
    ("request_theme_edit", "emits an event"),
    // In memory, or the work is handed to another thread.
    ("shell_bg_logs", "reads an in-memory ring"),
    ("shell_bg_kill", "signals the process"),
    ("shell_bg_list", "reads in-memory handles"),
    ("shell_session_close", "drops an in-memory session"),
    (
        "agent_os_notify",
        "macOS hands the notification to its own thread; elsewhere the plugin call runs here",
    ),
];

struct Command {
    name: String,
    file: PathBuf,
    is_async: bool,
}

fn rust_files(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(dir).unwrap().filter_map(Result::ok) {
        let path = entry.path();
        if path.is_dir() {
            rust_files(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

fn commands() -> Vec<Command> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut files = Vec::new();
    rust_files(&root, &mut files);
    let mut found = Vec::new();
    for file in files {
        let text = fs::read_to_string(&file).unwrap();
        let lines: Vec<&str> = text.lines().collect();
        for (i, line) in lines.iter().enumerate() {
            let trimmed = line.trim_start();
            if !trimmed.starts_with("#[tauri::command") {
                continue;
            }
            let attribute_async = trimmed.contains("async");
            let Some(signature) = lines[i + 1..]
                .iter()
                .map(|l| l.trim_start())
                .find(|l| !l.starts_with("///") && !l.starts_with("#["))
            else {
                continue;
            };
            let signature = signature.strip_prefix("pub ").unwrap_or(signature);
            let (is_async, rest) = match signature.strip_prefix("async fn ") {
                Some(rest) => (true, rest),
                None => match signature.strip_prefix("fn ") {
                    Some(rest) => (false, rest),
                    None => continue,
                },
            };
            let name: String = rest
                .chars()
                .take_while(|c| c.is_alphanumeric() || *c == '_')
                .collect();
            found.push(Command {
                name,
                file: file.clone(),
                is_async: is_async || attribute_async,
            });
        }
    }
    found
}

#[test]
fn the_scan_sees_the_commands() {
    let all = commands();
    assert!(all.len() > 100, "only {} commands found", all.len());
    assert!(all.iter().any(|c| c.is_async), "no async command found");
    assert!(all.iter().any(|c| !c.is_async), "no sync command found");
}

#[test]
fn every_synchronous_command_is_a_known_main_thread_command() {
    let allowed: Vec<&str> = MAIN_THREAD.iter().map(|(name, _)| *name).collect();
    let unknown: Vec<String> = commands()
        .into_iter()
        .filter(|c| !c.is_async && !allowed.contains(&c.name.as_str()))
        .map(|c| format!("{} ({})", c.name, c.file.display()))
        .collect();
    assert!(
        unknown.is_empty(),
        "these commands run on the main thread: make them `#[tauri::command(async)]` or list them in MAIN_THREAD with the reason:\n{}",
        unknown.join("\n")
    );
}

#[test]
fn the_main_thread_list_has_no_stale_entries() {
    let all = commands();
    let stale: Vec<&str> = MAIN_THREAD
        .iter()
        .map(|(name, _)| *name)
        .filter(|name| !all.iter().any(|c| c.name == *name && !c.is_async))
        .collect();
    assert!(
        stale.is_empty(),
        "listed as main-thread but missing or already async: {stale:?}"
    );
}

#[test]
fn no_command_is_listed_twice() {
    let mut names: Vec<&str> = MAIN_THREAD.iter().map(|(name, _)| *name).collect();
    names.sort_unstable();
    let before = names.len();
    names.dedup();
    assert_eq!(before, names.len(), "duplicate entries in MAIN_THREAD");
}
