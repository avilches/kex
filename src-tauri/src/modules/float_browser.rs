use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use serde_json::json;

#[derive(Debug)]
pub struct FloatMeta {
    pub origin_window_label: String,
    pub workspace_id: String,
}

pub struct FloatBrowserState {
    // panel_id -> meta
    pub panels: Mutex<HashMap<String, FloatMeta>>,
    // panel_id of the float window that last had OS focus (for menu "Dock to Kex")
    pub last_focused_panel_id: Mutex<Option<String>>,
}

impl Default for FloatBrowserState {
    fn default() -> Self {
        Self {
            panels: Mutex::new(HashMap::new()),
            last_focused_panel_id: Mutex::new(None),
        }
    }
}

impl FloatBrowserState {
    pub fn new() -> Self {
        Self::default()
    }
}

pub fn window_label(panel_id: &str) -> String {
    format!("float-{}", panel_id)
}

#[tauri::command]
pub fn float_browser_open(
    app: AppHandle,
    state: State<'_, FloatBrowserState>,
    panel_id: String,
    url: String,
    origin_window_label: String,
    workspace_id: String,
) -> Result<(), String> {
    let label = window_label(&panel_id);

    // If already open, focus it and return
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.set_focus();
        return Ok(());
    }

    let parsed_url: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;

    let panel_id_nav = panel_id.clone();
    let origin_nav = origin_window_label.clone();
    let app_nav = app.clone();

    let panel_id_close = panel_id.clone();
    let origin_close = origin_window_label.clone();
    let app_close = app.clone();
    let label_close = label.clone();

    let panel_id_focus = panel_id.clone();
    let app_focus = app.clone();

    let window = WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::External(parsed_url),
    )
    .title("Kex Browser")
    .inner_size(1200.0, 800.0)
    .min_inner_size(640.0, 480.0)
    .resizable(true)
    .on_page_load(move |_webview, payload| {
        use tauri::webview::PageLoadEvent;
        if matches!(payload.event(), PageLoadEvent::Finished) {
            if let Some(origin_win) = app_nav.get_webview_window(&origin_nav) {
                let _ = origin_win.emit(
                    "kex:float-navigated",
                    json!({
                        "panelId": panel_id_nav,
                        "url": payload.url().to_string(),
                    }),
                );
            }
        }
    })
    .build()
    .map_err(|e| e.to_string())?;

    // Track last focused float window for the "Dock to Kex" menu item
    window.on_window_event({
        let app_f = app_focus.clone();
        let pid = panel_id_focus.clone();
        move |event| {
            if let WindowEvent::Focused(true) = event {
                let st = app_f.state::<FloatBrowserState>();
                *st.last_focused_panel_id.lock().unwrap() = Some(pid.clone());
            }
        }
    });

    // Dock back on window close (X button)
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            do_dock_and_destroy(&app_close, &panel_id_close, &origin_close, &label_close);
        }
    });

    {
        let mut map = state.panels.lock().unwrap();
        map.insert(
            panel_id,
            FloatMeta {
                origin_window_label,
                workspace_id,
            },
        );
    }

    Ok(())
}

/// Shared logic: remove from state, emit kex:float-dock to origin, destroy window.
/// Idempotent: if the panel is already gone from state (concurrent call), returns early.
pub fn do_dock_and_destroy(
    app: &AppHandle,
    panel_id: &str,
    origin_label: &str,
    win_label: &str,
) {
    {
        let st = app.state::<FloatBrowserState>();
        let mut map = st.panels.lock().unwrap();
        if map.remove(panel_id).is_none() {
            return;
        }
        let mut focused = st.last_focused_panel_id.lock().unwrap();
        if focused.as_deref() == Some(panel_id) {
            *focused = None;
        }
    }

    let current_url = app
        .get_webview_window(win_label)
        .and_then(|w| w.url().ok())
        .map(|u| u.to_string())
        .unwrap_or_default();

    if let Some(origin_win) = app.get_webview_window(origin_label) {
        let _ = origin_win.emit(
            "kex:float-dock",
            json!({ "panelId": panel_id, "currentUrl": current_url }),
        );
    }

    if let Some(win) = app.get_webview_window(win_label) {
        let _ = win.destroy();
    }
}

#[tauri::command]
pub fn float_browser_close(
    app: AppHandle,
    state: State<'_, FloatBrowserState>,
    panel_id: String,
) -> Result<(), String> {
    let label = window_label(&panel_id);
    {
        let mut map = state.panels.lock().unwrap();
        map.remove(&panel_id);
        let mut focused = state.last_focused_panel_id.lock().unwrap();
        if focused.as_deref() == Some(&panel_id) {
            *focused = None;
        }
    }
    if let Some(window) = app.get_webview_window(&label) {
        window.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn float_browser_focus(
    app: AppHandle,
    panel_id: String,
) -> Result<(), String> {
    let label = window_label(&panel_id);
    if let Some(window) = app.get_webview_window(&label) {
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn float_browser_navigate(
    app: AppHandle,
    panel_id: String,
    url: String,
) -> Result<(), String> {
    let parsed_url: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
    let label = window_label(&panel_id);
    if let Some(window) = app.get_webview_window(&label) {
        window.navigate(parsed_url).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn float_browser_dock(
    app: AppHandle,
    state: State<'_, FloatBrowserState>,
    panel_id: String,
) -> Result<(), String> {
    let label = window_label(&panel_id);
    let origin_label = {
        let map = state.panels.lock().unwrap();
        map.get(&panel_id).map(|m| m.origin_window_label.clone())
    }
    .ok_or_else(|| format!("no float window for panel {}", panel_id))?;

    do_dock_and_destroy(&app, &panel_id, &origin_label, &label);
    Ok(())
}
