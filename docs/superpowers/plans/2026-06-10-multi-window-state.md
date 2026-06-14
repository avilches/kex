# Multi-window state Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dual-file window state system with a single `terax-windows.json` that stores geometry and workspaces per-window, making all windows equal with no special `"main"` label.

**Architecture:** A new `WindowStateManager` Rust struct owns the on-disk state, exposed via two IPC commands (`window_get_state`, `window_save_workspace_state`). `setup()` reads the file and opens all saved windows; each window registers its own `on_window_event` handler to save geometry and manage settings lifecycle. The frontend `workspaceState.ts` replaces its `LazyStore` calls with these two IPC commands, keeping the same external API so `main.tsx` and `App.tsx` need no changes.

**Tech Stack:** Rust (serde_json, std::sync::RwLock), Tauri 2 (AppHandle, WebviewWindowBuilder, Manager), TypeScript (invoke from @tauri-apps/api/core)

---

## File map

**Create:**
- `src-tauri/src/modules/window_state.rs` — `WindowStateManager` + data types + unit tests

**Modify:**
- `src-tauri/src/modules/mod.rs` — add `pub mod window_state;`
- `src-tauri/src/lib.rs` — remove window-state plugin, add manager, rewrite setup/window creation/IPC commands
- `src-tauri/Cargo.toml` — remove `tauri-plugin-window-state`
- `src-tauri/tauri.conf.json` — remove default window entry
- `src/modules/workspaces/lib/workspaceState.ts` — replace LazyStore with IPC calls

---

## Task 1: Rust `WindowStateManager`

**Files:**
- Create: `src-tauri/src/modules/window_state.rs`
- Modify: `src-tauri/src/modules/mod.rs`

- [ ] **Step 1: Add `pub mod window_state;` to mod.rs**

Open `src-tauri/src/modules/mod.rs`. Current contents:
```
pub mod agent;
pub mod fs;
pub mod git;
pub mod history;
pub mod proc;
pub mod pty;
pub mod shell;
pub mod workspace;
```

Add one line at the end:
```
pub mod window_state;
```

- [ ] **Step 2: Create `window_state.rs` with data types and manager**

Create `src-tauri/src/modules/window_state.rs` with this exact content:

```rust
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::RwLock;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

impl Default for WindowGeometry {
    fn default() -> Self {
        Self { x: 0, y: 0, width: 1280, height: 800, maximized: false }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowEntry {
    #[serde(flatten)]
    pub geometry: WindowGeometry,
    pub workspaces: Value,
    pub active_index: usize,
}

impl Default for WindowEntry {
    fn default() -> Self {
        Self {
            geometry: WindowGeometry::default(),
            workspaces: Value::Array(vec![]),
            active_index: 0,
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowStateFile {
    version: u32,
    windows: HashMap<String, WindowEntry>,
    window_order: Vec<String>,
}

pub struct WindowStateManager {
    inner: RwLock<WindowStateFile>,
    path: PathBuf,
}

impl WindowStateManager {
    pub fn new(path: PathBuf) -> Self {
        Self { inner: RwLock::new(WindowStateFile::default()), path }
    }

    /// Returns true if the file was loaded successfully.
    pub fn load(&self) -> bool {
        let Ok(content) = std::fs::read_to_string(&self.path) else {
            return false;
        };
        let Ok(state) = serde_json::from_str::<WindowStateFile>(&content) else {
            return false;
        };
        *self.inner.write().expect("window state lock poisoned") = state;
        true
    }

    /// Atomic write: .tmp then rename so crashes can't corrupt the file.
    pub fn save(&self) {
        let state = self.inner.read().expect("window state lock poisoned").clone();
        let Ok(json) = serde_json::to_string_pretty(&state) else { return };
        let tmp = self.path.with_extension("json.tmp");
        if let Some(parent) = self.path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if std::fs::write(&tmp, json).is_ok() {
            let _ = std::fs::rename(&tmp, &self.path);
        }
    }

    pub fn window_order(&self) -> Vec<String> {
        self.inner.read().expect("window state lock poisoned").window_order.clone()
    }

    pub fn get_entry(&self, label: &str) -> Option<WindowEntry> {
        self.inner.read().expect("window state lock poisoned").windows.get(label).cloned()
    }

    pub fn add_window(&self, label: String) {
        let mut state = self.inner.write().expect("window state lock poisoned");
        state.windows.entry(label.clone()).or_default();
        if !state.window_order.contains(&label) {
            state.window_order.push(label);
        }
    }

    pub fn remove_window(&self, label: &str) {
        let mut state = self.inner.write().expect("window state lock poisoned");
        state.windows.remove(label);
        state.window_order.retain(|l| l != label);
    }

    pub fn update_workspace(&self, label: &str, workspaces: Value, active_index: usize) {
        let mut state = self.inner.write().expect("window state lock poisoned");
        if let Some(entry) = state.windows.get_mut(label) {
            entry.workspaces = workspaces;
            entry.active_index = active_index;
        }
    }

    pub fn update_geometry(
        &self,
        label: &str,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
        maximized: bool,
    ) {
        let mut state = self.inner.write().expect("window state lock poisoned");
        if let Some(entry) = state.windows.get_mut(label) {
            entry.geometry = WindowGeometry { x, y, width, height, maximized };
        }
    }
}

/// Generates a window label like "w-a3f9b2c1".
/// Uses low bits of Unix timestamp XOR'd with subsecond nanos for low collision probability.
pub fn generate_window_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let v = (d.as_secs() as u32) ^ d.subsec_nanos();
    format!("w-{:08x}", v)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn load_missing_file_returns_false_and_empty_order() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("terax-windows.json");
        let mgr = WindowStateManager::new(path);
        assert!(!mgr.load());
        assert!(mgr.window_order().is_empty());
    }

    #[test]
    fn add_and_remove_window() {
        let dir = TempDir::new().unwrap();
        let mgr = WindowStateManager::new(dir.path().join("state.json"));
        mgr.add_window("w-aabbccdd".to_string());
        assert_eq!(mgr.window_order(), vec!["w-aabbccdd"]);
        mgr.remove_window("w-aabbccdd");
        assert!(mgr.window_order().is_empty());
        assert!(mgr.get_entry("w-aabbccdd").is_none());
    }

    #[test]
    fn add_window_is_idempotent() {
        let dir = TempDir::new().unwrap();
        let mgr = WindowStateManager::new(dir.path().join("state.json"));
        mgr.add_window("w-aabbccdd".to_string());
        mgr.add_window("w-aabbccdd".to_string());
        assert_eq!(mgr.window_order().len(), 1);
    }

    #[test]
    fn save_and_reload() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("terax-windows.json");
        let mgr = WindowStateManager::new(path.clone());
        mgr.add_window("w-aabbccdd".to_string());
        mgr.update_workspace("w-aabbccdd", serde_json::json!([{"id": "ws1"}]), 2);
        mgr.save();

        let mgr2 = WindowStateManager::new(path);
        assert!(mgr2.load());
        let entry = mgr2.get_entry("w-aabbccdd").unwrap();
        assert_eq!(entry.workspaces, serde_json::json!([{"id": "ws1"}]));
        assert_eq!(entry.active_index, 2);
        assert_eq!(mgr2.window_order(), vec!["w-aabbccdd"]);
    }

    #[test]
    fn load_corrupt_file_returns_false_and_empty_order() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("terax-windows.json");
        std::fs::write(&path, "not valid json").unwrap();
        let mgr = WindowStateManager::new(path);
        assert!(!mgr.load());
        assert!(mgr.window_order().is_empty());
    }

    #[test]
    fn update_geometry_stores_values() {
        let dir = TempDir::new().unwrap();
        let mgr = WindowStateManager::new(dir.path().join("state.json"));
        mgr.add_window("w-aabbccdd".to_string());
        mgr.update_geometry("w-aabbccdd", 100, 200, 1280, 800, false);
        let entry = mgr.get_entry("w-aabbccdd").unwrap();
        assert_eq!(entry.geometry.x, 100);
        assert_eq!(entry.geometry.y, 200);
        assert_eq!(entry.geometry.width, 1280);
        assert_eq!(entry.geometry.height, 800);
        assert!(!entry.geometry.maximized);
    }

    #[test]
    fn update_geometry_on_unknown_label_is_noop() {
        let dir = TempDir::new().unwrap();
        let mgr = WindowStateManager::new(dir.path().join("state.json"));
        mgr.update_geometry("w-ghost", 0, 0, 100, 100, false);
        // No panic, no entry created
        assert!(mgr.get_entry("w-ghost").is_none());
    }
}
```

- [ ] **Step 3: Run the new tests**

```bash
cd src-tauri && cargo test --locked window_state 2>&1
```

Expected: all 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/modules/window_state.rs src-tauri/src/modules/mod.rs
git commit -m "feat: add WindowStateManager module"
```

---

## Task 2: Remove `tauri-plugin-window-state` and default window

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Remove plugin from `Cargo.toml`**

In `src-tauri/Cargo.toml`, find the platform-conditional dependencies section:
```toml
[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]
tauri-plugin-autostart = "2"
tauri-plugin-updater = "2"
tauri-plugin-window-state = "2"
```

Remove the `tauri-plugin-window-state = "2"` line, leaving:
```toml
[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]
tauri-plugin-autostart = "2"
tauri-plugin-updater = "2"
```

- [ ] **Step 2: Remove default window from `tauri.conf.json`**

In `src-tauri/tauri.conf.json`, find the `app.windows` array:
```json
"windows": [
  {
    "title": "Terax",
    "width": 800,
    "height": 600,
    "minWidth": 420,
    "minHeight": 280,
    "titleBarStyle": "Overlay",
    "hiddenTitle": true,
    "visible": false
  }
]
```

Replace with an empty array:
```json
"windows": []
```

- [ ] **Step 3: Verify cargo resolves without the plugin**

```bash
cd src-tauri && cargo check 2>&1 | head -30
```

This will fail at the `lib.rs` usages (expected — they'll be fixed in Task 3). What you should NOT see: any error about `tauri-plugin-window-state` being unresolved. If the only errors are about `StateFlags` or `tauri_plugin_window_state`, proceed.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "chore: remove tauri-plugin-window-state and hardcoded default window"
```

---

## Task 3: Rewrite `lib.rs` — window management

**Files:**
- Modify: `src-tauri/src/lib.rs`

This is the largest task. Replace the entire file with the new version below.

Key changes vs current:
- `use tauri_plugin_window_state::StateFlags;` removed
- `WindowEvent` import moved to all-platform (was macOS-only)
- `PhysicalPosition` stays macOS-only
- New helper `create_app_window()` extracted from `open_main_window()`
- `setup()` reads `terax-windows.json` and opens all saved windows
- `open_main_window()` generates a `w-<hex>` ID and calls `create_app_window()`
- `open_settings_window()` finds any `w-` window instead of `"main"` for parent/centering
- `window_label_suffix()` removed (replaced by `generate_window_id()` in the new module)
- Plugin registration block for `window-state` removed
- `setup()` macOS block that watched `"main"` replaced by per-window Destroyed listener in `create_app_window()`
- Two new IPC commands added: `window_get_state`, `window_save_workspace_state`

- [ ] **Step 1: Replace `lib.rs`**

```rust
pub mod modules;

use modules::{agent, fs, git, history, pty, shell, window_state, workspace};
use std::sync::Mutex;
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};
#[cfg(target_os = "macos")]
use tauri::PhysicalPosition;

/// Drained on first read so HMR / re-mounts can't replay the launch dir.
#[derive(Default)]
struct LaunchDir(Mutex<Option<String>>);

#[tauri::command]
fn get_launch_dir(state: State<'_, LaunchDir>) -> Option<String> {
    state.0.lock().expect("LaunchDir mutex poisoned").take()
}

fn parse_launch_dir() -> Option<String> {
    for arg in std::env::args().skip(1) {
        if arg.starts_with('-') {
            continue;
        }
        let Ok(canon) = std::fs::canonicalize(&arg) else {
            continue;
        };
        if !canon.is_dir() {
            continue;
        }
        return Some(crate::modules::fs::to_canon(&canon));
    }
    None
}

fn create_app_window(
    app: &tauri::AppHandle,
    label: String,
    entry: Option<&window_state::WindowEntry>,
) -> Result<(), String> {
    let (width, height) = entry
        .map(|e| (e.geometry.width as f64, e.geometry.height as f64))
        .unwrap_or((1280.0, 800.0));

    let builder =
        WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
            .title("Terax")
            .inner_size(width, height)
            .min_inner_size(640.0, 480.0)
            .resizable(true)
            .visible(false);

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    #[cfg(any(target_os = "linux", target_os = "windows"))]
    let builder = builder.decorations(false).transparent(true);

    let window = builder.build().map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    {
        let _ = window.set_decorations(false);
    }

    if let Some(e) = entry {
        if e.geometry.x != 0 || e.geometry.y != 0 {
            let _ = window.set_position(tauri::PhysicalPosition::new(
                e.geometry.x,
                e.geometry.y,
            ));
        }
        if e.geometry.maximized {
            let _ = window.maximize();
        }
    }

    // Save geometry + remove from state on close; close settings when last window.
    let app_handle = app.clone();
    let win_label = label.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { .. } => {
            let mgr = app_handle.state::<window_state::WindowStateManager>();
            if let Some(w) = app_handle.get_webview_window(&win_label) {
                if let (Ok(pos), Ok(size)) = (w.outer_position(), w.outer_size()) {
                    let maximized = w.is_maximized().unwrap_or(false);
                    mgr.update_geometry(
                        &win_label,
                        pos.x,
                        pos.y,
                        size.width,
                        size.height,
                        maximized,
                    );
                }
            }
            mgr.remove_window(&win_label);
            mgr.save();
        }
        WindowEvent::Destroyed => {
            let remaining = app_handle
                .webview_windows()
                .keys()
                .filter(|l| l.starts_with("w-"))
                .count();
            if remaining == 0 {
                if let Some(s) = app_handle.get_webview_window("settings") {
                    let _ = s.close();
                }
            }
        }
        _ => {}
    });

    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn open_settings_window(app: tauri::AppHandle, tab: Option<String>) -> Result<(), String> {
    let url_path = match tab.as_deref() {
        Some(t) if !t.is_empty() => format!("settings.html?tab={}", t),
        _ => "settings.html".to_string(),
    };

    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.set_always_on_top(true);
        let _ = window.show();
        let _ = window.set_focus();
        if let Some(t) = tab.as_deref().filter(|s| !s.is_empty()) {
            let _ = window.emit("terax:settings-tab", t);
        }
        return Ok(());
    }

    let builder = WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App(url_path.into()))
        .title("Settings")
        .inner_size(600.0, 700.0)
        .resizable(false)
        .visible(false)
        .always_on_top(true);

    // On non-macOS, set the active main window as parent so settings
    // minimizes with it.
    #[cfg(not(target_os = "macos"))]
    let builder = {
        let parent_win = app
            .webview_windows()
            .into_values()
            .find(|w| w.label().starts_with("w-"));
        match parent_win {
            Some(p) => builder.parent(&p).map_err(|e| e.to_string())?,
            None => builder,
        }
    };

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    #[cfg(any(target_os = "linux", target_os = "windows"))]
    let builder = builder.decorations(false).transparent(true);

    let window = builder.build().map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    {
        let _ = window.set_decorations(false);
    }

    #[cfg(target_os = "macos")]
    {
        let main_win = app
            .webview_windows()
            .into_values()
            .find(|w| w.label().starts_with("w-"));
        if let Some(main) = main_win {
            if let (Ok(main_pos), Ok(main_size), Ok(settings_size)) =
                (main.outer_position(), main.outer_size(), window.outer_size())
            {
                let x = main_pos.x
                    + ((main_size.width as i32).saturating_sub(settings_size.width as i32)) / 2;
                let y = main_pos.y
                    + ((main_size.height as i32).saturating_sub(settings_size.height as i32)) / 2;
                let _ = window.set_position(PhysicalPosition::new(x, y));
            } else {
                let _ = window.center();
            }
        } else {
            let _ = window.center();
        }
    }

    Ok(())
}

#[tauri::command]
async fn open_main_window(app: tauri::AppHandle) -> Result<(), String> {
    let id = window_state::generate_window_id();
    {
        let mgr = app.state::<window_state::WindowStateManager>();
        mgr.add_window(id.clone());
        mgr.save();
    }
    create_app_window(&app, id, None)
}

#[tauri::command]
fn window_get_state(
    app: tauri::AppHandle,
    label: String,
) -> Option<window_state::WindowEntry> {
    app.state::<window_state::WindowStateManager>().get_entry(&label)
}

#[tauri::command]
fn window_save_workspace_state(
    app: tauri::AppHandle,
    label: String,
    workspaces: serde_json::Value,
    active_index: usize,
) {
    let mgr = app.state::<window_state::WindowStateManager>();
    mgr.update_workspace(&label, workspaces, active_index);
    mgr.save();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cli_dir = parse_launch_dir();
    workspace::init_launch_cwd(cli_dir.as_deref());

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
            let state_path = data_dir.join("terax-windows.json");
            let mgr = window_state::WindowStateManager::new(state_path);
            mgr.load();
            let order = mgr.window_order();
            app.manage(mgr);

            let handle = app.handle().clone();
            if order.is_empty() {
                let id = window_state::generate_window_id();
                handle
                    .state::<window_state::WindowStateManager>()
                    .add_window(id.clone());
                create_app_window(&handle, id, None)
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            } else {
                let entries: Vec<_> = {
                    let m = handle.state::<window_state::WindowStateManager>();
                    order.iter().map(|id| (id.clone(), m.get_entry(id))).collect()
                };
                for (id, entry) in entries {
                    if let Err(e) = create_app_window(&handle, id.clone(), entry.as_ref()) {
                        eprintln!("terax: failed to restore window {id}: {e}");
                    }
                }
            }
            Ok(())
        })
        .manage(pty::PtyState::default())
        .manage(shell::ShellState::default())
        .manage(fs::watch::FsWatchState::default())
        .manage(history::HistoryState::default())
        .manage(fs::grep::ContentSearchState::default())
        .manage({
            let registry = workspace::WorkspaceRegistry::default();
            workspace::bootstrap_registry(&registry);
            if let Some(ref launch_dir) = cli_dir {
                let _ = registry.authorize(launch_dir);
            }
            registry
        })
        .manage(LaunchDir(Mutex::new(cli_dir)))
        .invoke_handler(tauri::generate_handler![
            pty::pty_open,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_close,
            pty::pty_close_all,
            pty::pty_has_foreground_process,
            pty::pty_shell_name,
            fs::tree::list_subdirs,
            fs::tree::fs_read_dir,
            fs::file::fs_read_file,
            fs::file::fs_write_file,
            fs::file::fs_stat,
            fs::file::fs_canonicalize,
            fs::mutate::fs_create_file,
            fs::mutate::fs_create_dir,
            fs::mutate::fs_rename,
            fs::mutate::fs_delete,
            fs::watch::fs_watch_add,
            fs::watch::fs_watch_remove,
            fs::search::fs_search,
            fs::search::fs_list_files,
            fs::grep::fs_grep,
            fs::grep::fs_grep_interactive,
            fs::grep::fs_glob,
            git::commands::git_resolve_repo,
            git::commands::git_panel_snapshot,
            git::commands::git_status,
            git::commands::git_diff,
            git::commands::git_diff_content,
            git::commands::git_stage,
            git::commands::git_unstage,
            git::commands::git_discard,
            git::commands::git_commit,
            git::commands::git_fetch,
            git::commands::git_pull_ff_only,
            git::commands::git_push,
            git::commands::git_log,
            git::commands::git_show_commit,
            git::commands::git_commit_files,
            git::commands::git_commit_file_diff,
            git::commands::git_remote_url,
            shell::shell_run_command,
            shell::shell_session_open,
            shell::shell_session_run,
            shell::shell_session_close,
            shell::shell_bg_spawn,
            shell::shell_bg_logs,
            shell::shell_bg_kill,
            shell::shell_bg_list,
            workspace::wsl_list_distros,
            workspace::wsl_default_distro,
            workspace::wsl_home,
            workspace::workspace_authorize,
            workspace::workspace_current_dir,
            get_launch_dir,
            open_settings_window,
            open_main_window,
            window_get_state,
            window_save_workspace_state,
            agent::agent_enable_claude_hooks,
            agent::agent_claude_hooks_status,
            history::history_suggest,
            history::history_commands,
            history::history_record,
            history::history_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: Run `cargo clippy`**

```bash
cd src-tauri && cargo clippy 2>&1
```

Expected: no errors. There may be warnings about unused imports or dead code — fix them inline if any appear. Common one: if `WindowEvent` import is unused on a platform, add the appropriate `#[allow(unused_imports)]` or move it behind a cfg gate.

- [ ] **Step 3: Run all Rust tests**

```bash
cd src-tauri && cargo test --locked 2>&1
```

Expected: all tests pass including the 7 window_state tests from Task 1.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: rewrite window management with WindowStateManager"
```

---

## Task 4: Frontend — rewrite `workspaceState.ts`

**Files:**
- Modify: `src/modules/workspaces/lib/workspaceState.ts`

The external API (`initWorkspaceState`, `getSavedWorkspaceState`, `saveWorkspaceState`) stays identical so `main.tsx` and `App.tsx` need no changes.

- [ ] **Step 1: Replace `workspaceState.ts`**

```typescript
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Panel, SplitNode, Workspace } from "./types";

type SavedState = { workspaces: Workspace[]; activeIndex: number };

// WindowEntry mirrors the Rust WindowEntry struct (camelCase via serde rename_all).
type WindowEntry = { workspaces: Workspace[]; activeIndex: number };

let cached: SavedState | null = null;

function sanitizePanel(p: Panel): Panel {
  if (p.kind === "editor") return { ...p, dirty: false };
  return p;
}

function sanitizeTree(node: SplitNode): SplitNode {
  if (node.kind === "pane") {
    return { ...node, panels: node.panels.map(sanitizePanel) };
  }
  return { ...node, first: sanitizeTree(node.first), second: sanitizeTree(node.second) };
}

function sanitizeWorkspace(w: Workspace): Workspace {
  return { ...w, paneTree: sanitizeTree(w.paneTree) };
}

export async function initWorkspaceState(): Promise<void> {
  try {
    const label = getCurrentWebviewWindow().label;
    const entry = await invoke<WindowEntry | null>("window_get_state", { label });
    if (entry && Array.isArray(entry.workspaces) && entry.workspaces.length > 0) {
      cached = { workspaces: entry.workspaces, activeIndex: entry.activeIndex };
    }
  } catch {
    cached = null;
  }
}

export function getSavedWorkspaceState(): SavedState | null {
  return cached;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function saveWorkspaceState(workspaces: Workspace[], activeIndex: number): void {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const label = getCurrentWebviewWindow().label;
    void invoke("window_save_workspace_state", {
      label,
      workspaces: workspaces.map(sanitizeWorkspace),
      // Rust param name is active_index (snake_case); Tauri 2 does NOT auto-convert.
      // eslint-disable-next-line camelcase
      active_index: Math.max(0, Math.min(activeIndex, workspaces.length - 1)),
    }).catch(() => {});
  }, 800);
}
```

Note on snake_case: Tauri 2 does not auto-convert camelCase to snake_case for command parameter names. The `active_index` key must match the Rust parameter name exactly. The eslint-disable comment suppresses any linting rule against snake_case in object literals.

- [ ] **Step 2: Check TypeScript types**

```bash
pnpm check-types 2>&1
```

Expected: no errors.

- [ ] **Step 3: Run lint**

```bash
pnpm lint 2>&1
```

Expected: no errors. If the eslint-disable comment triggers a lint warning itself, adjust to match the project's eslint config (check `.eslintrc.*` or `eslint.config.*`).

- [ ] **Step 4: Commit**

```bash
git add src/modules/workspaces/lib/workspaceState.ts
git commit -m "feat: replace LazyStore workspace persistence with window_get_state IPC"
```

---

## Task 5: Full verification

- [ ] **Step 1: Full Rust check**

```bash
cd src-tauri && cargo clippy 2>&1 && cargo test --locked 2>&1
```

Expected: no warnings, all tests pass.

- [ ] **Step 2: Full frontend check**

```bash
pnpm lint && pnpm check-types && pnpm test 2>&1
```

Expected: no errors, all tests pass.

- [ ] **Step 3: Manual smoke test**

Build and launch the app:
```bash
pnpm tauri dev 2>&1
```

Verify:
1. App opens a single window with label starting with `w-` (check dev tools or Tauri logs)
2. Open a second window (shortcut for `window.new`) — it gets its own `w-` label
3. Open settings — it appears centered on the active window
4. Close settings — it closes cleanly
5. Close all main windows — settings closes if open (test this)
6. Reopen the app — both previously open windows restore with their last size, position, and workspace tabs
7. Check `~/Library/Application Support/app.betauer.kex/terax-windows.json` — contains both window entries with correct data
8. Check the same directory — `.window-state.json` still exists but is not updated anymore (inert)

- [ ] **Step 4: Final commit**

```bash
git add -p
git commit -m "chore: verify multi-window state end-to-end"
```
