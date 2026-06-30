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
    // tab_id -> meta
    pub tabs: Mutex<HashMap<String, FloatMeta>>,
    // tab_id of the float window that currently holds OS focus, or None when a
    // non-float window is focused. Drives the "Dock Browser" menu item.
    pub focused_float_tab_id: Mutex<Option<String>>,
}

impl Default for FloatBrowserState {
    fn default() -> Self {
        Self {
            tabs: Mutex::new(HashMap::new()),
            focused_float_tab_id: Mutex::new(None),
        }
    }
}

impl FloatBrowserState {
    pub fn new() -> Self {
        Self::default()
    }
}

pub fn window_label(tab_id: &str) -> String {
    format!("float-{}", tab_id)
}

#[tauri::command]
pub fn float_browser_open(
    app: AppHandle,
    state: State<'_, FloatBrowserState>,
    tab_id: String,
    url: String,
    origin_window_label: String,
    workspace_id: String,
) -> Result<(), String> {
    let label = window_label(&tab_id);

    // If already open, focus it and return
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.set_focus();
        return Ok(());
    }

    let parsed_url: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;

    let tab_id_nav = tab_id.clone();
    let origin_nav = origin_window_label.clone();
    let app_nav = app.clone();

    let tab_id_close = tab_id.clone();
    let origin_close = origin_window_label.clone();
    let app_close = app.clone();
    let label_close = label.clone();

    let tab_id_focus = tab_id.clone();
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
                        "tabId": tab_id_nav,
                        "url": payload.url().to_string(),
                    }),
                );
            }
        }
    })
    .build()
    .map_err(|e| e.to_string())?;

    // Track which float window holds OS focus so the "Dock Browser" menu item
    // reflects the active float and greys out when focus leaves it.
    window.on_window_event({
        let app_f = app_focus.clone();
        let tid = tab_id_focus.clone();
        move |event| {
            if let WindowEvent::Focused(focused) = event {
                let st = app_f.state::<FloatBrowserState>();
                {
                    let mut cur = st.focused_float_tab_id.lock().unwrap();
                    if *focused {
                        *cur = Some(tid.clone());
                    } else if cur.as_deref() == Some(tid.as_str()) {
                        *cur = None;
                    }
                }
                crate::refresh_dock_menu(&app_f);
            }
        }
    });

    // Dock back on window close (X button)
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            do_dock_and_destroy(&app_close, &tab_id_close, &origin_close, &label_close);
        }
    });

    {
        let mut map = state.tabs.lock().unwrap();
        map.insert(
            tab_id,
            FloatMeta {
                origin_window_label,
                workspace_id,
            },
        );
    }
    crate::refresh_dock_menu(&app);

    Ok(())
}

/// Shared logic: remove from state, emit kex:float-dock to origin, destroy window.
/// Idempotent: if the tab is already gone from state (concurrent call), returns early.
pub fn do_dock_and_destroy(
    app: &AppHandle,
    tab_id: &str,
    origin_label: &str,
    win_label: &str,
) {
    {
        let st = app.state::<FloatBrowserState>();
        let mut map = st.tabs.lock().unwrap();
        if map.remove(tab_id).is_none() {
            return;
        }
        let mut focused = st.focused_float_tab_id.lock().unwrap();
        if focused.as_deref() == Some(tab_id) {
            *focused = None;
        }
    }
    crate::refresh_dock_menu(app);

    let current_url = app
        .get_webview_window(win_label)
        .and_then(|w| w.url().ok())
        .map(|u| u.to_string())
        .unwrap_or_default();

    if let Some(origin_win) = app.get_webview_window(origin_label) {
        let _ = origin_win.emit(
            "kex:float-dock",
            json!({ "tabId": tab_id, "currentUrl": current_url }),
        );
    }

    if let Some(win) = app.get_webview_window(win_label) {
        let _ = win.destroy();
    }
}

/// Dock the float window that currently holds OS focus, if any.
pub fn dock_focused(app: &AppHandle) {
    let st = app.state::<FloatBrowserState>();
    let tab_id = st.focused_float_tab_id.lock().unwrap().clone();
    let Some(tid) = tab_id else { return };
    let origin = {
        let map = st.tabs.lock().unwrap();
        map.get(&tid).map(|m| m.origin_window_label.clone())
    };
    if let Some(origin_label) = origin {
        let label = window_label(&tid);
        do_dock_and_destroy(app, &tid, &origin_label, &label);
    }
}

/// Dock every open float window back to its origin.
pub fn dock_all(app: &AppHandle) {
    let st = app.state::<FloatBrowserState>();
    let entries: Vec<(String, String)> = {
        let map = st.tabs.lock().unwrap();
        map.iter()
            .map(|(tid, m)| (tid.clone(), m.origin_window_label.clone()))
            .collect()
    };
    for (tid, origin) in entries {
        let label = window_label(&tid);
        do_dock_and_destroy(app, &tid, &origin, &label);
    }
}

#[tauri::command]
pub fn float_browser_close(
    app: AppHandle,
    state: State<'_, FloatBrowserState>,
    tab_id: String,
) -> Result<(), String> {
    let label = window_label(&tab_id);
    {
        let mut map = state.tabs.lock().unwrap();
        map.remove(&tab_id);
        let mut focused = state.focused_float_tab_id.lock().unwrap();
        if focused.as_deref() == Some(&tab_id) {
            *focused = None;
        }
    }
    crate::refresh_dock_menu(&app);
    if let Some(window) = app.get_webview_window(&label) {
        window.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn float_browser_focus(
    app: AppHandle,
    tab_id: String,
) -> Result<(), String> {
    let label = window_label(&tab_id);
    if let Some(window) = app.get_webview_window(&label) {
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn float_browser_navigate(
    app: AppHandle,
    tab_id: String,
    url: String,
) -> Result<(), String> {
    let parsed_url: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
    let label = window_label(&tab_id);
    if let Some(window) = app.get_webview_window(&label) {
        window.navigate(parsed_url).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn float_browser_dock(
    app: AppHandle,
    state: State<'_, FloatBrowserState>,
    tab_id: String,
) -> Result<(), String> {
    let label = window_label(&tab_id);
    let origin_label = {
        let map = state.tabs.lock().unwrap();
        map.get(&tab_id).map(|m| m.origin_window_label.clone())
    }
    .ok_or_else(|| format!("no float window for tab {}", tab_id))?;

    do_dock_and_destroy(&app, &tab_id, &origin_label, &label);
    Ok(())
}
