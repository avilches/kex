pub mod agents;
pub mod catalog;
pub mod detect;

use detect::DetectedEditor;

/// Scans the system for installed editors and returns those found.
/// Runs detection synchronously on a blocking thread to avoid blocking the async runtime.
#[tauri::command]
pub async fn editor_scan() -> Result<Vec<DetectedEditor>, String> {
    tauri::async_runtime::spawn_blocking(detect::detect_all)
        .await
        .map_err(|e| e.to_string())
}
