use tauri::{AppHandle, Emitter, Manager};

fn activate_tab(app: &AppHandle, window_label: &str, workspace_id: &str, tab_id: &str) {
    let Some(win) = app.get_webview_window(window_label) else {
        return;
    };
    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_focus();
    let _ = win.emit(
        "kex:activate-tab",
        serde_json::json!({ "workspaceId": workspace_id, "tabId": tab_id }),
    );
}

// Blocks one thread until the user interacts with the notification, so it
// runs off the command thread. Only a direct click on the notification
// navigates; focusing the app by any other means never does.
#[cfg(target_os = "macos")]
fn show(
    app: AppHandle,
    window_label: String,
    workspace_id: String,
    tab_id: String,
    title: String,
    body: String,
) {
    use mac_notification_sys::{
        send_notification, set_application, Notification, NotificationResponse,
    };

    let identifier = app.config().identifier.clone();
    std::thread::spawn(move || {
        let _ = set_application(if tauri::is_dev() {
            "com.apple.Terminal"
        } else {
            &identifier
        });
        let mut options = Notification::new();
        options.wait_for_click(true);
        if let Ok(NotificationResponse::Click) =
            send_notification(&title, None, &body, Some(&options))
        {
            activate_tab(&app, &window_label, &workspace_id, &tab_id);
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn show(
    app: AppHandle,
    _window_label: String,
    _workspace_id: String,
    _tab_id: String,
    title: String,
    body: String,
) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

#[tauri::command]
pub fn agent_os_notify(
    app: AppHandle,
    window_label: String,
    workspace_id: String,
    tab_id: String,
    title: String,
    body: String,
) {
    show(app, window_label, workspace_id, tab_id, title, body);
}
