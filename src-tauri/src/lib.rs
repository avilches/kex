pub mod modules;

use modules::{agent, float_browser, fs, git, history, pty, shell, window_state, workspace};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

/// Drained on first read so HMR / re-mounts can't replay the launch dir.
#[derive(Default)]
struct LaunchDir(Mutex<Option<String>>);

/// Set once the frontend has been asked to flush before an app quit (Cmd+Q),
/// so the deferred `ExitRequested` is allowed through on the second pass.
#[derive(Default)]
struct QuitGuard(AtomicBool);

/// Called by the frontend once it has flushed editors and workspace state in
/// response to `kex:before-quit`, to let the deferred quit proceed.
#[tauri::command]
fn confirm_quit(app: tauri::AppHandle) {
    app.state::<QuitGuard>().0.store(true, Ordering::SeqCst);
    app.exit(0);
}

/// macOS-only: handles to menu items whose labels track app state.
#[cfg(target_os = "macos")]
struct DynMenuItems {
    autosave: tauri::menu::MenuItem<tauri::Wry>,
    sidebar: tauri::menu::MenuItem<tauri::Wry>,
    explorer: tauri::menu::MenuItem<tauri::Wry>,
    git: tauri::menu::MenuItem<tauri::Wry>,
    history: tauri::menu::MenuItem<tauri::Wry>,
    panel_side: tauri::menu::MenuItem<tauri::Wry>,
}

#[cfg(target_os = "macos")]
#[derive(Default)]
struct MenuHandles(Mutex<Option<DynMenuItems>>);

/// Snapshot pushed from the frontend whenever the relevant preferences change,
/// so the native menu labels stay in sync (Show/Hide, Enable/Disable, side).
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct MenuState {
    autosave: bool,
    sidebar_open: bool,
    active_tab: String,
    panel_side: String,
}

#[tauri::command]
fn sync_menu(app: tauri::AppHandle, state: MenuState) {
    #[cfg(target_os = "macos")]
    {
        let handles = app.state::<MenuHandles>();
        let guard = handles.0.lock().expect("MenuHandles mutex poisoned");
        let Some(items) = guard.as_ref() else { return };
        let _ = items.autosave.set_text(if state.autosave {
            "Disable Autosave"
        } else {
            "Enable Autosave"
        });
        let _ = items.sidebar.set_text(if state.sidebar_open {
            "Hide Sidebar"
        } else {
            "Show Sidebar"
        });
        let on = |tab: &str| state.sidebar_open && state.active_tab == tab;
        let _ = items
            .explorer
            .set_text(if on("explorer") { "Hide Explorer" } else { "Show Explorer" });
        let _ = items
            .git
            .set_text(if on("git") { "Hide Git" } else { "Show Git" });
        let _ = items
            .history
            .set_text(if on("history") { "Hide History" } else { "Show History" });
        let _ = items.panel_side.set_text(if state.panel_side == "left" {
            "Move Sidebar to Right"
        } else {
            "Move Sidebar to Left"
        });
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, state);
}

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
    let geo = entry.map(|e| &e.geometry);
    let width = geo.map(|g| g.width as f64).unwrap_or(1280.0);
    let height = geo.map(|g| g.height as f64).unwrap_or(800.0);
    let ws_count = entry
        .and_then(|e| e.workspaces.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    log::info!(
        "[window] create_app_window: label={label} size={width}x{height} workspaces={ws_count}"
    );

    // Size only in the builder — position is applied on first Focused(true) to work
    // around macOS cascade which overrides any position set before or at show().
    let builder =
        WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
            .title("Kex")
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

    // Save geometry on close; remove from state only if other windows remain open.
    // When the last window closes (app quit), keep the state so it restores next launch.
    let app_handle = app.clone();
    let win_label = label.clone();
    window.on_window_event(move |event| match event {
        // Save size on focus and resize. Position is intentionally not persisted —
        // reliable cross-monitor restore on macOS is unsolved (see WORKSPACES_GOTCHAS.md).
        WindowEvent::Focused(true) | WindowEvent::Resized(_) => {
            let mgr = app_handle.state::<window_state::WindowStateManager>();
            if matches!(event, WindowEvent::Focused(true)) {
                mgr.set_focused_window(&win_label);
                // Consume any pending OS-notification navigation and route to the target window.
                // Only main windows (label starts with "w-") trigger this; settings window is ignored.
                if win_label.starts_with("w-") {
                    let nav_state = app_handle.state::<agent::PendingNavState>();
                    if let Some(nav) = nav_state.take_if_fresh() {
                        if let Some(target) = app_handle.get_webview_window(&nav.window_label) {
                            let _ = target.set_focus();
                            let _ = target.emit("kex:activate-panel", serde_json::json!({
                                "workspaceId": nav.workspace_id,
                                "panelId": nav.panel_id,
                            }));
                        }
                    }
                }
            }
            if let Some(w) = app_handle.get_webview_window(&win_label) {
                let maximized = w.is_maximized().unwrap_or(false);
                if let Ok(size) = w.inner_size() {
                    mgr.update_geometry(&win_label, size.width, size.height, maximized);
                }
            }
            mgr.save();
        }
        WindowEvent::CloseRequested { .. } => {
            let mgr = app_handle.state::<window_state::WindowStateManager>();
            if let Some(w) = app_handle.get_webview_window(&win_label) {
                let maximized = w.is_maximized().unwrap_or(false);
                if let Ok(size) = w.inner_size() {
                    mgr.update_geometry(&win_label, size.width, size.height, maximized);
                    mgr.save();
                }
            }
        }
        WindowEvent::Destroyed => {
            // Count live main windows after this one is gone.
            let live = app_handle
                .webview_windows()
                .into_keys()
                .filter(|l| l.starts_with("w-"))
                .count();
            let mgr = app_handle.state::<window_state::WindowStateManager>();
            if live > 0 {
                // User closed one window while others are open — remove from state.
                log::info!("[window] Destroyed {win_label}: {live} window(s) remain, removing from state");
                mgr.remove_window(&win_label);
                mgr.save();
            } else {
                // Last window closed (app quit) — keep state to restore next launch.
                log::info!("[window] Destroyed {win_label}: last window, keeping state for restore");
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
            let _ = window.emit("kex:settings-tab", t);
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
                let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
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
    let entry = app.state::<window_state::WindowStateManager>().get_entry(&label);
    match &entry {
        Some(e) => {
            let ws = e.workspaces.as_array().map(|a| a.len()).unwrap_or(0);
            log::info!("[window] window_get_state: label={label} → found ({ws} workspace(s))");
        }
        None => log::warn!("[window] window_get_state: label={label} → NOT FOUND in state"),
    }
    entry
}

#[tauri::command]
fn window_save_workspace_state(
    app: tauri::AppHandle,
    label: String,
    workspaces: serde_json::Value,
    active_index: usize,
) {
    let ws_count = workspaces.as_array().map(|a| a.len()).unwrap_or(0);
    log::debug!("[window] save workspace state: label={label} workspaces={ws_count} activeIndex={active_index}");
    let mgr = app.state::<window_state::WindowStateManager>();
    mgr.update_workspace(&label, workspaces, active_index);
    mgr.save();
}

/// Called from main.tsx on startup (on_window_ready equivalent) to restore window size.
/// Uses physical pixels from inner_size(), matching tauri-plugin-window-state behaviour.
/// Position is not restored — see WORKSPACES_GOTCHAS.md for why.
#[tauri::command]
fn restore_window_geometry(webview_window: tauri::WebviewWindow, app: tauri::AppHandle) {
    let label = webview_window.label().to_string();
    let mgr = app.state::<window_state::WindowStateManager>();
    let Some(entry) = mgr.get_entry(&label) else { return };
    let g = &entry.geometry;
    log::debug!("[window] restore size for {label}: {}x{} maximized={}", g.width, g.height, g.maximized);
    if g.maximized {
        let _ = webview_window.maximize();
    } else if g.width > 0 && g.height > 0 {
        let _ = webview_window.set_size(tauri::PhysicalSize::new(g.width, g.height));
    }
}

#[tauri::command]
fn agent_session_restore_plan() -> Vec<agent::session_store::RestorePlan> {
    log::debug!("[agent-session] agent_session_restore_plan invoked");
    let plans = agent::session_store::load_restore_plan();
    log::info!("[agent-session] restore: {} plan(s) ready for frontend", plans.len());
    plans
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
                .level_for("kex_lib::modules::agent", tauri_plugin_log::log::LevelFilter::Debug)
                .level_for("kex_lib::modules::pty::agent_detect", tauri_plugin_log::log::LevelFilter::Debug)
                .level_for("kex_lib::modules::pty::ipc", tauri_plugin_log::log::LevelFilter::Debug)
                .target(tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview))
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // macOS: the predefined Quit menu item (Cmd+Q) terminates natively and
            // never fires ExitRequested (tauri#12978), so prevent_exit can't run our
            // flush. Replace the menu with a custom Quit we intercept in on_menu_event.
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{
                    MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
                };

                // Kex (app menu)
                let about = PredefinedMenuItem::about(app, None, None)?;
                let settings = MenuItemBuilder::with_id("settings", "Settings...")
                    .accelerator("Cmd+,")
                    .build(app)?;
                let quit = MenuItemBuilder::with_id("quit", "Quit Kex")
                    .accelerator("Cmd+Q")
                    .build(app)?;
                let app_menu = SubmenuBuilder::new(app, "Kex")
                    .item(&about)
                    .separator()
                    .item(&settings)
                    .separator()
                    .item(&quit)
                    .build()?;

                // File
                let new_workspace = MenuItemBuilder::with_id("new_workspace", "New Workspace")
                    .accelerator("Cmd+N")
                    .build(app)?;
                let new_terminal = MenuItemBuilder::with_id("new_terminal", "New Terminal Tab")
                    .accelerator("Cmd+T")
                    .build(app)?;
                let new_browser = MenuItemBuilder::with_id("new_browser", "New Browser Tab")
                    .accelerator("Cmd+Shift+O")
                    .build(app)?;
                let autosave =
                    MenuItemBuilder::with_id("toggle_autosave", "Enable Autosave").build(app)?;
                let close_tab = MenuItemBuilder::with_id("close_tab", "Close Tab")
                    .accelerator("Cmd+W")
                    .build(app)?;
                let close_others =
                    MenuItemBuilder::with_id("close_others", "Close Other Tabs").build(app)?;
                let close_all =
                    MenuItemBuilder::with_id("close_all", "Close All Tabs").build(app)?;
                let file_menu = SubmenuBuilder::new(app, "File")
                    .item(&new_workspace)
                    .item(&new_terminal)
                    .item(&new_browser)
                    .separator()
                    .item(&autosave)
                    .separator()
                    .item(&close_tab)
                    .item(&close_others)
                    .item(&close_all)
                    .build()?;

                // Edit
                let edit_menu = SubmenuBuilder::new(app, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;

                // View (labels synced from the frontend via sync_menu)
                let sidebar =
                    MenuItemBuilder::with_id("toggle_sidebar", "Hide Sidebar").build(app)?;
                let explorer = MenuItemBuilder::with_id("toggle_explorer", "Hide Explorer")
                    .accelerator("Cmd+E")
                    .build(app)?;
                let git = MenuItemBuilder::with_id("toggle_git", "Show Git")
                    .accelerator("Cmd+G")
                    .build(app)?;
                let history =
                    MenuItemBuilder::with_id("toggle_history", "Show History").build(app)?;
                let panel_side =
                    MenuItemBuilder::with_id("toggle_panel_side", "Move Sidebar to Left")
                        .build(app)?;
                let view_menu = SubmenuBuilder::new(app, "View")
                    .item(&sidebar)
                    .item(&explorer)
                    .item(&git)
                    .item(&history)
                    .separator()
                    .item(&panel_side)
                    .build()?;

                // Window
                let dock_to_kex = MenuItemBuilder::with_id("dock_to_kex", "Dock to Kex")
                    .build(app)?;
                let window_menu = SubmenuBuilder::new(app, "Window")
                    .minimize()
                    .separator()
                    .item(&dock_to_kex)
                    .separator()
                    .close_window()
                    .build()?;

                let menu = MenuBuilder::new(app)
                    .items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu])
                    .build()?;
                app.set_menu(menu)?;

                app.manage(MenuHandles(Mutex::new(Some(DynMenuItems {
                    autosave,
                    sidebar,
                    explorer,
                    git,
                    history,
                    panel_side,
                }))));

                app.on_menu_event(|app, event| {
                    let id = event.id().as_ref();
                    if id == "quit" {
                        let _ = app.emit("kex:before-quit", ());
                        return;
                    }
                    if id == "dock_to_kex" {
                        let st = app.state::<float_browser::FloatBrowserState>();
                        let panel_id = st.last_focused_panel_id.lock().unwrap().clone();
                        if let Some(pid) = panel_id {
                            let label = float_browser::window_label(&pid);
                            let origin = {
                                let map = st.panels.lock().unwrap();
                                map.get(&pid).map(|m| m.origin_window_label.clone())
                            };
                            if let Some(origin_label) = origin {
                                float_browser::do_dock_and_destroy(app, &pid, &origin_label, &label);
                            }
                        }
                        return;
                    }
                    // Route the action to the current window only, so it never fans
                    // out across every open window. emit_to targets a single label;
                    // plain emit (even on a window) would broadcast to all webviews.
                    let mgr = app.state::<window_state::WindowStateManager>();
                    if let Some(label) = mgr.get_focused_window() {
                        let _ = app.emit_to(label.as_str(), "kex:menu", id.to_string());
                    }
                });
            }

            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| std::io::Error::other(e.to_string()))?;
            agent::session_store::init(data_dir.clone());
            let state_path = data_dir.join("workspaces.json");
            let mgr = window_state::WindowStateManager::new(state_path);
            mgr.load();
            let order = mgr.window_order();
            app.manage(mgr);

            let handle = app.handle().clone();
            if order.is_empty() {
                let id = window_state::generate_window_id();
                let mgr = handle.state::<window_state::WindowStateManager>();
                mgr.add_window(id.clone());
                mgr.save();
                create_app_window(&handle, id, None)
                    .map_err(std::io::Error::other)?;
            } else {
                let focused_label = handle
                    .state::<window_state::WindowStateManager>()
                    .get_focused_window();
                let entries: Vec<_> = {
                    let m = handle.state::<window_state::WindowStateManager>();
                    order.iter().map(|id| (id.clone(), m.get_entry(id))).collect()
                };
                for (id, entry) in entries {
                    if let Err(e) = create_app_window(&handle, id.clone(), entry.as_ref()) {
                        eprintln!("kex: failed to restore window {id}: {e}");
                    }
                }
                // Re-focus the window that had focus when the app last closed.
                // create_app_window calls set_focus() on each window, so without
                // this the last-created window would have focus instead.
                let target = focused_label
                    .as_deref()
                    .and_then(|l| handle.get_webview_window(l))
                    .or_else(|| {
                        // Fallback: focus the first window in order.
                        order.first().and_then(|l| handle.get_webview_window(l))
                    });
                if let Some(w) = target {
                    let _ = w.set_focus();
                }
            }
            Ok(())
        })
        .manage(pty::PtyState::default())
        .manage(shell::ShellState::default())
        .manage(fs::watch::FsWatchState::default())
        .manage(history::HistoryState::default())
        .manage(fs::grep::ContentSearchState::default())
        .manage(fs::search::FileSearchState::default())
        .manage({
            let registry = workspace::WorkspaceRegistry::default();
            workspace::bootstrap_registry(&registry);
            if let Some(ref launch_dir) = cli_dir {
                let _ = registry.authorize(launch_dir);
            }
            registry
        })
        .manage(agent::PendingNavState::default())
        .manage(QuitGuard::default())
        .manage(LaunchDir(Mutex::new(cli_dir)))
        .manage(float_browser::FloatBrowserState::new())
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
            fs::mutate::fs_copy,
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
            git::commands::git_mv,
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
            confirm_quit,
            sync_menu,
            open_settings_window,
            open_main_window,
            window_get_state,
            window_save_workspace_state,
            restore_window_geometry,
            agent::agent_enable_claude_hooks,
            agent::agent_disable_claude_hooks,
            agent::agent_claude_hooks_status,
            agent::agent_detach_session,
            agent::pending_nav::agent_queue_nav,
            agent_session_restore_plan,
            history::history_suggest,
            history::history_commands,
            history::history_record,
            history::history_list,
            float_browser::float_browser_open,
            float_browser::float_browser_close,
            float_browser::float_browser_focus,
            float_browser::float_browser_dock,
            float_browser::float_browser_navigate,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Cmd+Q / menu Quit raise ExitRequested at the app level, bypassing
            // each window's CloseRequested (and the JS flush wired to it). Defer
            // the quit once so the frontend can flush dirty editors and workspace
            // state, then let it proceed on the second pass.
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                let guard = app_handle.state::<QuitGuard>();
                if guard.0.load(Ordering::SeqCst) {
                    return;
                }
                let has_main = app_handle
                    .webview_windows()
                    .keys()
                    .any(|l| l.starts_with("w-"));
                if !has_main {
                    return;
                }
                guard.0.store(true, Ordering::SeqCst);
                api.prevent_exit();
                let _ = app_handle.emit("kex:before-quit", ());
            }
        });
}
