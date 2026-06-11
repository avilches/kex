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
                .map_err(|e| std::io::Error::other(e.to_string()))?;
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
                    .map_err(std::io::Error::other)?;
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
